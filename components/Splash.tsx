import { Pip } from "@/components/Pip";

/** Shown while the client-only app loads. */
export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <Pip mood="happy" size={96} animated />
        <p className="font-display text-xl font-bold text-ink-soft">Getting ready…</p>
      </div>
    </div>
  );
}
