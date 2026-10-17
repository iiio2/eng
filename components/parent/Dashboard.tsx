import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, RefreshIcon } from "@/components/icons";
import { DeleteProfile } from "@/components/parent/DeleteProfile";
import {
  InterestsPanel,
  MoodPanel,
  Panel,
  SafetyPanel,
  SkillsPanel,
  TranscriptPanel,
} from "@/components/parent/Panels";
import { ApiError, deleteChild, getChild, type ChildView } from "@/lib/client/api";
import { LEVEL_NAMES, MOOD_FACES, timeAgo } from "@/lib/client/format";
import type { Session } from "@/lib/client/storage";

type State =
  | { status: "loading" }
  | { status: "ready"; child: ChildView }
  | { status: "error"; lost: boolean };

const toState = (promise: Promise<ChildView>): Promise<State> =>
  promise.then(
    (child) => ({ status: "ready", child }),
    (error) => ({ status: "error", lost: error instanceof ApiError && error.sessionLost }),
  );

interface DashboardProps {
  session: Session;
  onDeleted: () => void;
  /** The profile no longer exists: forget it on this device so "Set Pip up again" opens setup. */
  onSessionLost: () => void;
}

export function Dashboard({ session, onDeleted, onSessionLost }: DashboardProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  // In a ref so a new callback identity from the parent doesn't refetch.
  const onSessionLostRef = useRef(onSessionLost);
  useEffect(() => {
    onSessionLostRef.current = onSessionLost;
  }, [onSessionLost]);

  const fetchChild = useCallback(
    () =>
      toState(getChild(session.childId, session.parentToken)).then((next) => {
        if (next.status === "error" && next.lost) onSessionLostRef.current();
        return next;
      }),
    [session.childId, session.parentToken],
  );

  useEffect(() => {
    let active = true;
    void fetchChild().then((next) => active && setState(next));
    return () => {
      active = false;
    };
  }, [fetchChild]);

  const refresh = () => {
    setState({ status: "loading" });
    void fetchChild().then(setState);
  };

  const name = (state.status === "ready" && state.child.name) || session.name || "Your child";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex min-h-12 items-center gap-2 font-bold text-ink-soft hover:text-ink">
          <ArrowLeftIcon size={20} /> Back to Pip
        </Link>
        <button
          type="button"
          onClick={refresh}
          disabled={state.status === "loading"}
          className="flex min-h-12 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 font-bold hover:border-ink disabled:opacity-50"
        >
          <RefreshIcon size={18} /> Refresh
        </button>
      </div>
      <h1 className="font-display text-3xl font-extrabold">{name}’s progress</h1>

      {state.status === "loading" && <DashboardSkeleton />}

      {state.status === "error" && (
        <div role="alert" className="rounded-3xl bg-alert-soft p-5 text-alert">
          {state.lost ? (
            <>
              This profile no longer exists on the server (it may have restarted).{" "}
              <Link href="/" className="font-bold underline">
                Set Pip up again
              </Link>
              .
            </>
          ) : (
            "We couldn't load the progress. Check your connection and refresh."
          )}
        </div>
      )}

      {state.status === "ready" && (
        <>
          <SafetyPanel flags={state.child.safetyFlags} />
          <Summary child={state.child} />
          <SkillsPanel progress={state.child.progress} />
          <div className="grid gap-5 md:grid-cols-2">
            <MoodPanel moods={state.child.moodHistory} />
            <InterestsPanel interests={state.child.interests} />
          </div>
          <TranscriptPanel history={state.child.history} name={name} />
          <DeleteProfile
            name={name}
            onDelete={async () => {
              try {
                await deleteChild(session.childId, session.parentToken);
              } catch (error) {
                // Already gone (server restart, another tab): the goal is reached.
                if (!(error instanceof ApiError && error.code === "child_not_found")) throw error;
              }
              onDeleted();
            }}
          />
        </>
      )}
    </main>
  );
}

function Summary({ child }: { child: ChildView }) {
  const { progress } = child;
  const levelPercent = Math.round(progress.levelMastery * 100);
  const stats = [
    { label: "Chats", value: String(child.totalTurns) },
    { label: "Last active", value: child.lastActiveAt ? timeAgo(child.lastActiveAt) : "Not yet" },
    { label: "Mood", value: `${MOOD_FACES[child.mood]} ${child.mood[0].toUpperCase()}${child.mood.slice(1)}` },
  ];

  return (
    <Panel title={`Level ${progress.level}: ${LEVEL_NAMES[progress.level]}`}>
      <p className="mb-2 text-base text-ink-soft">
        Practising <strong className="text-ink">{progress.currentSkill}</strong>.{" "}
        {progress.level < 3
          ? `${levelPercent}% of this level’s skills mastered; the next level starts at 80%.`
          : `${levelPercent}% of the top level mastered.`}
      </p>
      <div
        role="progressbar"
        aria-label="Level progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={levelPercent}
        className="mb-5 h-4 overflow-hidden rounded-full bg-cream"
      >
        <div className="h-full rounded-full bg-sun" style={{ width: `${levelPercent}%` }} />
      </div>
      <dl className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-baseline justify-between gap-3 rounded-2xl bg-cream px-3 py-2 sm:block"
          >
            <dt className="text-sm text-ink-soft">{s.label}</dt>
            <dd className="font-bold first-letter:uppercase">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading progress">
      {[160, 260, 120].map((h) => (
        <div key={h} className="animate-pulse rounded-3xl bg-paper" style={{ height: h }} />
      ))}
    </div>
  );
}
