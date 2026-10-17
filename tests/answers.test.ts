import { describe, expect, it } from "vitest";
import { getSkill } from "@/lib/curriculum/curriculum";
import {
  checkAnswer,
  isPracticeAnswer,
  itemAskedInReply,
  matchesTarget,
  reconcileAnswer,
} from "@/lib/engine/answers";

const greetings = getSkill("l1-greetings");
const family = getSkill("l1-family");
const feelings = getSkill("l2-feelings");
const iLike = getSkill("l2-i-like");
const actions = getSkill("l2-actions");

describe("matchesTarget", () => {
  it("matches whole phrases, ignoring case, punctuation and contractions", () => {
    expect(matchesTarget("I'm SAD!", "I am sad")).toBe(true);
    expect(matchesTarget("red", "red")).toBe(true);
    expect(matchesTarget("bored", "red")).toBe(false);
  });
});

describe("checkAnswer", () => {
  it("exact skills: the asked item is correct, another item is not", () => {
    expect(checkAnswer("Goodbye!", greetings, "goodbye")).toEqual({ verdict: "correct", said: "goodbye" });
    expect(checkAnswer("hello", greetings, "goodbye")).toEqual({ verdict: "other-item", said: "hello" });
    expect(checkAnswer("gudbye", greetings, "goodbye")).toBeNull();
  });

  it("pattern skills: any item or any use of the pattern is correct", () => {
    expect(checkAnswer("I like dogs", iLike, "I like apples")).toEqual({ verdict: "correct", said: "I like dogs" });
    expect(checkAnswer("i like trains!", iLike, "I like apples")).toEqual({ verdict: "correct", said: null });
    expect(checkAnswer("trains", iLike, "I like apples")).toBeNull();
  });
});

describe("reconcileAnswer", () => {
  it("lets the deterministic check override the analyzer", () => {
    expect(reconcileAnswer({ verdict: "correct", said: "x" }, "incorrect")).toBe("correct");
    expect(reconcileAnswer({ verdict: "other-item", said: "x" }, "correct")).toBe("incorrect");
    expect(reconcileAnswer(null, "partial")).toBe("partial");
    expect(reconcileAnswer(null, null)).toBeNull();
  });
});

describe("isPracticeAnswer", () => {
  it("accepts short answers that use an item", () => {
    expect(isPracticeAnswer("mom!", family, "mom")).toBe(true);
    expect(isPracticeAnswer("I can sing", actions, "I can run")).toBe(true);
  });

  it("treats feeling words as answers in the feelings skill", () => {
    expect(isPracticeAnswer("I'm sad", feelings, "I am happy")).toBe(true);
    expect(isPracticeAnswer("I am bored", feelings, "I am happy")).toBe(true);
  });

  it("rejects distress that merely contains the target word", () => {
    expect(isPracticeAnswer("I'm scared, I want my mom", family, "mom")).toBe(false);
    expect(isPracticeAnswer("sad mom", family, "mom")).toBe(false);
  });

  it("rejects refusals and goodbyes around the target", () => {
    expect(isPracticeAnswer("no red", getSkill("l1-colors"), "red")).toBe(false);
    expect(isPracticeAnswer("I can't do it", actions, "I can run")).toBe(false);
  });
});

describe("itemAskedInReply", () => {
  it("picks the item mentioned last", () => {
    expect(itemAskedInReply("You said hello! Now can you say goodbye?", ["goodbye", "hello"])).toBe("goodbye");
    expect(itemAskedInReply("Thank you is nice! Can you say please?", ["hello", "please"])).toBe("please");
    expect(itemAskedInReply("Let's play!", ["hello"])).toBeNull();
  });
});
