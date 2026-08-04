"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { api, DailyReport } from "../lib/api";

function fmtDate(s: string) {
  return new Date(s).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listDailyReports()
      .then(setReports)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold">Daily Reports ({reports.length})</h2>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No reports yet. They appear when a field agent submits their daily report in the app.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Field Agent</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Measured</th>
                <th className="px-4 py-3 font-medium">Daily Report</th>
                <th className="px-4 py-3 font-medium">Today&apos;s Expenses</th>
                <th className="px-4 py-3 font-medium">Expected (Tomorrow)</th>
                <th className="px-4 py-3 font-medium">Plan (Tomorrow)</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const name = r.user?.name || r.userName || "Field agent";
                const cell = (v: string) => (
                  <span className={v ? "" : "italic text-zinc-400"}>{v || "—"}</span>
                );
                return (
                  <tr key={r._id} className="border-b border-zinc-100 last:border-0 align-top dark:border-zinc-900">
                    <td className="px-4 py-3">
                      <div className="font-medium">{name}</div>
                      {r.user?.mobile ? <div className="text-xs text-zinc-500">{r.user.mobile}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{fmtDate(r.date)}</td>
                    {/* Recorded by the app, not typed by the agent. Reports filed
                        before tracking existed simply have none. */}
                    <td className="px-4 py-3">
                      {r.stats ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-semibold text-green-600">{r.stats.distanceKm} km</span>
                          <span className="text-zinc-500">
                            {Math.floor(r.stats.trackedMinutes / 60)}h {r.stats.trackedMinutes % 60}m tracked
                          </span>
                          <span className="text-zinc-500">
                            <b className="text-zinc-700 dark:text-zinc-200">{r.stats.newFarmers}</b>{" "}
                            new onboarded
                          </span>
                          <span className="text-zinc-500">
                            <b className="text-zinc-700 dark:text-zinc-200">{r.stats.oldFarmers}</b>{" "}
                            existing met
                          </span>
                          <span className="text-zinc-500">
                            {r.stats.visits} visits
                            {r.stats.salesTotal > 0
                              ? ` · ₹${r.stats.salesTotal.toLocaleString("en-IN")}`
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><div className="max-w-[240px]">{cell(r.dailyReport)}</div></td>
                    <td className="px-4 py-3"><div className="max-w-[150px]">{cell(r.dailyExpenses)}</div></td>
                    <td className="px-4 py-3"><div className="max-w-[150px]">{cell(r.expectedExpensesTomorrow)}</div></td>
                    <td className="px-4 py-3"><div className="max-w-[240px]">{cell(r.planOfActionTomorrow)}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
