"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FileText, Wallet, CalendarClock, IndianRupee } from "lucide-react";
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

const SECTIONS: { key: keyof DailyReport; label: string; icon: React.ElementType }[] = [
  { key: "dailyReport", label: "Daily Report", icon: FileText },
  { key: "dailyExpenses", label: "Today's Expenses", icon: IndianRupee },
  { key: "expectedExpensesTomorrow", label: "Expected Expenses (Tomorrow)", icon: Wallet },
  { key: "planOfActionTomorrow", label: "Plan of Action (Tomorrow)", icon: CalendarClock },
];

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
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => {
            const name = r.user?.name || r.userName || "Field agent";
            return (
              <div
                key={r._id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{name}</div>
                      {r.user?.mobile ? <div className="text-xs text-zinc-500">{r.user.mobile}</div> : null}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400">{fmtDate(r.date)}</span>
                </div>

                <div className="space-y-3">
                  {SECTIONS.map(({ key, label, icon: Icon }) => {
                    const value = (r[key] as string) || "";
                    return (
                      <div key={key}>
                        <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                          <Icon size={13} className="text-green-600" /> {label}
                        </div>
                        <p className={`text-sm ${value ? "" : "italic text-zinc-400"}`}>
                          {value || "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
