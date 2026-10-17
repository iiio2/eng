import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { decideMode, nextModeState } from "@/lib/detection/mode";
import type { Mode } from "@/lib/types";
import { makeProfile, makeSignals } from "./helpers";

const opts = { isNewSession: false, answeringTarget: false };
const inMode = (current: Mode, turnsInMode = 1, consecutiveLearningTurns = 0) =>
  makeProfile({ mode: { current, turnsInMode, consecutiveLearningTurns } });

describe("decideMode", () => {
  it("prioritises safety above everything", () => {
    const d = decideMode(makeSignals({ safetyConcern: true, wantsPlay: true }), inMode("learning"), opts);
    expect(d).toEqual({ mode: "support", reason: "safety" });
  });

  it("switches to support on negative feelings", () => {
    expect(decideMode(makeSignals({ mood: "sad" }), inMode("learning"), opts).mode).toBe("support");
  });

  it("does not treat a practice answer like 'I am sad' as a mood report", () => {
    const d = decideMode(makeSignals({ mood: "sad", wordCount: 3 }), inMode("learning"), {
      ...opts,
      answeringTarget: true,
    });
    expect(d.mode).toBe("learning");
  });

  it("stays in support while the child still feels down, up to a limit", () => {
    const profile = makeProfile({
      mode: { current: "support", turnsInMode: 1, consecutiveLearningTurns: 0 },
      lastMood: "sad",
    });
    expect(decideMode(makeSignals(), profile, opts).reason).toBe("continue-support");

    profile.mode.turnsInMode = 3;
    expect(decideMode(makeSignals(), profile, opts)).toEqual({ mode: "conversation", reason: "after-support" });
  });

  it("greets with a feelings check-in at session start", () => {
    expect(decideMode(makeSignals(), inMode("learning"), { ...opts, isNewSession: true })).toEqual({
      mode: "conversation",
      reason: "session-start",
    });
  });

  it("re-engages a bored or refusing child with play", () => {
    expect(decideMode(makeSignals({ disengaged: true }), inMode("learning"), opts).mode).toBe("engagement");
    expect(decideMode(makeSignals({ mood: "bored" }), inMode("learning"), opts).mode).toBe("engagement");
  });

  it("offers an easy game after repeated mistakes, only coming from practice", () => {
    const profile = inMode("learning");
    profile.incorrectStreak = 3;
    expect(decideMode(makeSignals(), profile, opts).reason).toBe("struggle-break");

    profile.mode.current = "conversation";
    expect(decideMode(makeSignals(), profile, opts).reason).not.toBe("struggle-break");
  });

  it("follows up on an analyzer-only safety concern before anything else but fresh safety", () => {
    const profile = inMode("learning");
    profile.pendingSafety = true;
    expect(decideMode(makeSignals({ wantsPlay: true }), profile, opts)).toEqual({
      mode: "support",
      reason: "safety-followup",
    });
    expect(decideMode(makeSignals({ safetyConcern: true }), profile, opts).reason).toBe("safety");
  });

  it("only reacts to low engagement during practice", () => {
    const profile = inMode("conversation");
    profile.lastEngagement = "low";
    expect(decideMode(makeSignals(), profile, opts).mode).toBe("conversation");
    profile.mode.current = "learning";
    expect(decideMode(makeSignals(), profile, opts)).toEqual({ mode: "engagement", reason: "low-engagement" });
  });

  it("follows the child's lead when they share something", () => {
    const d = decideMode(makeSignals({ sharing: true, wordCount: 8 }), inMode("learning"), opts);
    expect(d).toEqual({ mode: "conversation", reason: "child-led" });
  });

  it("treats short replies during practice as answers, not topic changes", () => {
    const d = decideMode(makeSignals({ sharing: true, wordCount: 2 }), inMode("learning"), opts);
    expect(d.mode).toBe("learning");
  });

  it("does not teach continuously: inserts a break after a learning streak", () => {
    const profile = inMode("learning", config.learningStreakLimit, config.learningStreakLimit);
    expect(decideMode(makeSignals(), profile, opts)).toEqual({ mode: "conversation", reason: "learning-break" });
  });

  it("returns to learning after a short conversation", () => {
    expect(decideMode(makeSignals(), inMode("conversation", 1), opts).mode).toBe("conversation");
    expect(decideMode(makeSignals(), inMode("conversation", 2), opts).mode).toBe("learning");
  });
});

describe("nextModeState", () => {
  it("tracks turns in mode and consecutive learning turns", () => {
    let state = nextModeState({ current: "conversation", turnsInMode: 2, consecutiveLearningTurns: 0 }, "learning");
    expect(state).toEqual({ current: "learning", turnsInMode: 1, consecutiveLearningTurns: 1 });
    state = nextModeState(state, "learning");
    expect(state).toEqual({ current: "learning", turnsInMode: 2, consecutiveLearningTurns: 2 });
    state = nextModeState(state, "conversation");
    expect(state.consecutiveLearningTurns).toBe(0);
  });
});
