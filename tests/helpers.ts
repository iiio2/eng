import type { Signals } from "@/lib/detection/signals";
import type { Analysis } from "@/lib/llm/analyzer";
import { createProfile } from "@/lib/memory/store";
import type { ChildProfile } from "@/lib/types";

export function makeProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return { ...createProfile({ childId: "kid-1", name: "Mia", age: 5, now: 0 }), ...overrides };
}

export function makeSignals(overrides: Partial<Signals> = {}): Signals {
  return {
    mood: null,
    safetyConcern: false,
    hurt: false,
    disengaged: false,
    wantsPlay: false,
    wantsLearn: false,
    sharing: false,
    asksQuestion: false,
    farewell: false,
    wordCount: 1,
    ...overrides,
  };
}

export function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    mood: "neutral",
    engagement: "medium",
    intent: "other",
    answer: { result: "not_an_answer" },
    interests: [],
    childName: null,
    safetyConcern: false,
    note: null,
    ...overrides,
  };
}
