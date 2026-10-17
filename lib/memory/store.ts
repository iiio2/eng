import { config } from "@/lib/config";
import { firstSkillForLevel } from "@/lib/curriculum/progression";
import type { ChildProfile, Level } from "@/lib/types";

/**
 * Persistence boundary. The in-memory implementation is for development and
 * single-instance deployments; swap in Redis/Postgres by implementing this.
 */
export interface ChildStore {
  get(childId: string): Promise<ChildProfile | null>;
  save(profile: ChildProfile): Promise<void>;
  delete(childId: string): Promise<boolean>;
}

export class StoreFullError extends Error {
  constructor() {
    super("Child store is full");
    this.name = "StoreFullError";
  }
}

export class InMemoryChildStore implements ChildStore {
  private readonly profiles = new Map<string, ChildProfile>();

  constructor(private readonly maxProfiles = config.maxProfiles) {}

  async get(childId: string) {
    const profile = this.profiles.get(childId);
    // Clone so callers can't mutate stored state without calling save().
    return profile ? structuredClone(profile) : null;
  }

  async save(profile: ChildProfile) {
    // Bounded so unauthenticated creation can't exhaust memory.
    if (!this.profiles.has(profile.childId) && this.profiles.size >= this.maxProfiles) {
      throw new StoreFullError();
    }
    this.profiles.set(profile.childId, structuredClone(profile));
  }

  async delete(childId: string) {
    return this.profiles.delete(childId);
  }
}

export function createProfile(input: {
  childId: string;
  name?: string | null;
  age?: number | null;
  level?: Level;
  auth?: ChildProfile["auth"];
  now?: number;
}): ChildProfile {
  const now = input.now ?? Date.now();
  const level = input.level ?? 1;
  return {
    childId: input.childId,
    name: input.name ?? null,
    age: input.age ?? null,
    level,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: null,
    totalTurns: 0,
    sessionTurns: 0,
    currentSkillId: firstSkillForLevel(level),
    lastTarget: null,
    skills: {},
    recentScores: [],
    incorrectStreak: 0,
    mode: { current: "conversation", turnsInMode: 0, consecutiveLearningTurns: 0 },
    lastMood: "neutral",
    lastEngagement: "medium",
    moodHistory: [],
    interests: [],
    notes: [],
    history: [],
    pendingCelebration: null,
    safetyFlags: [],
    pendingSafety: false,
    // Empty hashes never match a token.
    auth: input.auth ?? { chatTokenHash: "", parentTokenHash: "" },
  };
}

// Keep one store across Next.js dev hot reloads.
const globalForStore = globalThis as unknown as { __childStore?: ChildStore };
export const childStore: ChildStore = (globalForStore.__childStore ??= new InMemoryChildStore());
