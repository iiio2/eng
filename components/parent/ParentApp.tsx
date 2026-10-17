import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Dashboard } from "@/components/parent/Dashboard";
import { ParentGate } from "@/components/parent/ParentGate";
import { Pip } from "@/components/Pip";
import { clearSession, loadSession } from "@/lib/client/storage";

/** Client-only root of the parent corner. */
export default function ParentApp() {
  const router = useRouter();
  const [session] = useState(loadSession);
  const [unlocked, setUnlocked] = useState(false);

  if (!session) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Pip mood="caring" size={96} />
        <h1 className="font-display text-2xl font-extrabold">No profile on this device yet</h1>
        <p className="text-lg text-ink-soft">Set up Pip first, then come back here to see progress.</p>
        <Link href="/" className="min-h-12 rounded-full bg-sun px-6 py-3 font-display text-lg font-extrabold">
          Set up Pip
        </Link>
      </main>
    );
  }

  if (!unlocked) return <ParentGate onPass={() => setUnlocked(true)} />;

  return (
    <Dashboard
      session={session}
      onDeleted={() => {
        clearSession(session.childId);
        void router.push("/");
      }}
      onSessionLost={() => clearSession(session.childId)}
    />
  );
}
