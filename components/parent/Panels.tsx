import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import type { ChildView } from "@/lib/client/api";
import { dateTime, MOOD_FACES, timeAgo } from "@/lib/client/format";

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-paper p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SafetyPanel({ flags }: { flags: ChildView["safetyFlags"] }) {
  if (flags.length === 0) return null;
  return (
    <section className="rounded-3xl border-2 border-alert/40 bg-alert-soft p-5" aria-labelledby="safety-title">
      <div className="flex items-start gap-3">
        <AlertIcon className="mt-0.5 shrink-0 text-alert" />
        <div className="flex flex-col gap-2">
          <h2 id="safety-title" className="font-display text-xl font-extrabold text-alert">
            Something you may want to talk about
          </h2>
          <p className="text-base">
            Your child said something that might mean they felt unsafe or upset. Pip responded calmly and encouraged them
            to talk to a trusted grown-up. A gentle, open chat usually helps most.
          </p>
          <ul className="mt-1 flex flex-col gap-2">
            {[...flags].reverse().map((flag) => (
              <li key={flag.at} className="rounded-2xl bg-paper px-4 py-3">
                <q className="text-lg">{flag.message}</q>
                <span className="mt-1 block text-sm text-ink-soft">{dateTime(flag.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function SkillsPanel({ progress }: { progress: ChildView["progress"] }) {
  return (
    <Panel title="Skills at this level">
      <ul className="flex flex-col gap-4">
        {progress.skills.map((skill) => {
          const percent = Math.round(skill.mastery * 100);
          return (
            <li key={skill.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold">
                  {skill.title}
                  {skill.title === progress.currentSkill && (
                    <span className="ml-2 rounded-full bg-sky-soft px-2 py-0.5 text-xs font-bold text-sky">Now</span>
                  )}
                </span>
                {skill.mastered ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-leaf">
                    <CheckIcon size={16} /> Mastered
                  </span>
                ) : (
                  <span className="text-sm text-ink-soft">
                    {skill.attempts === 0 ? "Not started" : `${percent}% · ${skill.attempts} tries`}
                  </span>
                )}
              </div>
              <div
                role="progressbar"
                aria-label={`${skill.title} mastery`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-3 overflow-hidden rounded-full bg-cream"
              >
                <div
                  className={`h-full rounded-full ${skill.mastered ? "bg-leaf" : "bg-sun"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function MoodPanel({ moods }: { moods: ChildView["moodHistory"] }) {
  return (
    <Panel title="Recent moods">
      {moods.length === 0 ? (
        <p className="text-ink-soft">Moods will show up here after a few chats.</p>
      ) : (
        <ol className="flex flex-wrap gap-2">
          {[...moods].reverse().map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="flex items-center gap-2 rounded-full bg-cream px-3 py-1.5">
              <span aria-hidden="true" className="text-xl">
                {MOOD_FACES[entry.mood]}
              </span>
              <span className="text-sm">
                <span className="font-bold capitalize">{entry.mood}</span>{" "}
                <span className="text-ink-soft">{timeAgo(entry.at)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function InterestsPanel({ interests }: { interests: string[] }) {
  return (
    <Panel title="Things they love">
      {interests.length === 0 ? (
        <p className="text-ink-soft">Pip will remember favourite topics (like dinosaurs or trains) to use in lessons.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <li key={interest} className="rounded-full bg-sun-soft px-3 py-1.5 font-bold capitalize">
              {interest}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TranscriptPanel({ history, name }: { history: ChildView["history"]; name: string }) {
  return (
    <Panel title="Recent conversation">
      {history.length === 0 ? (
        <p className="text-ink-soft">No messages yet.</p>
      ) : (
        <details>
          <summary className="min-h-11 cursor-pointer font-bold text-sky">
            Show the last {history.length} messages
          </summary>
          <ol className="mt-3 flex flex-col gap-2">
            {history.map((m, i) => (
              <li key={`${m.at}-${i}`} className={m.role === "child" ? "text-sky" : ""}>
                <span className="font-bold">{m.role === "child" ? name : "Pip"}:</span> {m.content}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  );
}
