import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, StreamInterruptedError, streamChat, type TurnResult } from "@/lib/client/api";
import { loadChatState, saveChatState, type Session, type StoredMessage } from "@/lib/client/storage";
import type { Level, Mode } from "@/lib/types";

export interface UiMessage extends StoredMessage {
  status: "streaming" | "done";
}

/** dropped = the connection broke mid-reply; the server already saved the turn, so no re-send. */
export type ChatProblem = "network" | "busy" | "server" | "dropped";

export interface Problem {
  id: number;
  kind: ChatProblem;
  /** The child's message, for "Try again". */
  text: string;
  /** Rate-limited: sending is paused until the server's Retry-After passes. */
  waiting: boolean;
  waitMs: number;
}

export interface ChatCallbacks {
  /** A turn is starting (after the busy check) — reset speech for the new reply. */
  onTurnStart?: () => void;
  onReplyToken?: (text: string) => void;
  onReplyDone?: (result: TurnResult) => void;
  onSessionLost?: () => void;
}

const MAX_MESSAGES = 100;
const MAX_WAIT_MS = 60_000;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Chat state: the transcript, the turn in flight, the current mode and errors. */
export function useChat(session: Session, callbacks: ChatCallbacks = {}) {
  const { childId, chatToken } = session;
  const [initial] = useState(() => loadChatState(childId));
  const [messages, setMessages] = useState<UiMessage[]>(() =>
    initial.messages.map((m) => ({ ...m, status: "done" as const })),
  );
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode | null>(
    () => [...initial.messages].reverse().find((m) => m.role === "assistant")?.mode ?? null,
  );
  const [problem, setProblem] = useState<Problem | null>(null);
  const [levelUp, setLevelUp] = useState<Level | null>(null);
  const levelRef = useRef<Level | null>(initial.level);
  const callbacksRef = useRef(callbacks);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Persist completed turns (not on every streamed token).
  useEffect(() => {
    if (messages.some((m) => m.status === "streaming")) return;
    saveChatState(childId, {
      level: levelRef.current,
      messages: messages.map(({ id, role, text, mode }) => ({ id, role, text, mode })),
    });
  }, [messages, childId]);

  // After a 429, re-enable sending once the server's Retry-After has passed.
  useEffect(() => {
    if (!problem?.waiting) return;
    const timer = setTimeout(() => setProblem((p) => p && { ...p, waiting: false }), problem.waitMs);
    return () => clearTimeout(timer);
  }, [problem]);

  /**
   * Celebrate whenever the level goes up. The server can report a level-up
   * late (analysisPending), so compare levels instead of relying on `levelUp`.
   */
  const noteLevel = useCallback((level: Level) => {
    const previous = levelRef.current;
    levelRef.current = level;
    if (previous !== null && level > previous) setLevelUp(level);
  }, []);

  const updateReply = useCallback(
    (id: string, change: (m: UiMessage) => Partial<UiMessage>) =>
      setMessages((all) => all.map((m) => (m.id === id ? { ...m, ...change(m) } : m))),
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 500);
      if (!text || abortRef.current) return;
      callbacksRef.current.onTurnStart?.();

      const child: UiMessage = { id: newId(), role: "child", text, status: "done" };
      const reply: UiMessage = { id: newId(), role: "assistant", text: "", status: "streaming" };
      setMessages((all) => [...all, child, reply].slice(-MAX_MESSAGES));
      setProblem(null);
      setBusy(true);
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const result = await streamChat({
          childId,
          token: chatToken,
          message: text,
          signal: abort.signal,
          onStart: (start) => {
            noteLevel(start.level);
            setMode(start.mode);
            updateReply(reply.id, () => ({ mode: start.mode }));
          },
          onToken: (token) => {
            updateReply(reply.id, (m) => ({ text: m.text + token }));
            callbacksRef.current.onReplyToken?.(token);
          },
        });
        updateReply(reply.id, () => ({ text: result.reply, mode: result.mode, status: "done" }));
        // A pending analysis means `level` predates this turn's grading; the next `start` will catch up.
        if (!result.analysisPending) noteLevel(result.level);
        callbacksRef.current.onReplyDone?.(result);
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.sessionLost) {
          callbacksRef.current.onSessionLost?.();
          return;
        }
        if (error instanceof StreamInterruptedError) {
          // Keep what the child already saw; re-sending would record the answer twice.
          setMessages((all) =>
            all.flatMap((m) =>
              m.id !== reply.id ? [m] : m.text.trim() ? [{ ...m, text: `${m.text.trim()}…`, status: "done" as const }] : [],
            ),
          );
          setProblem({ id: counter++, kind: "dropped", text, waiting: false, waitMs: 0 });
          return;
        }
        const kind: ChatProblem =
          error instanceof ApiError ? (error.status === 429 ? "busy" : "server") : "network";
        const waitMs =
          kind === "busy" ? Math.min(MAX_WAIT_MS, ((error as ApiError).retryAfterSeconds ?? 10) * 1000) : 0;
        // Nothing reached the server's turn logic: drop the pair and offer the same text again.
        setMessages((all) => all.filter((m) => m.id !== child.id && m.id !== reply.id));
        setProblem({ id: counter++, kind, text, waiting: waitMs > 0, waitMs });
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
        setBusy(false);
      }
    },
    [childId, chatToken, noteLevel, updateReply],
  );

  const retry = useCallback(() => {
    if (problem && !problem.waiting && problem.kind !== "dropped") void send(problem.text);
  }, [problem, send]);

  return {
    messages,
    busy,
    /** Sending is paused (rate limited). */
    paused: !!problem?.waiting,
    mode,
    problem,
    levelUp,
    send,
    retry,
    dismissLevelUp: () => setLevelUp(null),
  };
}
