import type { Skill } from "@/lib/curriculum/curriculum";
import { detectSignals, normalize } from "@/lib/detection/signals";
import { NEGATIVE_MOODS, type AnswerResult } from "@/lib/types";

export interface AnswerCheck {
  verdict: "correct" | "other-item";
  /** The item the child said, or null when they used the pattern with their own words. */
  said: string | null;
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'?m\b/g, "i am"],
  [/\b(it|that|what|where|he|she)'s\b/g, "$1 is"],
  [/\b(you|we|they)'re\b/g, "$1 are"],
];

/** Normalised text for phrase matching: no punctuation, contractions expanded. */
export function cleanForMatch(text: string): string {
  let out = normalize(text).replace(/[^\p{L}\p{N}' ]/gu, " ");
  for (const [pattern, replacement] of CONTRACTIONS) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, " ").trim();
}

const wordCount = (text: string) => (text ? text.split(" ").length : 0);

/** Position of the last whole-phrase occurrence of `item` in `text`, or -1. */
function lastIndexOfPhrase(text: string, item: string): number {
  const target = cleanForMatch(item);
  if (!target) return -1;
  return ` ${cleanForMatch(text)} `.lastIndexOf(` ${target} `);
}

/** Does the message contain the item as a whole phrase? ("I'm sad!" contains "I am sad") */
export function matchesTarget(message: string, item: string): boolean {
  return lastIndexOfPhrase(message, item) >= 0;
}

/**
 * Cheap, deterministic answer check. Exact skills: the asked item is correct,
 * another item of the skill is not. Pattern skills: any item or any sentence
 * using the pattern is correct. Null when only an LLM can tell.
 */
export function checkAnswer(message: string, skill: Skill, item: string): AnswerCheck | null {
  if (matchesTarget(message, item)) return { verdict: "correct", said: item };
  const other = skill.items.find((o) => o !== item && matchesTarget(message, o));
  if (skill.grading === "pattern") {
    if (other) return { verdict: "correct", said: other };
    if (skill.pattern?.stem.test(cleanForMatch(message))) return { verdict: "correct", said: null };
    return null;
  }
  return other ? { verdict: "other-item", said: other } : null;
}

/** The deterministic check wins; the analyzer decides only what it can't. */
export function reconcileAnswer(
  check: AnswerCheck | null,
  analyzerResult: AnswerResult | null,
): AnswerResult | null {
  if (check) return check.verdict === "correct" ? "correct" : "incorrect";
  return analyzerResult;
}

/**
 * Is this message a practice answer rather than a mood report or a request?
 * It must be short, use an item (or the skill's pattern), and carry no
 * distress, refusal or goodbye outside the answer itself. "I am sad" in the
 * feelings skill is an answer; "I'm scared, I want my mom" is not, even when
 * "mom" is the target.
 */
export function isPracticeAnswer(message: string, skill: Skill, item: string): boolean {
  const text = cleanForMatch(message);
  const longestItem = Math.max(...skill.items.map((i) => wordCount(cleanForMatch(i))));
  const maxWords = longestItem + (skill.grading === "pattern" ? 3 : 2);
  if (wordCount(text) > maxWords) return false;

  const matched = [item, ...skill.items].map(cleanForMatch).find((i) => ` ${text} `.includes(` ${i} `));
  const stem = skill.grading === "pattern" ? skill.pattern?.stem : undefined;
  if (!matched && !stem?.test(text)) return false;

  // Words outside the matched item; with only a pattern match, check the whole message.
  const rest = matched ? ` ${text} `.replace(` ${matched} `, " ").trim() : text;
  const signals = detectSignals(rest);
  if (signals.safetyConcern || signals.hurt || signals.disengaged || signals.farewell) return false;
  if (!skill.feelingWords && signals.mood && (NEGATIVE_MOODS.has(signals.mood) || signals.mood === "bored")) {
    return false;
  }
  return true;
}

/** Which candidate item did the reply actually ask for? The last one mentioned wins. */
export function itemAskedInReply(reply: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestIndex = -1;
  for (const candidate of candidates) {
    const index = lastIndexOfPhrase(reply, candidate);
    if (index > bestIndex) {
      best = candidate;
      bestIndex = index;
    }
  }
  return best;
}
