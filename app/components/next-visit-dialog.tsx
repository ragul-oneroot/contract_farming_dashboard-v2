"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";

import { api, Visit } from "../lib/api";

const asInputDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/**
 * Ask for the next visit to a farmer the office can see was left without one.
 *
 * Writes `visitDate`, NOT `nextFollowUpAt`, and the difference matters. A
 * follow-up is the agent's own promise and lands under Follow up in the app. A
 * date set here is work handed down from the office, so it belongs on the To
 * visit list with the rest of the assigned work — which is exactly where the
 * app already reads `visitDate`.
 *
 * Keyed by visit id at the call site, so the fields can be seeded from props
 * and a dialog reopened on another row cannot inherit the last one's date.
 */
export function NextVisitDialog({
  visit,
  onClose,
  onSaved,
}: {
  visit: Visit;
  onClose: () => void;
  onSaved: (farmerId: string, patch: Partial<NonNullable<Visit["farmer"]>>) => void;
}) {
  const [date, setDate] = useState(() => asInputDate(visit.farmer?.visitDate));
  /**
   * Which of the two decisions is being made. They are opposites — a day to go
   * on, or a reason not to — so they share one dialog and one Save rather than
   * sitting as two buttons that could both be pressed.
   */
  const [mode, setMode] = useState<"visit" | "skip">(
    visit.farmer?.skippedAt ? "skip" : "visit"
  );
  const [reason, setReason] = useState(visit.farmer?.skipReason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const farmerId = visit.farmer?._id;

  const save = async (clear = false) => {
    if (!farmerId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "skip" && !clear) {
        const why = reason.trim();
        await api.updateFarmer(farmerId, { skipped: true, skipReason: why });
        // Marking it clears any date owed, server-side — mirrored here so the
        // row does not keep showing a date that no longer exists.
        onSaved(farmerId, {
          skippedAt: new Date().toISOString(),
          skipReason: why,
          visitDate: null,
          nextFollowUpAt: null,
        });
      } else if (clear) {
        // One Remove for both: whichever decision this farmer is under, this
        // takes it back off them.
        await api.updateFarmer(farmerId, { visitDate: null, skipped: false });
        onSaved(farmerId, { visitDate: null, skippedAt: null, skipReason: "" });
      } else {
        // Local midnight as an instant. The bare yyyy-mm-dd would be read as
        // UTC, which in IST is 5:30am — the right day, but out of step with the
        // app's own day windows, which start at local midnight.
        const iso = !date ? null : new Date(`${date}T00:00:00`).toISOString();
        await api.updateFarmer(farmerId, { visitDate: iso, skipped: false });
        onSaved(farmerId, { visitDate: iso, skippedAt: null, skipReason: "" });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
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
              <CalendarClock size={18} className="text-green-600" /> What happens next
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {visit.farmer?.name || visit.farmerName || "Farmer"}
              {visit.farmer?.mobile ? ` · ${visit.farmer.mobile}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* The visit this is being set after, so the date is not chosen blind. */}
        <div className="mb-4 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <div>
            Visited {fmt(visit.visitedAt)} by {visit.agronomist?.name || "an agronomist"}
          </div>
          {visit.notes ? <div className="italic">“{visit.notes}”</div> : null}
          <div>
            {visit.farmer?.nextFollowUpAt
              ? `The agent already promised to return on ${fmt(visit.farmer.nextFollowUpAt)}`
              : "The agent left no return date"}
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          {(
            [
              { key: "visit", label: "Ask for a visit" },
              { key: "skip", label: "No visit needed" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setMode(o.key)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                mode === o.key
                  ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {mode === "visit" ? (
          <>
            <label className="mb-1 block text-sm text-zinc-500">Visit by</label>
            <input
              type="date"
              value={date}
              min={min}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Appears on the agent&apos;s <strong>To visit</strong> list in the app, with the rest of
              the work assigned from here.
            </p>
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm text-zinc-500">
              Why not <span className="text-red-600">*</span>
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. farmer asked not to be visited"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            {/* Asked for, not optional: a farmer disappearing off the day with
                no explanation is the thing this is meant to replace. */}
            <p className="mt-1 text-xs text-zinc-500">
              Takes them off the day, and clears any date owed. The reason is shown wherever they
              appear.
            </p>
          </>
        )}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          {visit.farmer?.visitDate || visit.farmer?.skippedAt ? (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Remove
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
              disabled={saving || !farmerId || (mode === "visit" ? !date : !reason.trim())}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {mode === "skip"
                ? "Mark not needed"
                : visit.farmer?.visitDate
                  ? "Update"
                  : "Ask for a visit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
