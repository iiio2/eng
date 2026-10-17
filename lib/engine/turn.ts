import { logId } from "@/lib/auth";
import { config } from "@/lib/config";
import { getSkill } from "@/lib/curriculum/curriculum";
import {
  currentDifficulty,
  pickTargetItem,
  recordAnswer,
  type ProgressUpdate,
} from "@/lib/curriculum/progression";
import { decideMode, nextModeState, type ModeDecision, type ModeReason } from "@/lib/detection/mode";
import { detectSignals, type Signals } from "@/lib/detection/signals";
import {
  checkAnswer,
  isPracticeAnswer,
  itemAskedInReply,
  reconcileAnswer,
  type AnswerCheck,
} from "@/lib/engine/answers";
import { withLock } from "@/lib/engine/lock";
import { analyzeMessage, type Analysis, type AnalyzerInput } from "@/lib/llm/analyzer";
import { buildTutorSystemPrompt, type PracticeTarget } from "@/lib/llm/prompts";
import { streamTutorReply, type TutorInput } from "@/lib/llm/tutor";
import { childStore, type ChildStore } from "@/lib/memory/store";
import type { AnswerResult, ChildProfile, Level, Mode, Mood } from "@/lib/types";

export interface EngineLimits {
  firstTokenTimeoutMs: number;
  streamIdleTimeoutMs: number;
  responseBudgetMs: number;
  analyzerTimeoutMs: number;
}

export interface EngineDeps {
  store: ChildStore;
  streamReply: (input: TutorInput, signal?: AbortSignal) => AsyncIterable<string>;
  analyze: (input: AnalyzerInput, signal?: AbortSignal) => Promise<Analysis>;
  now: () => number;
  limits: EngineLimits;
}

export const defaultDeps: EngineDeps = {
  store: childStore,
  streamReply: streamTutorReply,
  analyze: analyzeMessage,
  now: Date.now,
  limits: {
    firstTokenTimeoutMs: config.firstTokenTimeoutMs,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    responseBudgetMs: config.responseBudgetMs,
    analyzerTimeoutMs: config.analyzerTimeoutMs,
  },
};

export class ChildNotFoundError extends Error {
  constructor(childId: string) {
    super(`Child profile not found: ${childId}`);
    this.name = "ChildNotFoundError";
  }
}

class DeadlineError extends Error {
  constructor(what: string) {
    super(`Tutor ${what} deadline exceeded`);
    this.name = "DeadlineError";
  }
}

export interface TurnStart {
  mode: Mode;
  reason: ModeReason;
  level: Level;
}

export interface TurnResult extends TurnStart {
  reply: string;
  levelUp: Level | null;
  mood: Mood;
  assessment: { skillId: string; item: string; result: AnswerResult } | null;
  safetyConcern: boolean;
  /** True when the model failed or timed out and the reply is a fallback or cut short. */
  degraded: boolean;
  /** True when the client disconnected before the reply finished. */
  interrupted: boolean;
  /** True when `done` was sent before the analyzer finished; its results are saved afterwards. */
  analysisPending: boolean;
  timing: { ttftMs: number | null; replyMs: number; analyzerMs: number | null; totalMs: number };
}

export interface TurnHandlers {
  onStart?: (start: TurnStart) => void;
  onToken?: (text: string) => void;
  /** Called exactly once (unless interrupted), within the response budget. */
  onDone?: (result: TurnResult) => void;
}

const FALLBACK_REPLY = "Oops, my ears got a little sleepy! Can you say that again? 🙂";

const isPractice = (mode: Mode) => mode === "learning" || mode === "engagement";

/**
 * Decide what to practise *after* checking the last answer, so the prompt asks
 * for exactly one thing: the next item when the answer was right, the same item
 * when the child said a different one, or either (tutor decides) when unknown.
 */
export function choosePracticeTarget(
  profile: ChildProfile,
  mode: Mode,
  pending: ChildProfile["lastTarget"],
  check: AnswerCheck | null,
): PracticeTarget | null {
  if (!isPractice(mode)) return null;
  const skill = getSkill(profile.currentSkillId);
  const next = pickTargetItem(profile, pending?.item);
  if (mode !== "learning" || !pending || check?.verdict === "correct") {
    return { skill, item: next, retry: null };
  }
  if (check?.verdict === "other-item" && pending.skillId === skill.id) {
    return { skill, item: pending.item, retry: null };
  }
  return { skill, item: next, retry: pending.item };
}

