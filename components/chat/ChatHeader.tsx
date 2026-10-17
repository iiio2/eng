import Link from "next/link";
import { LockIcon, SpeakerIcon, SpeakerOffIcon } from "@/components/icons";
import { Pip, type PipMood } from "@/components/Pip";

export const STATUS_TEXT: Record<PipMood, string> = {
  happy: "Let's chat!",
  learning: "Word time",
  playful: "Play time",
  caring: "I'm here for you",
  thinking: "Pip is thinking…",
  listening: "Pip is listening…",
};

interface ChatHeaderProps {
  mood: PipMood;
  /**
   * Announced to screen readers. Only the conversation mode, so it speaks on real
   * changes and never says "listening" into an open microphone.
   */
  modeAnnouncement: string;
  sound: { supported: boolean; on: boolean; toggle: () => void };
}

export function ChatHeader({ mood, modeAnnouncement, sound }: ChatHeaderProps) {
  return (
    <header className="border-b border-line bg-cream/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Pip mood={mood} size={56} animated={mood === "thinking" || mood === "listening"} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight">Pip</h1>
          <p className="truncate text-base text-ink-soft">{STATUS_TEXT[mood]}</p>
          <span className="sr-only" aria-live="polite">
            {modeAnnouncement}
          </span>
        </div>
        {sound.supported && (
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.on}
            aria-label={sound.on ? "Turn Pip's voice off" : "Turn Pip's voice on"}
            className="grid size-12 place-items-center rounded-full border-2 border-line bg-paper hover:border-sun"
          >
            {sound.on ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </button>
        )}
        <Link
          href="/parent"
          className="flex min-h-12 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft hover:bg-paper hover:text-ink"
        >
          <LockIcon size={18} />
          Grown-ups
        </Link>
      </div>
    </header>
  );
}
