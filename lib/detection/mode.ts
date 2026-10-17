import { config } from "@/lib/config";
import type { Signals } from "@/lib/detection/signals";
import { NEGATIVE_MOODS, type ChildProfile, type Mode, type ModeState } from "@/lib/types";

export type ModeReason =
  | "safety"
  | "safety-followup"
  | "negative-mood"
  | "continue-support"
  | "farewell"
  | "session-start"
  | "disengaged"
  | "requested-play"
  | "requested-learning"
  | "struggle-break"
  | "low-engagement"
  | "child-led"
  | "learning-break"
  | "continue-conversation"
  | "continue-game"
  | "after-support"
  | "default";

export interface ModeDecision {
  mode: Mode;
  reason: ModeReason;
}

/** Short replies while practising are answers, not topic changes. */
const SHORT_ANSWER_WORDS = 5;
const MAX_SUPPORT_TURNS = 3;
const BREAK_TURNS = 2;

/**
 * Deterministic, explainable mode policy. Priority: safety and feelings first,
 * then the child's explicit wishes, then pacing rules that keep the bot from
 * teaching on every turn.
 */
export function decideMode(
  signals: Signals,
  profile: ChildProfile,
  opts: {
    isNewSession: boolean;
    /** The message is a practice answer (e.g. "I am sad" in the feelings skill), see isPracticeAnswer. */
    answeringTarget: boolean;
  },
): ModeDecision {
  const prev = profile.mode;
  const decide = (mode: Mode, reason: ModeReason): ModeDecision => ({ mode, reason });

  if (signals.safetyConcern) return decide("support", "safety");
  // The analyzer caught something on the previous turn that the fast signals missed.
  if (profile.pendingSafety) return decide("support", "safety-followup");
  if (signals.hurt) return decide("support", "negative-mood");
  // A practice answer is not a mood report or a request to switch activity.
  if (opts.answeringTarget) return pacing(prev, signals, true);

  if (signals.mood && NEGATIVE_MOODS.has(signals.mood)) {
    return decide("support", "negative-mood");
  }
  if (
    prev.current === "support" &&
    NEGATIVE_MOODS.has(profile.lastMood) &&
    !signals.wantsPlay &&
    !signals.wantsLearn &&
    prev.turnsInMode < MAX_SUPPORT_TURNS
  ) {
    return decide("support", "continue-support");
  }

  if (signals.farewell) return decide("conversation", "farewell");
  if (opts.isNewSession) return decide("conversation", "session-start");

  if (signals.disengaged || signals.mood === "bored") return decide("engagement", "disengaged");
  if (signals.wantsPlay) return decide("engagement", "requested-play");
  if (signals.wantsLearn) return decide("learning", "requested-learning");

  // One easy-game break after repeated misses in practice (the streak resets when it is taken).
  if (profile.incorrectStreak >= 3 && prev.current === "learning") {
    return decide("engagement", "struggle-break");
  }
  if (profile.lastEngagement === "low" && prev.current === "learning") {
    return decide("engagement", "low-engagement");
  }

  const practising = prev.current === "learning" || prev.current === "engagement";
  const isShortAnswer = practising && signals.wordCount <= SHORT_ANSWER_WORDS;
  return pacing(prev, signals, isShortAnswer);
}

/** Rules that keep a healthy rhythm between practice, chat and play. */
function pacing(prev: ModeState, signals: Signals, isAnswer: boolean): ModeDecision {
  const decide = (mode: Mode, reason: ModeReason): ModeDecision => ({ mode, reason });

  if ((signals.sharing || signals.asksQuestion) && !isAnswer) {
    return decide("conversation", "child-led");
  }

  if (prev.current === "learning" && prev.consecutiveLearningTurns >= config.learningStreakLimit) {
    return decide("conversation", "learning-break");
  }
  if (prev.current === "conversation" && prev.turnsInMode < BREAK_TURNS) {
    return decide("conversation", "continue-conversation");
  }
  if (prev.current === "engagement" && prev.turnsInMode < BREAK_TURNS) {
    return decide("engagement", "continue-game");
  }
  if (prev.current === "support") return decide("conversation", "after-support");

  return decide("learning", "default");
}

export function nextModeState(prev: ModeState, mode: Mode): ModeState {
  return {
    current: mode,
    turnsInMode: prev.current === mode ? prev.turnsInMode + 1 : 1,
    consecutiveLearningTurns: mode === "learning" ? prev.consecutiveLearningTurns + 1 : 0,
  };
}