export async function runTurn(
  childId: string,
  message: string,
  handlers: TurnHandlers = {},
  opts: { signal?: AbortSignal } = {},
  deps: EngineDeps = defaultDeps,
): Promise<TurnResult> {
  return withLock(childId, async () => {
    const { limits } = deps;
    const startedAt = deps.now();
    const profile = await deps.store.get(childId);
    if (!profile) throw new ChildNotFoundError(childId);

    // ── 1. Fast, synchronous decisions (no LLM) ──────────────────────
    const isNewSession =
      profile.lastActiveAt === null || startedAt - profile.lastActiveAt > config.sessionGapMs;
    if (isNewSession) profile.sessionTurns = 0;

    const signals = detectSignals(message);
    const previousMode = profile.mode.current;
    // What the child may be answering: only the last reply's prompt, same session.
    const pendingTarget = !isNewSession && isPractice(previousMode) ? profile.lastTarget : null;
    const pendingSkill = pendingTarget ? getSkill(pendingTarget.skillId) : null;
    const check = pendingTarget && pendingSkill ? checkAnswer(message, pendingSkill, pendingTarget.item) : null;
    const answeringTarget =
      !!pendingTarget && !!pendingSkill && isPracticeAnswer(message, pendingSkill, pendingTarget.item);

    const decision = decideMode(signals, profile, { isNewSession, answeringTarget });
    const target = choosePracticeTarget(profile, decision.mode, pendingTarget, check);

    const systemPrompt = buildTutorSystemPrompt({
      profile,
      decision,
      previousMode,
      target,
      lastAsked:
        pendingTarget && pendingSkill ? { item: pendingTarget.item, skill: pendingSkill, check } : null,
      difficulty: currentDifficulty(profile),
    });

    // ── 2. Analyzer runs in parallel; it never delays the reply ──────
    // Not tied to the client connection: grading and safety flags are saved
    // even if the child closes the app mid-reply.
    const analysisPromise = timed(() =>
      deps.analyze(
        {
          childMessage: message,
          lastBotMessage: lastAssistantMessage(profile),
          target:
            pendingTarget && pendingSkill
              ? {
                  skillTitle: pendingSkill.title,
                  item: pendingTarget.item,
                  pattern: pendingSkill.pattern?.label ?? null,
                }
              : null,
        },
        AbortSignal.timeout(limits.analyzerTimeoutMs),
      ),
    );

    handlers.onStart?.({ mode: decision.mode, reason: decision.reason, level: profile.level });

    // ── 3. Stream the reply, with first-token and between-token deadlines ─
    const tutorAbort = new AbortController();
    const onClientAbort = () => tutorAbort.abort(new Error("Client disconnected"));
    if (opts.signal?.aborted) onClientAbort();
    else opts.signal?.addEventListener("abort", onClientAbort, { once: true });

    let reply = "";
    let ttftMs: number | null = null;
    let streamFailed = false;
    try {
      const history = profile.history.slice(-config.historyForTutor);
      await consumeStream(
        deps.streamReply({ systemPrompt, history, childMessage: message }, tutorAbort.signal),
        tutorAbort,
        limits,
        (token) => {
          ttftMs ??= deps.now() - startedAt;
          reply += token;
          handlers.onToken?.(token);
        },
      );
    } catch (error) {
      streamFailed = true;
      if (!opts.signal?.aborted) console.error("[turn] tutor stream failed", error);
    } finally {
      opts.signal?.removeEventListener("abort", onClientAbort);
    }

    const interrupted = !!opts.signal?.aborted;
    const degraded = streamFailed && !interrupted;
    reply = reply.trim();
    const fallback = !reply && !interrupted;
    if (fallback) {
      reply = FALLBACK_REPLY;
      handlers.onToken?.(reply);
    }
    const replyMs = deps.now() - startedAt;

    // ── 4. Respond within budget; fold in the analysis and persist ───
    let analysisResult = await withTimeout(analysisPromise, Math.max(0, limits.responseBudgetMs - replyMs));
    const analysisPending = analysisResult === null;
    if (analysisPending) {
      if (!interrupted) {
        handlers.onDone?.({
          reply,
          mode: decision.mode,
          reason: decision.reason,
          level: profile.level,
          levelUp: null,
          mood: answeringTarget ? profile.lastMood : (signals.mood ?? profile.lastMood),
          assessment: null,
          safetyConcern: signals.safetyConcern,
          degraded,
          interrupted,
          analysisPending,
          timing: { ttftMs, replyMs, analyzerMs: null, totalMs: deps.now() - startedAt },
        });
      }
      // Still bounded: the analyzer has its own abort signal, this is a backstop.
      analysisResult = await withTimeout(analysisPromise, limits.analyzerTimeoutMs);
    }
    if (analysisResult && "error" in analysisResult) {
      console.warn("[turn] analyzer failed", analysisResult.error);
    }
    const analysis = analysisResult && "value" in analysisResult ? analysisResult.value : null;

    const outcome = applyTurn(profile, {
      message,
      reply,
      fallback,
      decision,
      signals,
      pendingTarget,
      check,
      answeringTarget,
      target,
      analysis,
      now: deps.now(),
    });
    await deps.store.save(profile);

    const result: TurnResult = {
      reply,
      mode: decision.mode,
      reason: decision.reason,
      level: profile.level,
      levelUp: outcome.progress?.levelUp ?? null,
      mood: profile.lastMood,
      assessment: outcome.assessment,
      safetyConcern: outcome.safetyConcern,
      degraded,
      interrupted,
      analysisPending,
      timing: {
        ttftMs,
        replyMs,
        analyzerMs: analysisResult?.ms ?? null,
        totalMs: deps.now() - startedAt,
      },
    };
    if (!analysisPending && !interrupted) handlers.onDone?.(result);

    // Structured log without message content or raw ids (children's privacy).
    console.info(
      JSON.stringify({
        event: "turn",
        child: logId(childId),
        mode: result.mode,
        reason: result.reason,
        level: result.level,
        assessed: result.assessment?.result ?? null,
        levelUp: result.levelUp,
        safety: result.safetyConcern,
        degraded,
        interrupted,
        analysisPending,
        ...result.timing,
      }),
    );
    return result;
  });
}

