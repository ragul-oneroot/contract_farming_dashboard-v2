"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOutgoing, User, Sprout } from "lucide-react";
import { api, CallLog } from "../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

function fmtTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(sec?: number) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  answered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  initiated: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ringing: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  no_answer: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function CallsPage() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCallLogs()
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load calls"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Phone size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold">Call Logs ({logs.length})</h2>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No calls yet. Calls appear here when an agronomist taps the call button in the app.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">From (Agronomist)</th>
                <th className="px-4 py-3 font-medium">To (Farmer)</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Recording</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <PhoneOutgoing size={15} className="shrink-0 text-green-600" />
                      <div>
                        <div className="font-medium">{l.agronomist?.name ?? "—"}</div>
                        <div className="text-xs text-zinc-500">
                          {l.agronomist?.mobile ?? l.agronomistMobile ?? ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Sprout size={15} className="shrink-0 text-green-600" />
                      <div>
                        <div className="font-medium">{l.farmerName || "Farmer"}</div>
                        <div className="text-xs text-zinc-500">{l.farmerMobile}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{fmtTime(l.calledAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDuration(l.duration)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        STATUS_STYLE[l.status ?? ""] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {(l.status ?? "—").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.recordingUrl || l.status === "completed" ? (
                      // Streamed through the backend proxy (Plivo media needs auth).
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio
                        controls
                        preload="none"
                        src={`${API_URL}/api/plivo/recording-audio/${l._id}`}
                        className="h-9 w-56 max-w-full"
                      />
                    ) : (
                      <span className="text-xs text-zinc-400">No recording</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        <User size={12} className="mr-1 inline" />
        Calls are placed through Plivo: the agronomist&apos;s phone rings first, then connects to the farmer. The
        recording link appears a few seconds after the call ends.
      </p>
    </div>
  );
}
