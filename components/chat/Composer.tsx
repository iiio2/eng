import { useState, type FormEvent } from "react";
import { MIC_ERROR_TEXT } from "@/components/chat/copy";
import { MicIcon, SendIcon, StopIcon } from "@/components/icons";
import type { MicError } from "@/hooks/useSpeechRecognition";

interface ComposerProps {
  /** A reply is streaming or sending is paused. */
  disabled: boolean;
  mic: {
    supported: boolean;
    listening: boolean;
    error: MicError | null;
    start: () => void;
    stop: () => void;
  };
  onSend: (text: string) => void;
}

export function Composer({ disabled, mic, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0 && !disabled;
  const micBlocked = disabled && !mic.listening;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex flex-col gap-2">
      {mic.error && (
        <p role="status" className="rounded-2xl bg-coral-soft px-4 py-2 text-base">
          {MIC_ERROR_TEXT[mic.error]}
        </p>
      )}
      <form onSubmit={submit} className="flex items-center gap-3">
        {mic.supported && (
          // aria-disabled (not disabled) keeps keyboard focus on the button while Pip replies.
          <button
            type="button"
            onClick={() => {
              if (mic.listening) mic.stop();
              else if (!micBlocked) mic.start();
            }}
            aria-disabled={micBlocked}
            aria-pressed={mic.listening}
            aria-label={mic.listening ? "Stop listening" : "Talk to Pip"}
            className={`grid size-16 shrink-0 place-items-center rounded-full text-ink transition-colors aria-disabled:opacity-50 ${
              mic.listening ? "bg-coral motion-safe:animate-pulse-ring" : "bg-sun hover:bg-sun-deep hover:text-white"
            }`}
          >
            {mic.listening ? <StopIcon size={30} /> : <MicIcon size={30} />}
          </button>
        )}
        <label htmlFor="chat-input" className="sr-only">
          Message to Pip
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={mic.supported ? "Or type here…" : "Type here…"}
          className="min-h-14 min-w-0 flex-1 rounded-full border-2 border-field bg-paper px-5 text-xl placeholder:text-ink-soft focus:border-sky focus:outline-none"
        />
        <button
          type="submit"
          aria-disabled={!canSend}
          aria-label="Send"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-sky text-white hover:bg-sky/85 aria-disabled:bg-line aria-disabled:text-ink-soft"
        >
          <SendIcon size={26} />
        </button>
      </form>
    </div>
  );
}
