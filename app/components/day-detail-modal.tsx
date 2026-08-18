"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

import { api, DayReport, DayReportRow } from "../lib/api";

const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const fmtTime = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Columns per section, so each table shows what that section is actually about. */
type Col = { title: string; render: (r: DayReportRow) => React.ReactNode; align?: "right" };

const NAME: Col = {
  title: "Farmer",
  render: (r) => (
    <div>
      <div className="font-medium">{r.name || "Unnamed"}</div>
      <div className="text-xs text-zinc-500">{r.mobile || "—"}</div>
    </div>
  ),
};
const ACRES: Col = { title: "Acres", render: (r) => (r.acres > 0 ? r.acres : "—"), align: "right" };
const CROPS: Col = { title: "Crops", render: (r) => (r.cropNames?.length ? r.cropNames.join(", ") : "—") };
const TIME: Col = { title: "Time", render: (r) => fmtTime(r.at), align: "right" };

const SECTIONS: { key: keyof DayReport; title: string; cols: Col[] }[] = [
  {
    key: "onboarded",
    title: "Farmers onboarded",
    cols: [NAME, ACRES, CROPS, { title: "Village", render: (r) => r.place || "—" }, TIME],
  },
  { key: "metExisting", title: "Existing farmers met", cols: [NAME, ACRES, CROPS] },
  {
    key: "visits",
    title: "Farm visits",
    cols: [NAME, ACRES, { title: "Notes", render: (r) => r.notes || "—" }, TIME],
  },
  {
    key: "sales",
    title: "Products given",
    cols: [
      NAME,
      { title: "Crop", render: (r) => r.cropName || "—" },
      { title: "Products", render: (r) => (r.products?.length ? r.products.join(", ") : "—") },
      { title: "Amount", render: (r) => money(r.total ?? 0), align: "right" },
      TIME,
    ],
  },
];

/**
 * One agent's whole day, behind the counts on their report.
 *
 * A dialog rather than a page: the reports table is the thing being read, and
 * a full navigation would lose whatever was scrolled to. The data comes from
 * the same endpoint the agent's own phone uses, so the two can never disagree
 * about what a day contained.
 */
export function DayDetailModal({
  userId,
  name,
  date,
  onClose,
}: {
  userId: string | null;
  name: string;
  /** The report's own date, so an old report opens the day it describes. */
  date?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DayReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    /**
     * `cancelled` guards against a slow response landing after the dialog has
     * moved to another agent: without it, opening one row and quickly opening
     * a second could show the first agent's day under the second one's name.
     */
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await api.getDayReport(userId, date);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the day");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  // Escape closes, as it does in every other dialog people use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!userId) return null;

  const written = data?.report;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-950"
        // Swallows clicks meant for the dialog, which would otherwise reach the
        // backdrop behind it and close it mid-read.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-semibold">{name}</h3>
            <p className="text-xs text-zinc-500">{data ? fmtDay(data.date) : "Loading…"}</p>
          </div>
          <div className="flex items-center gap-2">
            {data ? (
              <a
                href={api.dayReportPdfUrl(userId, date)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <Download size={14} /> PDF
              </a>
            ) : null}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-zinc-500">
              <Loader2 size={16} className="animate-spin" /> Loading the day…
            </div>
          ) : error ? (
            <p className="py-10 text-red-600">{error}</p>
          ) : data ? (
            <div className="space-y-6">
              {/* The measured day, before any of the records behind it. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Onboarded", value: String(data.stats.newFarmers) },
                  { label: "Existing met", value: String(data.metExisting.length) },
                  { label: "Visits", value: String(data.stats.visits) },
                  { label: "Sales", value: money(data.stats.salesTotal) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <div className="text-lg font-semibold">{s.value}</div>
                    <div className="text-xs text-zinc-500">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* What the agent said happened leads the records, because the
                  tables below are only what the system managed to observe. */}
              {written ? (
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <h4 className="mb-3 text-sm font-semibold text-green-600">In their words</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["What I did today", written.dailyReport],
                      ["Today's expenses", written.dailyExpenses],
                      ["Tomorrow's expected expenses", written.expectedExpensesTomorrow],
                      ["Plan for tomorrow", written.planOfActionTomorrow],
                    ] as const
                  )
                    .filter(([, v]) => v && v.trim())
                    .map(([label, v]) => (
                      <div key={label}>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
                        <p className="whitespace-pre-wrap text-sm">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm italic text-zinc-500">
                  No written report was filed for this day.
                </p>
              )}

              {/* Two columns, not four full-width tables stacked.
                  The dialog is wide, and a table of three rows stretched across
                  1400px is mostly empty space with the eye travelling a long way
                  from a farmer's name to their time. Side by side, most days fit
                  without scrolling at all. Back to one column below `xl`, where
                  half the width is too narrow for the columns. */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {SECTIONS.map((s) => {
                const rows = (data[s.key] as DayReportRow[]) ?? [];
                return (
                  <div key={s.key}>
                    <h4 className="mb-2 text-sm font-semibold text-green-600">
                      {s.title} ({rows.length})
                    </h4>
                    {rows.length === 0 ? (
                      // Said, rather than left blank: an empty gap reads as a
                      // section that failed to load.
                      <p className="text-sm italic text-zinc-400">None</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                              {s.cols.map((c) => (
                                <th
                                  key={c.title}
                                  className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
                                >
                                  {c.title}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr
                                key={`${r.id}-${i}`}
                                className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                              >
                                {s.cols.map((c) => (
                                  <td
                                    key={c.title}
                                    className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}
                                  >
                                    {c.render(r)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {/* Acreage is a farmer's whole holding, not something measured on
                  the day. Said on the page, because a number in a report is
                  read as a fact about that day. */}
              <p className="text-xs text-zinc-400">
                Acreage shown is each farmer&apos;s total recorded land, not the area worked on this
                day. A dash means nothing was recorded.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
