"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";

import { api, Person } from "../lib/api";

/** yyyy-mm-dd for <input type="date">, from an ISO instant. */
const asInputDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

/**
 * Set, change or clear the day a farmer is next owed a visit.
 *
 * The date is normally promised in the field while marking a visit. An agent
 * who forgets leaves the farmer visited and then owed nothing — they drop off
 * every list silently, and nobody notices until someone asks after them. This
 * is how the office puts them back on one, without inventing a visit that never
 * happened.
 *
 * Rendered only when a farmer is picked, and keyed by their id at the call
 * site, so it mounts fresh each time. That is what lets the fields be seeded
 * straight from props: a dialog reopened on another farmer cannot inherit the
 * last one's date, and no effect has to reach in and reset them.
 */
export function FollowUpDialog({
  farmer,
  onClose,
  onSaved,
}: {
  farmer: Person;
  onClose: () => void;
  onSaved: (updated: Person) => void;
}) {
  const [date, setDate] = useState(() => asInputDate(farmer.nextFollowUpAt));
  const [note, setNote] = useState(farmer.followUpNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (clear = false) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateFarmer(farmer._id, {
        // Local midnight as an instant. Sending the bare yyyy-mm-dd would be
        // read as UTC, which in IST lands at 5:30am — still the right day, but
        // the app's own day windows are built from local midnight and the two
        // would disagree at the edges.
        nextFollowUpAt:
          clear || !date ? null : new Date(`${date}T00:00:00`).toISOString(),
        followUpNote: clear ? "" : note.trim(),
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the follow-up");
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarClock size={18} className="text-green-600" /> Next follow-up
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {farmer.name}
              {farmer.mobile ? ` · ${farmer.mobile}` : ""}
              {farmer.agronomist?.name ? ` · ${farmer.agronomist.name}` : " · unassigned"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* What already happened, so the date is not set blind. */}
        <div className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {farmer.lastVisitedAt
            ? `Last visited ${new Date(farmer.lastVisitedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`
            : "No visit recorded yet"}
          {farmer.nextFollowUpAt
            ? ` · currently due ${new Date(farmer.nextFollowUpAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}`
            : " · nothing owed"}
        </div>

        <label className="mb-1 block text-sm text-zinc-500">Come back on</label>
        <input
          type="date"
          value={date}
          min={min}
          onChange={(e) => setDate(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />

        <label className="mb-1 block text-sm text-zinc-500">Why come back (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. check the turmeric rot"
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <p className="mt-1 text-xs text-zinc-500">
          The agent sees this against the farmer in the app, under Follow up.
        </p>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          {/* Only offered when there is something to remove. */}
          {farmer.nextFollowUpAt ? (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Remove follow-up
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || !date}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {farmer.nextFollowUpAt ? "Update" : "Set follow-up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
