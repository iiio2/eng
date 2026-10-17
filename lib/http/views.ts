import { progressSummary } from "@/lib/curriculum/progression";
import type { ChildProfile } from "@/lib/types";

/** Parent/dashboard view of a child: progress and wellbeing, not internal state. */
export function profileView(profile: ChildProfile) {
  return {
    childId: profile.childId,
    name: profile.name,
    age: profile.age,
    createdAt: profile.createdAt,
    lastActiveAt: profile.lastActiveAt,
    totalTurns: profile.totalTurns,
    progress: progressSummary(profile),
    mood: profile.lastMood,
    moodHistory: profile.moodHistory,
    interests: profile.interests,
    safetyFlags: profile.safetyFlags,
    history: profile.history,
  };
}
