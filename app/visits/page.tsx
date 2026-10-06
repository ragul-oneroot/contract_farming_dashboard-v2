"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, ExternalLink, MapPin, Search } from "lucide-react";

import { api, Person, Visit } from "../lib/api";
import { PhotoThumb } from "../components/lightbox";
import { NextVisitDialog } from "../components/next-visit-dialog";
import { AgronomistMultiSelect } from "../components/agronomist-multi-select";
import { ExcelExport, type ExportColumn } from "../components/excel-export";

function fmtTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const fmtDay = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * What is owed after a visit, as one word.
 *
 * `promised` is the agent's own follow-up; `assigned` is a day the office asked
 * for from here. `none` is the case this whole screen exists for — the agent
 * went, and left nothing behind saying when to go back.
 */
type Owed = "promised" | "assigned" | "overdue" | "skipped" | "none";

function owedOf(v: Visit): Owed {
  const f = v.farmer;
  // Checked first: a farmer somebody decided needs no visit is not one nobody
  // has got round to scheduling, and lumping the two together would bury the
  // decision under the backlog.
  if (f?.skippedAt) return "skipped";
  const due = f?.nextFollowUpAt || f?.visitDate;
  if (!due) return "none";
  return new Date(due).getTime() < startOfToday() ? "overdue" : f?.nextFollowUpAt ? "promised" : "assigned";
}

const when = (s?: string | null) => (s ? new Date(s) : null);

/** Every column a visits download can carry; the office ticks which. */
const VISIT_COLUMNS: ExportColumn<Visit>[] = [
  { key: "visitedAt", label: "Visited at", value: (v) => when(v.visitedAt) },
  { key: "agronomist", label: "Agronomist", value: (v) => v.agronomist?.name },
  { key: "agronomistMobile", label: "Agronomist mobile", value: (v) => v.agronomist?.mobile, checked: false },
  { key: "farmer", label: "Farmer", value: (v) => v.farmer?.name || v.farmerName },
  { key: "farmerMobile", label: "Farmer mobile", value: (v) => v.farmer?.mobile },
  { key: "notes", label: "Notes", value: (v) => v.notes },
  { key: "followUpNote", label: "Follow-up note", value: (v) => v.followUpNote },
  { key: "nextFollowUpAt", label: "Next follow-up", value: (v) => when(v.nextFollowUpAt) },
  { key: "status", label: "Next visit status", value: (v) => OWED[owedOf(v)].label },
  { key: "lastVisitedAt", label: "Farmer last visited", value: (v) => when(v.farmer?.lastVisitedAt), checked: false },
  { key: "latitude", label: "Latitude", value: (v) => v.location?.latitude, checked: false },
  { key: "longitude", label: "Longitude", value: (v) => v.location?.longitude, checked: false },
  { key: "farmPhoto", label: "Farm photo link", value: (v) => v.farmPhotoUrl, checked: false },
  { key: "farmerPhoto", label: "Farmer photo link", value: (v) => v.farmerPhotoUrl, checked: false },
];

