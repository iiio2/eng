import { useRef, useState } from "react";
import { Panel } from "@/components/parent/Panels";

/** Deletes the profile on the server after an explicit confirmation. */
export function DeleteProfile({ name, onDelete }: { name: string; onDelete: () => Promise<void> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === "delete";

  const confirm = async () => {
    if (!confirmed) return;
    setDeleting(true);
    setFailed(false);
    try {
      await onDelete();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };

  return (
    <Panel title="Delete data">
      <p className="mb-4 text-base text-ink-soft">
        Permanently deletes {name}’s profile, progress and conversations, and signs this device out.
      </p>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="min-h-12 rounded-full border-2 border-alert px-5 font-bold text-alert hover:bg-alert-soft"
      >
        Delete profile
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-title"
        className="m-auto w-[min(92vw,26rem)] rounded-3xl bg-paper p-6 text-ink backdrop:bg-ink/40"
      >
        <h2 id="delete-title" className="font-display text-2xl font-extrabold">
          Delete {name}’s profile?
        </h2>
        <p className="mt-2 text-base">This can’t be undone. Pip will forget all progress.</p>
        <label htmlFor="delete-confirm" className="mt-4 block font-bold">
          Type <span className="font-display">delete</span> to confirm
        </label>
        <input
          id="delete-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-field px-4 text-lg focus:border-sky focus:outline-none"
        />
        {failed && (
          <p role="alert" className="mt-3 rounded-xl bg-alert-soft px-3 py-2 text-alert">
            Couldn’t delete. Please try again.
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="min-h-12 rounded-full border-2 border-line px-5 font-bold hover:border-ink"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting || !confirmed}
            className="min-h-12 rounded-full bg-alert px-5 font-bold text-white hover:bg-alert/85 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </dialog>
    </Panel>
  );
}
