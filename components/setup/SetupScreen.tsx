import { useState, type FormEvent } from "react";
import { Pip } from "@/components/Pip";
import { ApiError, createChild } from "@/lib/client/api";
import type { Session } from "@/lib/client/storage";
import type { Level } from "@/lib/types";

const LEVELS: { level: Level; title: string; hint: string }[] = [
  { level: 1, title: "Just starting", hint: "Learning first words like colors and animals" },
  { level: 2, title: "Knows some words", hint: "Ready for short phrases like “I like apples”" },
  { level: 3, title: "Speaks a little", hint: "Can try full sentences" },
];

const AGES = [3, 4, 5, 6, 7, 8];

interface SetupScreenProps {
  notice?: string | null;
  onCreated: (session: Session) => void;
}

/** First-run setup, written for the parent. */
export function SetupScreen({ notice, onCreated }: SetupScreenProps) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [level, setLevel] = useState<Level>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const child = await createChild({
        name: name.trim() || undefined,
        age: age ? Number(age) : undefined,
        level,
      });
      onCreated({
        childId: child.childId,
        name: child.name,
        chatToken: child.chatToken,
        parentToken: child.parentToken,
      });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many profiles were created from this device. Please try again later."
          : "We couldn't set things up. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center gap-4">
        <Pip mood="happy" size={88} animated />
        <div>
          <h1 className="font-display text-3xl font-extrabold leading-tight">Meet Pip</h1>
          <p className="text-lg text-ink-soft">A friendly English buddy for young children.</p>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-2xl bg-sun-soft px-4 py-3 text-base">
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-6 rounded-3xl border border-line bg-paper p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-extrabold">For grown-ups: a quick setup</h2>
          <p className="mt-1 text-base text-ink-soft">
            We only ask for a first name. Pip remembers progress so lessons get a little harder as your child grows.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="child-name" className="font-bold">
              Child’s first name <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id="child-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoComplete="off"
              className="min-h-12 rounded-xl border-2 border-field px-4 text-lg focus:border-sky focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="child-age" className="font-bold">
              Age
            </label>
            <select
              id="child-age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="min-h-12 rounded-xl border-2 border-field bg-paper px-3 text-lg focus:border-sky focus:outline-none"
            >
              <option value="">Choose</option>
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {a === 8 ? "8+" : a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-bold">How much English does your child know?</legend>
          {LEVELS.map((option) => (
            <label
              key={option.level}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line p-3 has-[:checked]:border-sun has-[:checked]:bg-sun-soft/50 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sky"
            >
              <input
                type="radio"
                name="level"
                value={option.level}
                checked={level === option.level}
                onChange={() => setLevel(option.level)}
                className="mt-1 size-5 accent-sun-deep"
              />
              <span>
                <span className="block font-bold">{option.title}</span>
                <span className="block text-base text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 text-base text-alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-14 rounded-full bg-sun font-display text-xl font-extrabold hover:bg-sun-deep hover:text-white disabled:opacity-60"
        >
          {submitting ? "Getting Pip ready…" : "Start talking with Pip"}
        </button>
      </form>
    </main>
  );
}
