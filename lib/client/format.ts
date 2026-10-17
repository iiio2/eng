import type { Level, Mood } from "@/lib/types";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago", "yesterday", "just now". */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function dateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const LEVEL_NAMES: Record<Level, string> = {
  1: "First words",
  2: "Short phrases",
  3: "Sentences",
};

export const MOOD_FACES: Record<Mood, string> = {
  happy: "😊",
  excited: "🤩",
  calm: "😌",
  neutral: "🙂",
  sad: "😢",
  scared: "😨",
  angry: "😠",
  tired: "😴",
  frustrated: "😣",
  bored: "😐",
};