const OWED: Record<Owed, { label: string; className: string }> = {
  promised: {
    label: "Agent promised",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  },
  assigned: {
    label: "Asked from office",
    className: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  },
  skipped: {
    label: "Not needed",
    className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  none: {
    label: "No next visit",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
};

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-side: these change which visits are fetched at all.
  /** Agronomists picked; none picked means everyone. */
  const [who, setWho] = useState<string[]>([]);
  const whoKey = who.join(",");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Client-side: these narrow what has already arrived.
  const [owed, setOwed] = useState<"" | Owed>("");
  const [query, setQuery] = useState("");

  /** Which visit's next-visit dialog is open. */
  const [setting, setSetting] = useState<Visit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [v, a] = await Promise.all([
          api.listVisits({ agronomist: whoKey || undefined, from: from || undefined, to: to || undefined }),
          api.listAgronomists().catch(() => [] as Person[]),
        ]);
        if (cancelled) return;
        setVisits(v);
        setAgronomists(a);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load visits");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [whoKey, from, to]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visits.filter((v) => {
      if (owed && owedOf(v) !== owed) return false;
      if (!q) return true;
      const name = (v.farmer?.name || v.farmerName || "").toLowerCase();
      const digits = q.replace(/\D/g, "");
      return (
        name.includes(q) ||
        (!!digits && (v.farmer?.mobile || "").replace(/\D/g, "").includes(digits))
      );
    });
  }, [visits, owed, query]);

  /**
   * The headline this page is for: how many visits happened, and how many of
   * them left nobody knowing when to go back. Counted over the fetched set, not
   * the filtered one, so picking a chip does not change the number it is
   * filtering by.
   */
  const stats = useMemo(() => {
    const by = (o: Owed) => visits.filter((v) => owedOf(v) === o).length;
    return {
      none: by("none"),
      overdue: by("overdue"),
      promised: by("promised"),
      assigned: by("assigned"),
      skipped: by("skipped"),
    };
  }, [visits]);

  const filtered = !!(who.length || from || to || owed || query);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">
            Farm Visits ({rows.length}
            {rows.length !== visits.length ? ` of ${visits.length}` : ""})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-300 px-2 dark:border-zinc-700">
            <Search size={14} className="text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Farmer name or number"
              className="w-48 bg-transparent py-1.5 outline-none"
            />
          </div>
          <AgronomistMultiSelect agronomists={agronomists} value={who} onChange={setWho} />
          <CalendarDays size={15} className="text-zinc-400" />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
          />
          <span className="text-zinc-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
          />
          {filtered && (
            <button
              onClick={() => {
                setWho([]);
                setFrom("");
                setTo("");
                setOwed("");
                setQuery("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Clear filters
            </button>
          )}
          <ExcelExport id="visits" fileName="farm-visits" columns={VISIT_COLUMNS} rows={() => rows} />
        </div>
      </div>

      {/* The counts double as the filter. "No next visit" leads because it is
          the one that needs somebody to do something about it. */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "none", n: stats.none },
            { key: "overdue", n: stats.overdue },
            { key: "promised", n: stats.promised },
            { key: "assigned", n: stats.assigned },
            { key: "skipped", n: stats.skipped },
          ] as { key: Owed; n: number }[]
        ).map(({ key, n }) => (
          <button
            key={key}
            onClick={() => setOwed((o) => (o === key ? "" : key))}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              owed === key
                ? "border-green-600 ring-1 ring-green-600"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
            }`}
          >
            <div className="text-lg font-semibold">{n}</div>
            <div className="text-xs text-zinc-500">{OWED[key].label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {visits.length === 0
            ? "No visits yet. They appear when an agronomist marks a farm visit in the app."
            : "No visits match these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Agronomist</th>
                <th className="px-4 py-3 font-medium">Farmer</th>
                <th className="px-4 py-3 font-medium">Visited</th>
                <th className="px-4 py-3 font-medium">Next visit</th>
                <th className="px-4 py-3 font-medium">Photos</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const hasLoc = v.location?.latitude != null && v.location?.longitude != null;
                const photos = [
                  { url: v.farmPhotoUrl, label: "Farm" },
                  { url: v.farmerPhotoUrl, label: "Farmer" },
                ].filter((p) => p.url);
                const state = owedOf(v);
                const due =
                  state === "skipped" ? null : v.farmer?.nextFollowUpAt || v.farmer?.visitDate;
                return (
                  <tr
                    key={v._id}
                    className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{v.agronomist?.name ?? "—"}</div>
                      {v.agronomist?.mobile ? (
                        <div className="text-xs text-zinc-500">{v.agronomist.mobile}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{v.farmer?.name || v.farmerName || "Farmer"}</div>
                      {v.farmer?.mobile ? (
                        <div className="text-xs text-zinc-500">{v.farmer.mobile}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {fmtTime(v.visitedAt)}
                    </td>

                    {/* Whether anyone knows when to go back, and the way to say
                        so if not. A random visit has no farmer to schedule
                        against, so it only reports. */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${OWED[state].className}`}
                      >
                        {OWED[state].label}
                        {due ? ` · ${fmtDay(due)}` : ""}
                      </span>
                      {/* Why, whichever decision it was. A farmer taken off the
                          day without a reason is the thing this replaces. */}
                      {state === "skipped" && v.farmer?.skipReason ? (
                        <div className="mt-1 max-w-[16rem] whitespace-pre-line text-xs leading-snug text-zinc-500">
                          {v.farmer.skipReason}
                        </div>
                      ) : v.followUpNote || v.farmer?.followUpNote ? (
                        /**
                         * The visit's OWN note first, the farmer's current one
                         * only as a fallback.
                         *
                         * They differ, and the difference matters here: the
                         * farmer record carries a note only while a date is
                         * pending, so a visit that ended without one — "crop
                         * looked fine, nothing owed" — used to leave this cell
                         * blank however much the agent had written. The note is
                         * now required on every visit, so it is always worth
                         * showing, date or no date.
                         *
                         * Shown in full rather than clipped to two lines with
                         * the rest behind a hover: remarks are the agent's
                         * account of what they found, and the office reads them
                         * to decide what to do next. A note you have to hover to
                         * finish is a note that gets skipped.
                         */
                        <div className="mt-1 max-w-[16rem] whitespace-pre-line text-xs leading-snug text-zinc-500">
                          {v.followUpNote || v.farmer?.followUpNote}
                        </div>
                      ) : null}
                      {v.farmer?._id ? (
                        <button
                          onClick={() => setSetting(v)}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-green-600/40 px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                        >
                          <CalendarClock size={11} />
                          {state === "skipped"
                            ? "Change"
                            : v.farmer.visitDate
                              ? "Change visit date"
                              : "Ask for a visit"}
                        </button>
                      ) : (
                        <div className="mt-1 text-xs text-zinc-400">Random visit</div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {photos.length > 0 ? (
                        <div className="flex gap-1.5">
                          {photos.map((p, i) => (
                            <PhotoThumb
                              key={i}
                              url={p.url}
                              caption={p.label}
                              group={photos.map((x) => ({ url: x.url, caption: x.label }))}
                              index={i}
                              alt={p.label}
                              className="h-12 w-12 rounded-md object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
                            />
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

      {/* Patches every row for that farmer, not just the one clicked — the same
          farmer can appear on several visits, and they would otherwise disagree
          about what is owed. */}
      {setting ? (
        <NextVisitDialog
          key={setting._id}
          visit={setting}
          onClose={() => setSetting(null)}
          onSaved={(farmerId, patch) =>
            setVisits((list) =>
              list.map((v) =>
                v.farmer && v.farmer._id === farmerId
                  ? { ...v, farmer: { ...v.farmer, ...patch } }
                  : v
              )
            )
          }
        />
      ) : null}
    </div>
  );
}
