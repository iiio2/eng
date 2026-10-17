import { memo } from "react";
import { SpeakerIcon } from "@/components/icons";
import { MOOD_FOR_MODE, Pip } from "@/components/Pip";
import type { UiMessage } from "@/hooks/useChat";

export function TypingDots() {
  return (
    <span className="inline-flex gap-1.5 py-2" aria-label="Pip is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-2.5 rounded-full bg-ink-soft motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

interface MessageBubbleProps {
  message: Pick<UiMessage, "role" | "text" | "status" | "mode">;
  /** Replays text aloud; omitted when speech isn't available. Keep it stable so bubbles can skip re-renders. */
  onReplay?: (text: string) => void;
}

/** Memoised: while a reply streams, only the bubble that changed re-renders. */
export const MessageBubble = memo(function MessageBubble({ message, onReplay }: MessageBubbleProps) {
  if (message.role === "child") {
    return (
      <li className="flex justify-end motion-safe:animate-pop-in">
        <p className="max-w-[80%] rounded-3xl rounded-br-md bg-sky px-5 py-3 text-xl leading-relaxed text-white">
          <span className="sr-only">You said: </span>
          {message.text}
        </p>
      </li>
    );
  }

  const streaming = message.status === "streaming";
  return (
    <li className="flex items-end gap-2 motion-safe:animate-pop-in">
      <Pip mood={message.mode ? MOOD_FOR_MODE[message.mode] : "happy"} size={44} className="shrink-0" />
      <div className="flex max-w-[80%] items-end gap-1">
        <p
          className="rounded-3xl rounded-bl-md border border-line bg-paper px-5 py-3 text-xl leading-relaxed"
          aria-busy={streaming}
        >
          <span className="sr-only">Pip says: </span>
          {message.text || (streaming ? <TypingDots /> : null)}
        </p>
        {onReplay && !streaming && message.text && (
          <button
            type="button"
            onClick={() => onReplay(message.text)}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-sun-soft hover:text-ink"
            aria-label="Hear it again"
          >
            <SpeakerIcon size={22} />
          </button>
        )}
      </div>
    </li>
  );
});