/**
 * Iterates the token stream, aborting if the first token or any following
 * token takes too long. Races each read against the abort, so a stalled
 * source can't hang the turn even if it ignores the signal.
 */
async function consumeStream(
  stream: AsyncIterable<string>,
  controller: AbortController,
  limits: EngineLimits,
  onToken: (token: string) => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number, what: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new DeadlineError(what)), ms);
  };
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(controller.signal.reason);
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  aborted.catch(() => {});

  const iterator = stream[Symbol.asyncIterator]();
  arm(limits.firstTokenTimeoutMs, "first-token");
  try {
    while (true) {
      const { value, done } = await Promise.race([iterator.next(), aborted]);
      if (done) return;
      arm(limits.streamIdleTimeoutMs, "idle");
      onToken(value);
    }
  } finally {
    clearTimeout(timer);
    void iterator.return?.()?.catch(() => {});
  }
}

export interface ApplyTurnInput {
  message: string;
  reply: string;
  /** The reply is the canned fallback, not a model reply. */
  fallback: boolean;
  decision: ModeDecision;
  signals: Signals;
  pendingTarget: ChildProfile["lastTarget"];
  check: AnswerCheck | null;
  answeringTarget: boolean;
  target: PracticeTarget | null;
  analysis: Analysis | null;
  now: number;
}

const MAX_INTERESTS = 8;
const MAX_NOTES = 5;
const MAX_MOOD_HISTORY = 10;
const MAX_SAFETY_FLAGS = 20;

