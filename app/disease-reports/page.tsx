"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, Clock, MapPin, ExternalLink, MessageSquare } from "lucide-react";
import { api, DiseaseReport } from "../lib/api";

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How long a report waited, or has been waiting. */
function waited(from: string, to: string | null) {
  const mins = Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default function DiseaseReportsPage() {
  const [reports, setReports] = useState<DiseaseReport[]>([]);
  const [filter, setFilter] = useState<"" | "open" | "answered">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .listDiseaseReports(filter || undefined)
      .then((r) => {
        setReports(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, [filter]);

  const stats = useMemo(() => {
    const open = reports.filter((r) => r.status === "open");
    // Average wait, measured only on the ones that were actually answered.
    const answered = reports.filter((r) => r.answeredAt);
    const avgMins = answered.length
      ? answered.reduce(
          (s, r) => s + (new Date(r.answeredAt!).getTime() - new Date(r.createdAt).getTime()) / 60000,
          0
        ) / answered.length
      : 0;
    return {
      open: open.length,
      answered: answered.length,
      avg: avgMins >= 60 ? `${Math.round(avgMins / 60)}h` : `${Math.round(avgMins)}m`,
    };
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bug size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">Crop Disease Reports ({reports.length})</h2>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: "" as const, label: "All" },
            { key: "open" as const, label: "Waiting" },
            { key: "answered" as const, label: "Answered" },
          ].map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === f.key
                  ? "bg-green-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Waiting for advice", value: String(stats.open), alert: stats.open > 0 },
          { label: "Answered", value: String(stats.answered) },
          { label: "Average reply time", value: stats.answered ? stats.avg : "—" },
        ].map((s) => (
          <div
            key={s.label}
            className="card p-3"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
            <div className={`mt-1 text-xl font-semibold${s.alert ? " text-amber-600" : ""}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No reports yet. They appear when a field agent photographs a diseased crop in the app.
        </p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const hasLoc = r.location?.latitude != null && r.location?.longitude != null;
            const open = r.status === "open";
            return (
              <div
                key={r._id}
                className="card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {r.cropName || "Crop"}
                      {r.farmerName ? <span className="text-zinc-400"> · </span> : null}
                      {r.farmerName}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      Reported by {r.reporter?.name || r.reporterName || "field agent"} ·{" "}
                      {fmtDateTime(r.createdAt)}
                      {r.farmerMobile ? ` · ${r.farmerMobile}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasLoc && (
                      <a
                        href={`https://www.google.com/maps?q=${r.location.latitude},${r.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                      >
                        <MapPin size={13} /> Map <ExternalLink size={11} />
                      </a>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        open
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                      }`}
                    >
                      <Clock size={12} />
                      {open ? `Waiting ${waited(r.createdAt, null)}` : `Answered in ${waited(r.createdAt, r.answeredAt)}`}
                    </span>
                  </div>
                </div>

                {r.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.photos.map((p) => (
                      <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p}
                          alt="Reported crop"
                          className="h-28 w-28 rounded-lg object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
                        />
                      </a>
                    ))}
                  </div>
                )}

                {r.note ? (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{r.note}</p>
                ) : null}

                {/* The advice sent back — the outcome the whole flow exists for. */}
                {r.replies.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {r.replies.map((rep, i) => (
                      <div
                        key={i}
                        className="border-l-2 border-green-600 bg-green-50/60 py-2 pl-3 pr-2 text-sm dark:bg-green-950/20"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                          <MessageSquare size={13} />
                          {rep.seniorName || "Senior agronomist"}
                          <span className="font-normal text-xs text-zinc-500">
                            · {fmtDateTime(rep.at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-zinc-700 dark:text-zinc-200">{rep.advice}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
