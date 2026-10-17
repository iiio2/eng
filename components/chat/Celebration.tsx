import { useEffect, useRef } from "react";
import { Pip } from "@/components/Pip";

const COLORS = ["#ffc845", "#ff7a59", "#2563a8", "#1b7a51", "#ffe7a3"];
// Deterministic spread so the confetti looks random without randomness in render.
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 113) % 900,
  color: COLORS[i % COLORS.length],
  round: i % 3 === 0,
}));

/** Level-up celebration. A modal dialog: focus moves in, Escape or the button closes it. */
export function Celebration({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // No close() in a cleanup: StrictMode re-runs effects, which would dismiss the dialog
  // immediately. Unmounting removes the dialog from the top layer anyway.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="celebration-title"
      className="m-auto w-[min(92vw,26rem)] overflow-visible rounded-[2rem] bg-paper p-0 text-ink backdrop:bg-ink/40"
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        {PIECES.map((p, i) => (
          <span
            key={i}
            className={`absolute top-0 block size-3 motion-safe:animate-confetti ${p.round ? "rounded-full" : "rounded-sm"}`}
            style={{ left: `${p.left}%`, backgroundColor: p.color, animationDelay: `${p.delay}ms` }}
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center">
        <Pip mood="playful" size={140} animated />
        <h2 id="celebration-title" className="font-display text-3xl font-extrabold">
          Hooray! ⭐
        </h2>
        <p className="text-xl leading-relaxed">You learned so many words! Now we can try bigger things together.</p>
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          className="min-h-14 w-full rounded-full bg-sun px-6 font-display text-2xl font-extrabold hover:bg-sun-deep hover:text-white"
        >
          Yay!
        </button>
      </div>
    </dialog>
  );
}
