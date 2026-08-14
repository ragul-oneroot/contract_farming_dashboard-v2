"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation, Clock, MapPin, X, CloudRain, PauseCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { api, Person, TrackingPause, TrackingSession } from "../lib/api";
import { PhotoThumb } from "../components/lightbox";

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function duration(from: string, to: string | null) {
  const mins = Math.max(0, Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function mins(from: string, to: string | null) {
  return Math.max(0, Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000));
}

function hm(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Minutes the agent was stepped out of the day. An open pause runs to now. */
function pausedMinutes(pauses: TrackingPause[] | undefined) {
  return (pauses || []).reduce((t, p) => t + mins(p.pausedAt, p.resumedAt), 0);
}

/**
 * The route drawn on satellite imagery, in a sandboxed iframe.
 *
 * Leaflet is loaded from a CDN inside the frame rather than bundled: the map is
 * one screen in the whole dashboard, and this keeps it out of the app bundle.
 */
function RouteMap({ session }: { session: TrackingSession }) {
  const points = (session.points ?? []).filter((p) => p.latitude != null && p.longitude != null);

  const html = useMemo(() => {
    // `at` travels with each fix so a dot can say when it was recorded.
    const coords = points.map((p) => [p.latitude, p.longitude, p.at ?? null]);
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eee}</style></head>
<body><div id="map"></div><script>
  var C = ${JSON.stringify(coords)};
  var map = L.map('map', { attributionControl: false });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 }).addTo(map);

  function timeAt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (C.length) {
    // Every recorded fix as its own dot, deliberately NOT joined into a line:
    // a polyline draws a straight segment between consecutive fixes, which
    // invents travel through whatever lies between them. The dots show only
    // where the agent was actually recorded.
    C.forEach(function (c, i) {
      var first = i === 0;
      var last = i === C.length - 1;
      var fill = first ? '#2E9E5B' : last ? '#E5484D' : '#1E88E5';
      L.circleMarker([c[0], c[1]], {
        radius: first || last ? 7 : 4,
        color: '#fff',
        weight: first || last ? 3 : 1.5,
        fillColor: fill,
        fillOpacity: first || last ? 1 : 0.85,
      })
        .addTo(map)
        .bindTooltip(
          (first ? 'Start' : last ? 'End' : 'Point ' + (i + 1)) +
            (timeAt(c[2]) ? ' · ' + timeAt(c[2]) : '')
        );
    });

    if (C.length > 1) {
      map.fitBounds(L.latLngBounds(C.map(function (c) { return [c[0], c[1]]; })), { padding: [30, 30] });
    } else {
      map.setView([C[0][0], C[0][1]], 16);
    }
  } else {
    map.setView([12.9716, 77.5946], 11);
  }
</script></body></html>`;
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        No location points were recorded for this session.
      </div>
    );
  }

  return <iframe srcDoc={html} className="h-full w-full border-0" sandbox="allow-scripts" />;
}

const PAGE_SIZE = 20;

export default function TrackingPage() {
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  /** Server-computed, so they cover the whole period rather than this page. */
  const [totals, setTotals] = useState({ km: 0, hours: 0, tracked: 0, live: 0, off: 0 });
  const [agents, setAgents] = useState<Person[]>([]);
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The session whose route is open, fetched separately because the list
  // deliberately omits points.
  const [open, setOpen] = useState<TrackingSession | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listTrackingPage({
        userId: who || undefined,
        from: from || undefined,
        page,
        limit: PAGE_SIZE,
      }),
      api.listAgronomists().catch(() => [] as Person[]),
    ])
      .then(([res, a]) => {
        setSessions(res.items);
        setTotal(res.total);
        setTotals(res.totals);
        setAgents(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tracking"))
      .finally(() => setLoading(false));
  }, [who, from, page]);

  /** Changing agent or date must land on page one of the new results. */
  const applyFilter = (set: (v: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  const showRoute = async (id: string) => {
    setOpenLoading(true);
    try {
      setOpen(await api.getTrackingSession(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the route");
    } finally {
      setOpenLoading(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">Tracking ({total})</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={who}
            onChange={(e) => applyFilter(setWho)(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter(setFrom)(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {(who || from) && (
            <button
              onClick={() => {
                setWho("");
                setFrom("");
                setPage(1);
              }}
              className="text-sm text-zinc-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Distance", value: `${totals.km} km` },
          { label: "Time tracked", value: `${totals.hours} h` },
          { label: "Tracked days", value: String(totals.tracked) },
          { label: "No field work", value: String(totals.off) },
          { label: "Running now", value: String(totals.live), alert: totals.live > 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="card p-3"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
            <div className={`mt-1 text-xl font-semibold${s.alert ? " text-green-600" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No tracked days yet. They appear when an agent taps START in the app.
        </p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Ended</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Distance</th>
                <th className="px-4 py-3 font-medium">Pauses</th>
                <th className="px-4 py-3 font-medium">Photos</th>
                <th className="px-4 py-3 font-medium">Route</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                // A declared day in has no route or distance — it has a reason,
                // and showing it as "0 km" would read as a failure to work.
                const off = s.kind === "no_field";
                const pauses = s.pauses || [];
                const paused = pausedMinutes(pauses);
                const shots = [
                  { url: s.startPhotoUrl, label: off ? "Reason" : "Start" },
                  { url: s.endPhotoUrl, label: "End" },
                ].filter((p) => p.url);
                return (
                  <tr key={s._id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.user?.name || s.userName || "—"}</div>
                      {s.user?.mobile ? <div className="text-xs text-zinc-500">{s.user.mobile}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{fmtDateTime(s.startAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {off ? (
                        "—"
                      ) : s.endAt ? (
                        fmtTime(s.endAt)
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-green-600">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-green-600" /> Running
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {off ? (
                        "—"
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} /> {duration(s.startAt, s.endAt)}
                          </span>
                          {/* Elapsed time hides the gap. Spell out how much of
                              it the agent was actually out of the day for. */}
                          {paused > 0 ? (
                            <div className="text-xs text-amber-600 dark:text-amber-500">
                              {hm(Math.max(0, mins(s.startAt, s.endAt) - paused))} working ·{" "}
                              {hm(paused)} paused
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <div className="max-w-[220px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-500 dark:ring-amber-900">
                            <CloudRain size={12} /> No field work
                          </span>
                          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{s.reason}</div>
                        </div>
                      ) : (
                        <span className="font-semibold text-green-600">{s.distanceKm} km</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : pauses.length === 0 ? (
                        <span className="text-xs text-zinc-400">None</span>
                      ) : (
                        <div className="max-w-[300px] space-y-2">
                          {pauses.map((p, i) => (
                            <div key={`${p.pausedAt}-${i}`} className="flex items-start gap-2">
                              {p.photoUrl ? (
                                <PhotoThumb
                                  url={p.photoUrl}
                                  caption={`Paused ${fmtTime(p.pausedAt)} — ${p.reason || "no reason given"}`}
                                  group={pauses
                                    .filter((x) => x.photoUrl)
                                    .map((x) => ({
                                      url: x.photoUrl as string,
                                      caption: `Paused ${fmtTime(x.pausedAt)} — ${x.reason || "no reason given"}`,
                                    }))}
                                  index={pauses.filter((x) => x.photoUrl).indexOf(p)}
                                  alt="Where the agent paused"
                                  className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-amber-200 hover:ring-amber-500 dark:ring-amber-900"
                                />
                              ) : (
                                <PauseCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-amber-700 dark:text-amber-500">
                                  {fmtTime(p.pausedAt)}
                                  {p.resumedAt ? (
                                    <> – {fmtTime(p.resumedAt)} · {hm(mins(p.pausedAt, p.resumedAt))}</>
                                  ) : (
                                    <> · still paused</>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                                  {p.reason || "No reason given"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {shots.length > 0 ? (
                        <div className="flex gap-1.5">
                          {shots.map((p, pi) => (
                            <div key={p.label}>
                              <PhotoThumb
                                url={p.url}
                                caption={p.label}
                                group={shots.map((x) => ({ url: x.url, caption: x.label }))}
                                index={pi}
                                alt={p.label}
                                className="h-12 w-12 rounded-md object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
                              />
                              <div className="mt-0.5 text-center text-[10px] text-zinc-500">{p.label}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : (
                        <button
                          onClick={() => showRoute(s._id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          <MapPin size={13} /> View route
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Only worth showing once there is more than one page to move between. */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}{" "}
            sessions
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">
              {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Route map */}
      {(open || openLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <div className="font-medium">{open?.user?.name || open?.userName || "Route"}</div>
                {open && (
                  <div className="text-xs text-zinc-500">
                    {fmtDateTime(open.startAt)} · {duration(open.startAt, open.endAt)} ·{" "}
                    {open.distanceKm} km · {open.points?.length ?? 0} points
                    {pausedMinutes(open.pauses) > 0 ? (
                      // The route will show a jump here. Say why, so the gap is
                      // not read as the tracking having failed.
                      <span className="text-amber-600 dark:text-amber-500">
                        {" "}
                        · {hm(pausedMinutes(open.pauses))} paused (not counted)
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(null)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1">
              {openLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading route…</div>
              ) : open ? (
                <RouteMap session={open} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
