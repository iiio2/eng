export const LEVELS = [1, 2, 3] as const;
export type Level = (typeof LEVELS)[number];

/**
 * The chatbot does not teach on every turn. Each turn runs in exactly one mode:
 * - learning:     structured practice of the current curriculum target
 * - conversation: free chat that follows the child's lead (implicit modelling only)
 * - engagement:   a short playful activity to re-spark attention
 * - support:      social-emotional support, no teaching
 */
export const MODES = ["learning", "conversation", "engagement", "support"] as const;
export type Mode = (typeof MODES)[number];

export const MOODS = [
  "happy",
  "excited",
  "calm",
  "neutral",
  "sad",
  "scared",
  "angry",
  "tired",
  "frustrated",
  "bored",
] as const;
export type Mood = (typeof MOODS)[number];

export const NEGATIVE_MOODS: ReadonlySet<Mood> = new Set([
  "sad",
  "scared",
  "angry",
  "tired",
  "frustrated",
]);

export type Engagement = "low" | "medium" | "high";

export type AnswerResult = "correct" | "partial" | "incorrect";

export type Difficulty = "easier" | "normal";

export interface ChatMessage {
  role: "child" | "assistant";
  content: string;
  at: number;
}

export interface ItemStats {
  attempts: number;
  correct: number;
}

export interface SkillProgress {
  attempts: number;
  correct: number;
  /** Exponential moving average of answer scores, 0..1. */
  mastery: number;
  items: Record<string, ItemStats>;
  lastPracticedTurn: number;
  /** Attempts since this skill became the active skill (drives rotation for variety). */
  streakAttempts: number;
}

export interface ModeState {
  current: Mode;
  /** Consecutive turns spent in the current mode. */
  turnsInMode: number;
  /** Consecutive learning turns; used to insert conversation breaks. */
  consecutiveLearningTurns: number;
}

export interface ChildProfile {
  childId: string;
  name: string | null;
  age: number | null;
  level: Level;
  createdAt: number;
  updatedAt: number;
  /** Last activity time; a long gap starts a new session (warm greeting + feelings check-in). */
  lastActiveAt: number | null;
  totalTurns: number;
  sessionTurns: number;

  currentSkillId: string;
  /**
   * The item the last reply actually asked for; the next message is assessed
   * against it. `mode` is the mode it was asked in (game answers are low-stakes).
   */
  lastTarget: { skillId: string; item: string; mode: Mode } | null;
  skills: Record<string, SkillProgress>;
  /** Most recent answer scores (1, 0.5, 0), newest last. */
  recentScores: number[];
  /** Consecutive incorrect answers. */
  incorrectStreak: number;

  mode: ModeState;
  lastMood: Mood;
  lastEngagement: Engagement;
  moodHistory: { mood: Mood; at: number }[];

  interests: string[];
  notes: string[];
  history: ChatMessage[];

  /** Set when the child levels up; the next reply celebrates it, then it is cleared. */
  pendingCelebration: Level | null;
  safetyFlags: { at: number; message: string }[];
  /** The analyzer found a safety concern the fast signals missed; the next reply checks in. */
  pendingSafety: boolean;

  /** SHA-256 hashes of the bearer tokens issued at creation (see lib/auth.ts). */
  auth: { chatTokenHash: string; parentTokenHash: string };
}
