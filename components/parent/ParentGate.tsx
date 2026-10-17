import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeftIcon, LockIcon } from "@/components/icons";

/** Two-digit × one-digit: easy for an adult, out of reach for a young child, and hard to guess. */
function newQuestion() {
  const a = 11 + Math.floor(Math.random() * 9);
  const b = 3 + Math.floor(Math.random() * 7);
  return { a, b, answer: a * b };
}

// Wrong answers per tab, kept across reloads so reloading doesn't skip the wait.
const ATTEMPTS_KEY = "english-buddy:gate-attempts";
const FREE_ATTEMPTS = 2;

function readAttempts(): number {
  try {
    return Number(window.sessionStorage.getItem(ATTEMPTS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeAttempts(n: number) {
  try {
    window.sessionStorage.setItem(ATTEMPTS_KEY, String(n));
  } catch {
    // Without storage the cooldown still applies within this page.
  }
}

/** 30s after the free attempts, doubling up to 5 minutes. */
const cooldownSeconds = (attempts: number) =>
  attempts < FREE_ATTEMPTS ? 0 : Math.min(300, 30 * 2 ** (attempts - FREE_ATTEMPTS));

/** A simple grown-ups check that young children can't pass, with a growing wait after wrong answers. */
export function ParentGate({ onPass }: { onPass: () => void }) {
  const [question, setQuestion] = useState(newQuestion);
  const [value, setValue] = useState("");
  const [attempts, setAttempts] = useState(readAttempts);
  const [waitLeft, setWaitLeft] = useState(() => cooldownSeconds(readAttempts()));

  useEffect(() => {
    if (waitLeft <= 0) return;
    const timer = setTimeout(() => setWaitLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitLeft]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (waitLeft > 0 || !value) return;
    if (Number(value) === question.answer) {
      writeAttempts(0);
      return onPass();
    }
    const next = attempts + 1;
    writeAttempts(next);
    setAttempts(next);
    setWaitLeft(cooldownSeconds(next));
    setValue("");
    setQuestion(newQuestion());
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex min-h-12 items-center gap-2 self-start font-bold text-ink-soft hover:text-ink">
        <ArrowLeftIcon size={20} /> Back to Pip
      </Link>
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-3xl border border-line bg-paper p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-sun-soft">
            <LockIcon />
          </span>
          <h1 className="font-display text-2xl font-extrabold">Grown-ups only</h1>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="gate-answer" className="text-lg">
            To continue, what is <strong>{question.a} × {question.b}</strong>?
          </label>
          <input
            id="gate-answer"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            disabled={waitLeft > 0}
            aria-describedby={attempts > 0 ? "gate-feedback" : undefined}
            className="min-h-14 rounded-xl border-2 border-field px-4 text-2xl focus:border-sky focus:outline-none disabled:bg-cream"
          />
          {attempts > 0 && (
            <p id="gate-feedback" role="status" className="text-base text-alert">
              {waitLeft > 0
                ? `That’s not it. Please wait ${waitLeft} seconds before trying again.`
                : "That’s not it. Here’s a new question."}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!value || waitLeft > 0}
          className="min-h-14 rounded-full bg-ink font-display text-xl font-extrabold text-white hover:bg-ink/85 disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
