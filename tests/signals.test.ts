import { describe, expect, it } from "vitest";
import { detectSignals, normalize } from "@/lib/detection/signals";

describe("normalize", () => {
  it("collapses elongated words and curly apostrophes", () => {
    expect(normalize("I’m sooo SAAAD")).toBe("i'm so sad");
  });
});

describe("detectSignals", () => {
  it.each([
    ["i am sad", "sad"],
    ["I'm scared of the dark", "scared"],
    ["this is too hard", "frustrated"],
    ["im so sleepy", "tired"],
    ["this is boring", "bored"],
    ["yay!!", "happy"],
    ["😭", "sad"],
  ])("detects mood in %j", (text, mood) => {
    expect(detectSignals(text).mood).toBe(mood);
  });

  it("flags possible harm as a safety concern", () => {
    expect(detectSignals("my brother hit me").safetyConcern).toBe(true);
    expect(detectSignals("I can't find my mommy").safetyConcern).toBe(true);
    expect(detectSignals("it's a secret, don't tell mom").safetyConcern).toBe(true);
  });

  it("treats physical hurt as comfort-worthy but not a safety escalation", () => {
    const s = detectSignals("my tummy hurts");
    expect(s.hurt).toBe(true);
    expect(s.safetyConcern).toBe(false);
    expect(s.mood).toBe("sad");
  });

  it("does not flag ordinary answers", () => {
    const s = detectSignals("red");
    expect(s).toMatchObject({ mood: null, safetyConcern: false, disengaged: false, wantsPlay: false });
  });

  it("detects disengagement, play and learn requests", () => {
    expect(detectSignals("no").disengaged).toBe(true);
    expect(detectSignals("I don't want to").disengaged).toBe(true);
    expect(detectSignals("let's play a game").wantsPlay).toBe(true);
    expect(detectSignals("teach me new words").wantsLearn).toBe(true);
  });

  it("detects child-led sharing, questions and farewells", () => {
    expect(detectSignals("guess what my dog did").sharing).toBe(true);
    expect(detectSignals("I love dinosaurs").sharing).toBe(true);
    expect(detectSignals("why is the sky blue").asksQuestion).toBe(true);
    expect(detectSignals("what?").asksQuestion).toBe(false);
    expect(detectSignals("I have to go now").farewell).toBe(true);
  });
});

describe("safety patterns", () => {
  it.each([
    "my brother hit me",
    "daddy slapped me",
    "mommy smacked me",
    "he hurt my arm",
    "uncle touched my privates",
    "I want to hurt myself",
    "I wish I was dead",
    "he said don't tell",
    "it's our secret",
    "I got lost",
    "I lost my mommy",
    "I can't find my mommy",
    "a stranger gave me candy",
    "the man said get in his car",
    "the big kids bully me",
    "he pushed me down",
    "nobody loves me",
  ])("flags %j", (text) => {
    expect(detectSignals(text).safetyConcern).toBe(true);
  });

  it.each([
    "push me on the swing",
    "daddy pushed me on the swing today!",
    "let's kill the dragon",
    "can you keep a secret",
    "I hurt my knee",
    "it hurt my tummy",
    "don't tell me the answer",
    "red",
    "I like dogs",
  ])("does not flag play talk %j", (text) => {
    expect(detectSignals(text).safetyConcern).toBe(false);
  });
});
