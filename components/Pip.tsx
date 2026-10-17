import type { Mode } from "@/lib/types";

export type PipMood = "happy" | "learning" | "playful" | "caring" | "thinking" | "listening";

export const MOOD_FOR_MODE: Record<Mode, PipMood> = {
  conversation: "happy",
  learning: "learning",
  engagement: "playful",
  support: "caring",
};

interface PipProps {
  mood?: PipMood;
  size?: number;
  /** Gentle idle bobbing (disabled automatically for reduced motion). */
  animated?: boolean;
  className?: string;
}

const INK = "#2b2a33";

function Eyes({ mood }: { mood: PipMood }) {
  if (mood === "playful") {
    // Happy squint: ^ ^
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M40 57 q6 -8 12 0" />
        <path d="M68 57 q6 -8 12 0" />
      </g>
    );
  }
  if (mood === "caring") {
    // Soft, gentle eyes
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M40 55 q6 6 12 0" />
        <path d="M68 55 q6 6 12 0" />
      </g>
    );
  }
  const r = mood === "listening" ? 6.5 : 5.5;
  const look = mood === "thinking" ? { x: 2, y: -3 } : { x: 0, y: 0 };
  return (
    <g>
      <circle cx={46 + look.x} cy={56 + look.y} r={r} fill={INK} />
      <circle cx={74 + look.x} cy={56 + look.y} r={r} fill={INK} />
      <circle cx={47.5 + look.x} cy={54 + look.y} r="1.8" fill="#fff" />
      <circle cx={75.5 + look.x} cy={54 + look.y} r="1.8" fill="#fff" />
    </g>
  );
}

function Extras({ mood }: { mood: PipMood }) {
  switch (mood) {
    case "learning":
      return (
        <g>
          <path d="M60 14 L88 24 L60 34 L32 24 Z" fill={INK} />
          <path d="M46 29 v8 q14 6 28 0 v-8" fill={INK} />
          <path d="M88 24 v12" stroke="#ff7a59" strokeWidth="3" strokeLinecap="round" />
          <circle cx="88" cy="38" r="3" fill="#ff7a59" />
        </g>
      );
    case "playful":
      return (
        <g fill="#ff7a59">
          <path d="M14 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          <path d="M104 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      );
    case "caring":
      return (
        <path
          d="M100 22 c-4 -6 -13 -3 -11 4 c1 4 6 7 11 11 c5 -4 10 -7 11 -11 c2 -7 -7 -10 -11 -4 Z"
          fill="#ff7a59"
        />
      );
    case "thinking":
      return (
        <g fill="#5c5a66">
          <circle cx="98" cy="30" r="3" />
          <circle cx="106" cy="22" r="4" />
          <circle cx="114" cy="12" r="5" />
        </g>
      );
    case "listening":
      return (
        <g stroke="#2563a8" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M104 52 q6 8 0 16" />
          <path d="M111 46 q10 14 0 28" />
        </g>
      );
    default:
      return null;
  }
}

/** Pip, the English Buddy mascot. Decorative: pair it with visible text. */
export function Pip({ mood = "happy", size = 64, animated = false, className = "" }: PipProps) {
  const beakOpen = mood === "happy" || mood === "playful" || mood === "listening";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`${animated ? "motion-safe:animate-bob" : ""} ${className}`}
    >
      {/* feet */}
      <g stroke="#e8890c" strokeWidth="4" strokeLinecap="round">
        <path d="M50 102 v8 M45 110 h10" />
        <path d="M70 102 v8 M65 110 h10" />
      </g>
      {/* wings */}
      <ellipse cx="22" cy="72" rx="9" ry="16" fill="#f2b52a" transform="rotate(18 22 72)" />
      <ellipse cx="98" cy="72" rx="9" ry="16" fill="#f2b52a" transform="rotate(-18 98 72)" />
      {/* body */}
      <circle cx="60" cy="64" r="40" fill="#ffc845" />
      <ellipse cx="60" cy="80" rx="24" ry="17" fill="#ffe7a3" />
      {mood !== "learning" && <path d="M56 26 q2 -10 8 -12 q-2 6 2 12" fill="#f2b52a" />}
      {/* cheeks */}
      <circle cx="37" cy="69" r="5.5" fill="#ff7a59" opacity="0.45" />
      <circle cx="83" cy="69" r="5.5" fill="#ff7a59" opacity="0.45" />
      <Eyes mood={mood} />
      {/* beak */}
      <path d="M52 64 L68 64 L60 72 Z" fill="#ff9a3c" />
      {beakOpen && <path d="M54 70 L66 70 L60 76 Z" fill="#e8890c" />}
      <Extras mood={mood} />
    </svg>
  );
}
