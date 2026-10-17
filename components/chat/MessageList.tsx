import { useEffect, useRef, type Ref } from "react";
import { PROBLEM_TEXT } from "@/components/chat/copy";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { RefreshIcon } from "@/components/icons";
import { Pip } from "@/components/Pip";
import type { Problem, UiMessage } from "@/hooks/useChat";

/** Within this distance of the bottom, the log follows new content. */
const PIN_THRESHOLD_PX = 48;

interface MessageListProps {
  messages: UiMessage[];
  greeting: string;
  /** Live transcript while the child is talking. */
  interim: string;
  problem: Problem | null;
  onRetry: () => void;
  onReplay?: (text: string) => void;
  /** The scrollable log; focusable so focus has somewhere sensible to go. */
  ref?: Ref<HTMLDivElement>;
}

export function MessageList({ messages, greeting, interim, problem, onRetry, onReplay, ref }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastText = messages.at(-1)?.text;

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // A new message (the child just sent one) always brings the log to the bottom.
  useEffect(() => {
    pinnedRef.current = true;
    scrollToEnd();
  }, [messages.length]);

  // Streaming text, the live transcript and problems follow only if the reader is at the bottom.
  useEffect(() => {
    if (pinnedRef.current) scrollToEnd();
  }, [lastText, interim, problem]);

  // The log shrinks when the feelings panel or an error opens below it: keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToEnd();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const setRefs = (el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <div
      ref={setRefs}
      role="log"
      aria-label="Conversation with Pip"
      tabIndex={-1}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
      }}
      className="flex-1 overflow-y-auto px-4 py-6 focus:outline-none"
    >
      <ol className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.length === 0 && (
          <li className="flex flex-col items-center gap-4 py-6 text-center">
            <Pip mood="happy" size={132} animated />
            <p className="max-w-sm rounded-3xl border border-line bg-paper px-6 py-4 text-2xl leading-relaxed">
              {greeting}
            </p>
          </li>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onReplay={onReplay} />
        ))}

        {interim && (
          // Hidden from screen readers: the final "You said" bubble replaces it, and announcing
          // it while the mic is open would feed the reader's voice back into the microphone.
          <li className="flex justify-end" aria-hidden="true">
            <p className="max-w-[80%] rounded-3xl rounded-br-md border-2 border-dashed border-sky px-5 py-3 text-xl text-sky">
              {interim}…
            </p>
          </li>
        )}

        {problem && (
          <li role="status" className="flex flex-wrap items-center gap-3 rounded-3xl bg-coral-soft p-4">
            <Pip mood="caring" size={52} className="shrink-0" />
            <p className="min-w-40 flex-1 text-lg">{PROBLEM_TEXT[problem.kind]}</p>
            {problem.kind !== "dropped" && (
              <button
                type="button"
                onClick={onRetry}
                disabled={problem.waiting}
                className="flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 font-display text-lg font-bold text-white hover:bg-ink/85 disabled:opacity-60"
              >
                <RefreshIcon size={22} />
                {problem.waiting ? "Resting…" : "Try again"}
              </button>
            )}
          </li>
        )}
      </ol>
    </div>
  );
}