/** Applies one completed turn to the profile (mutates it). Pure apart from that. */
export function applyTurn(profile: ChildProfile, input: ApplyTurnInput) {
  const { analysis, signals, pendingTarget, decision, now } = input;
  const delivered = input.reply.length > 0;

  // The celebration (if any) was delivered in this reply.
  if (delivered) profile.pendingCelebration = null;

  // Learning progress: only when the child was answering the last prompt.
  let assessment: TurnResult["assessment"] = null;
  let progress: ProgressUpdate | null = null;
  if (pendingTarget) {
    const analyzerResult =
      analysis && analysis.answer.result !== "not_an_answer" ? analysis.answer.result : null;
    const isAnswer = input.answeringTarget || analyzerResult !== null;
    const result = isAnswer ? reconcileAnswer(input.check, analyzerResult) : null;
    // Games are low-stakes: only successes count there.
    if (result && (pendingTarget.mode === "learning" || result === "correct")) {
      const item = result === "correct" && input.check?.said ? input.check.said : pendingTarget.item;
      progress = recordAnswer(profile, pendingTarget.skillId, item, result);
      assessment = { skillId: pendingTarget.skillId, item, result };
    }
  }
  // The easy-game break has been taken; don't repeat it every turn.
  if (decision.reason === "struggle-break") profile.incorrectStreak = 0;

  // Mood & engagement. A practice answer like "I am sad" is not a mood report.
  const mood: Mood = input.answeringTarget
    ? profile.lastMood
    : (analysis?.mood ?? signals.mood ?? "neutral");
  profile.lastMood = mood;
  profile.moodHistory = [...profile.moodHistory, { mood, at: now }].slice(-MAX_MOOD_HISTORY);
  profile.lastEngagement = analysis?.engagement ?? (signals.disengaged ? "low" : "medium");

  // Personal context for future replies — the child's words, so sanitised.
  if (analysis) {
    const known = new Set(profile.interests.map((i) => i.toLowerCase()));
    const fresh = analysis.interests
      .map((i) => i.trim().toLowerCase())
      .filter((i) => INTEREST.test(i) && i.split(" ").length <= 3 && !known.has(i));
    profile.interests = [...profile.interests, ...fresh].slice(-MAX_INTERESTS);
    const name = analysis.childName?.trim();
    if (!profile.name && name && NAME.test(name)) profile.name = name;
    const note = analysis.note ? cleanNote(analysis.note) : null;
    if (note) profile.notes = [...profile.notes, note].slice(-MAX_NOTES);
  }

  const safetyConcern = signals.safetyConcern || !!analysis?.safetyConcern;
  if (safetyConcern) {
    profile.safetyFlags = [
      ...profile.safetyFlags,
      { at: now, message: input.message.slice(0, 200) },
    ].slice(-MAX_SAFETY_FLAGS);
  }
  // Check in next turn when only the analyzer noticed; keep it if this follow-up never reached the child.
  const followUpUndelivered = decision.reason === "safety-followup" && !delivered;
  profile.pendingSafety =
    followUpUndelivered || (!!analysis?.safetyConcern && decision.reason !== "safety");

  profile.mode = nextModeState(profile.mode, decision.mode);
  profile.lastTarget = resolveAskedTarget(input);

  profile.history = [
    ...profile.history,
    { role: "child" as const, content: input.message, at: now },
    ...(delivered ? [{ role: "assistant" as const, content: input.reply, at: now }] : []),
  ].slice(-config.historyStored);
  profile.totalTurns += 1;
  profile.sessionTurns += 1;
  profile.lastActiveAt = now;
  profile.updatedAt = now;

  return { assessment, progress, safetyConcern };
}

/** The item the reply actually asked for — what the next message is graded against. */
function resolveAskedTarget(input: ApplyTurnInput): ChildProfile["lastTarget"] {
  const { target, decision, pendingTarget, reply } = input;
  // No new prompt reached the child (fallback "say that again?" or a disconnect): keep the last one open.
  if (input.fallback || !reply) return pendingTarget;
  if (!target) return null;

  const candidates = [{ skillId: target.skill.id, item: target.item }];
  if (decision.mode === "learning" && pendingTarget && pendingTarget.item !== target.item) {
    candidates.push({ skillId: pendingTarget.skillId, item: pendingTarget.item });
  }
  const asked = itemAskedInReply(reply, candidates.map((c) => c.item));
  const chosen = candidates.find((c) => c.item === asked);
  if (chosen) return { ...chosen, mode: decision.mode };
  // Practice replies don't always quote the item (e.g. pattern prompts): assume the target.
  // A game that didn't use the item asked nothing gradable.
  return decision.mode === "learning" ? { skillId: target.skill.id, item: target.item, mode: "learning" } : null;
}

const INTEREST = /^[\p{L} ]{2,24}$/u;
const NAME = /^\p{L}[\p{L}'-]{0,19}$/u;

/** Keeps short, plain notes; drops anything with digits (addresses, phone numbers). */
function cleanNote(note: string): string | null {
  const clean = note.replace(/[\r\n"`{}<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || /\d/.test(clean) || clean.split(" ").length > 15) return null;
  return clean.slice(0, 100);
}

function lastAssistantMessage(profile: ChildProfile): string | null {
  for (let i = profile.history.length - 1; i >= 0; i--) {
    if (profile.history[i].role === "assistant") return profile.history[i].content;
  }
  return null;
}

type Timed<T> = { value: T; ms: number } | { error: unknown; ms: number };

async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - start) };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - start) };
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
