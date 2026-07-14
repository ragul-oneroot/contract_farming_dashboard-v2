"use client";

import { useEffect, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { api, Visit } from "../lib/api";

function fmtTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVisits()
      .then(setVisits)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load visits"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold">Farm Visits ({visits.length})</h2>
      </div>

      {visits.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No visits yet. They appear when an agronomist marks a farm visit in the app.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Agronomist</th>
                <th className="px-4 py-3 font-medium">Farmer</th>
                <th className="px-4 py-3 font-medium">Visited</th>
                <th className="px-4 py-3 font-medium">Photos</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const hasLoc = v.location?.latitude != null && v.location?.longitude != null;
                const photos = [
                  { url: v.farmPhotoUrl, label: "Farm" },
                  { url: v.farmerPhotoUrl, label: "Farmer" },
                ].filter((p) => p.url);
                return (
                  <tr key={v._id} className="border-b border-zinc-100 last:border-0 align-top dark:border-zinc-900">
                    <td className="px-4 py-3">
                      <div className="font-medium">{v.agronomist?.name ?? "—"}</div>
                      {v.agronomist?.mobile ? <div className="text-xs text-zinc-500">{v.agronomist.mobile}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{v.farmer?.name || v.farmerName || "Farmer"}</div>
                      {v.farmer?.mobile ? <div className="text-xs text-zinc-500">{v.farmer.mobile}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{fmtTime(v.visitedAt)}</td>
                    <td className="px-4 py-3">
                      {photos.length > 0 ? (
                        <div className="flex gap-1.5">
                          {photos.map((p, i) => (
                            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" title={p.label}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.url}
                                alt={p.label}
                                className="h-12 w-12 rounded-md object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
                              />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">No photos</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {hasLoc ? (
                        <a
                          href={`https://www.google.com/maps?q=${v.location.latitude},${v.location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          <MapPin size={13} /> Map <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      <span className="line-clamp-3 max-w-[220px]">{v.notes || "—"}</span>
                    </td>
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
