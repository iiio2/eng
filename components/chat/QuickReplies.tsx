import { useRef, useState } from "react";

const ACTIONS = [
  { emoji: "🎈", label: "Let's play", text: "Let's play a game!" },
  { emoji: "📚", label: "Teach me", text: "Teach me new words!" },
  { emoji: "📖", label: "Story", text: "Tell me a story!" },
];

const FEELINGS = [
  { emoji: "😊", label: "Happy", text: "I feel happy" },
  { emoji: "😢", label: "Sad", text: "I feel sad" },
  { emoji: "😠", label: "Angry", text: "I feel angry" },
  { emoji: "😴", label: "Tired", text: "I feel tired" },
  { emoji: "😨", label: "Scared", text: "I feel scared" },
];

const chip =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line bg-paper px-4 font-display text-lg font-bold hover:border-sun hover:bg-sun-soft aria-disabled:opacity-50";

/**
 * One-tap messages for children who can't type yet, including a feelings picker.
 * Buttons use aria-disabled (not disabled) so keyboard focus stays put while Pip replies.
 */
export function QuickReplies({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [feelingsOpen, setFeelingsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const send = (text: string) => {
    if (!disabled) onSend(text);
  };

  return (
    <div className="flex flex-col gap-3">
      {feelingsOpen && (
        <fieldset className="rounded-3xl border-2 border-sun bg-sun-soft/60 p-3">
          <legend className="px-2 font-display text-lg font-bold">How do you feel?</legend>
          <div className="grid grid-cols-5 gap-2">
            {FEELINGS.map((f) => (
              <button
                key={f.label}
                type="button"
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setFeelingsOpen(false);
                  // The panel (and this button) disappears: put focus back on its toggle.
                  toggleRef.current?.focus();
                  onSend(f.text);
                }}
                className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-paper text-base font-bold hover:bg-sun aria-disabled:opacity-50"
              >
                <span className="text-4xl leading-none" aria-hidden="true">
                  {f.emoji}
                </span>
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Two by two on phones so every option is visible; one row on wider screens. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={feelingsOpen}
          onClick={() => setFeelingsOpen((open) => !open)}
          className={`${chip} ${feelingsOpen ? "border-sun bg-sun-soft" : ""}`}
        >
          <span aria-hidden="true">💛</span> Feelings
        </button>
        {ACTIONS.map((a) => (
          <button key={a.label} type="button" aria-disabled={disabled} onClick={() => send(a.text)} className={chip}>
            <span aria-hidden="true">{a.emoji}</span> {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
