"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Search, ChevronLeft, ChevronRight, ArrowRight, Plus, X, CalendarDays } from "lucide-react";
import { api, CatalogCrop, missingDetails, Person } from "../lib/api";
import { AudioPlayer } from "./audio-player";

const PAGE_SIZE = 20;

// District/Taluk/Village come from the farm boundary, so they're blank until the farmer draws
// one. The tooltip says so — otherwise an empty cell reads like a bug.
function NoFarm() {
  return (
    <span className="text-zinc-400" title="No farm boundary drawn yet, or the location could not be named">
      —
    </span>
  );
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PeopleTable({ role }: { role: "farmer" | "agronomist" }) {
  const label = role === "farmer" ? "farmers" : "agronomists";
  const showDetail = role === "farmer"; // only farmers have a detail page + agronomist
  // Agronomists get Onboarded / Assigned counts instead of the farmer-only columns.
  const showCounts = role === "agronomist";
  const colCount = showDetail ? 14 : 6;

  // Filters. On farmers these narrow the rows; on agronomists they narrow the
  // onboarded/assigned counts.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /**
   * Which agronomist registered the farmer in the field. "none" is the farmers
   * nobody registered — the ones added from this dashboard.
   *
   * Replaced the filter on `agronomist` (who looks after them now). The two
   * differ for any farmer who was reassigned, and this is the one that answers
   * "who brought this farmer in".
   */
  const [onboardedByFilter, setOnboardedByFilter] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** How many rows the current filters match in total, not just on this page. */
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // "Add farmer" form (farmers only).
  const [adding, setAdding] = useState(false);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [catalog, setCatalog] = useState<CatalogCrop[]>([]);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    agronomistId: "",
    // The day we want the assigned agronomist to visit — yyyy-mm-dd, straight
    // from <input type="date">. Not the same as `dop`, which is the crop's
    // planting date.
    visitDate: "",
    crop: "",
    variety: "",
    dop: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * One page from the server, filters and search included.
   *
   * Both moved server-side together: filtering a page of twenty in the browser
   * would silently drop every match sitting on the other pages.
   */
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        role === "farmer"
          ? await api.listFarmersPage({
              onboardedBy: onboardedByFilter,
              search: query,
              from,
              to,
              page,
              limit: PAGE_SIZE,
            })
          : await api.listAgronomistsPage({ search: query, from, to, page, limit: PAGE_SIZE });
      setPeople(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Every filter goes through here, so none can change without returning to
   * page one. Staying on page 4 of a result set that now has two shows an
   * empty table, which reads as "nothing matches" rather than "past the end".
   */
  const applyFilter = (set: (v: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  // Typing is debounced; page moves are not, so the request fires at once.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, from, to, onboardedByFilter, query, page]);

  useEffect(() => {
    setPage(1);
    setQuery("");
    setFrom("");
    setTo("");
    setOnboardedByFilter("");
    // The agronomist list feeds both the filter and the Add-farmer dropdown.
    api.listAgronomists().then(setAgronomists).catch(() => {});
    if (role === "farmer") api.listCropCatalog().then(setCatalog).catch(() => {});
  }, [role]);

  const openAdd = () => {
    setForm({
      name: "",
      mobile: "",
      agronomistId: "",
      visitDate: "",
      crop: "",
      variety: "",
      dop: "",
    });
    setFormError(null);
    setAdding(true);
  };

  // Varieties offered depend on which catalog crop is picked.
  const varieties = catalog.find((c) => c.name === form.crop)?.varieties ?? [];

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.createFarmer({
        name: form.name,
        mobile: form.mobile,
        agronomistId: form.agronomistId || null,
        // Meaningless without someone to do the visiting, so it only goes up
        // when an agronomist was actually picked.
        visitDate: (form.agronomistId && form.visitDate) || null,
        crop: form.crop || undefined,
        variety: form.variety || undefined,
        dop: form.dop || null,
      });
      setAdding(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add farmer");
    } finally {
      setSaving(false);
    }
  };


  // The server decides what a page holds; these only place it in the whole.
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const rows = people;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-3 dark:border-zinc-800">
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <RefreshCw size={15} /> Refresh
        </button>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => applyFilter(setQuery)(e.target.value)}
            placeholder="Search by name, number or place…"
            className="w-full rounded-lg border border-zinc-300 bg-transparent py-2 pl-9 pr-3 text-sm dark:border-zinc-700"
          />
        </div>
        {showDetail && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus size={15} /> Add farmer
          </button>
        )}
      </div>

      {/* Filters: which farmers to show, or which farmers the counts cover */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800">
        {showDetail && (
          <>
            <span className="text-zinc-500">Onboarded by</span>
            <select
              value={onboardedByFilter}
              onChange={(e) => setOnboardedByFilter(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
            >
              <option value="">All</option>
              <option value="none">— Added from dashboard —</option>
              {agronomists.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </>
        )}
        <CalendarDays size={15} className="text-zinc-400" />
        <span className="text-zinc-500">
          {showDetail ? "Registered" : "Counts for farmers registered"}
        </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
          <span className="text-zinc-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
          <button
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setFrom(today);
              setTo(today);
            }}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Today
          </button>
        {(from || to || onboardedByFilter) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setOnboardedByFilter("");
            }}
            className="rounded-lg px-2.5 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {/* Fixed height with the header pinned: twenty rows plus filters and a
          footer otherwise push the pager off the bottom of the screen, and
          scrolling the page to reach it loses the column names on the way.
          Capped against the viewport rather than a pixel count, so a laptop
          and a large monitor both fill what they have. The 19rem reserved is
          the chrome above and below — header, toolbar, filters and pager — and
          little enough beyond that to keep the pager on screen. */}
      <div className="max-h-[calc(100vh-19rem)] min-h-[24rem] overflow-auto">
        {/* Twelve columns including an inline player: below this the cells crush
            each other, so let the wrapper scroll instead. */}
        <table className={`w-full text-left text-sm ${showDetail ? "min-w-[1280px]" : ""}`}>
          <thead className="sticky top-0 z-10 bg-green-50 text-green-800 [&>tr>th]:bg-green-50 dark:bg-green-950 dark:text-green-300 dark:[&>tr>th]:bg-green-950">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Registered at</th>
              <th className="px-4 py-3 font-semibold">Mobile Number</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              {showDetail && <th className="px-4 py-3 font-semibold">District</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Taluk</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Village</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">FPO</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Agronomist</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Onboarded by</th>}
              {showDetail && (
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Recording</th>
              )}
              {showDetail && <th className="px-4 py-3 font-semibold">Follow up</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Status</th>}
              {showDetail && <th className="px-4 py-3 font-semibold text-right">Details</th>}
              {showCounts && <th className="px-4 py-3 font-semibold">Onboarded</th>}
              {showCounts && <th className="px-4 py-3 font-semibold">Assigned</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-zinc-500">
                  No {label} found.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const missing = showDetail ? missingDetails(p) : [];
                return (
                <tr
                  key={p._id}
                  className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3">{p.mobile}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p.location?.latitude != null && p.location?.longitude != null
                      ? `${p.location.latitude.toFixed(3)}, ${p.location.longitude.toFixed(3)}`
                      : "—"}
                  </td>
                  {showDetail && <td className="px-4 py-3">{p.farmAddress?.district || <NoFarm />}</td>}
                  {showDetail && <td className="px-4 py-3">{p.farmAddress?.taluk || <NoFarm />}</td>}
                  {showDetail && <td className="px-4 py-3">{p.farmAddress?.village || <NoFarm />}</td>}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {p.fpo ? (
                        <div className="leading-tight">
                          <div className="font-medium">{p.fpo.name}</div>
                          {/* The number, because "which FPO" is usually asked
                              right before somebody rings them. */}
                          {p.fpo.mobile ? (
                            <a
                              href={`tel:${p.fpo.mobile}`}
                              className="text-xs text-zinc-500 hover:text-green-600"
                            >
                              {p.fpo.mobile}
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-400" title="No FPO recorded at onboarding">
                          —
                        </span>
                      )}
                    </td>
                  )}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {p.agronomist ? (
                        p.agronomist.name
                      ) : (
                        <span className="text-zinc-400">Unassigned</span>
                      )}
                    </td>
                  )}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {p.onboardedBy ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                          {p.onboardedBy.name}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800 dark:bg-orange-950/50 dark:text-orange-300"
                          title="Added from the dashboard, or registered before this was recorded"
                        >
                          Dashboard
                        </span>
                      )}
                    </td>
                  )}
                  {/* The conversation recorded while this farmer was onboarded. */}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {p.onboardingAudioUrl ? (
                        <AudioPlayer
                          src={p.onboardingAudioUrl}
                          compact
                          fallbackSeconds={p.onboardingAudioSeconds ?? 0}
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  )}
                  {/*
                    What the field agent did about this farmer, in one cell.
                    Read in priority order: a date still pending is work owed
                    and outranks anything already finished, a skip explains an
                    absence, and a completed follow-up is only worth showing
                    once nothing is outstanding.
                  */}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {(() => {
                        const fmt = (d: string) =>
                          new Date(d).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          });

                        if (p.nextFollowUpAt) {
                          const due = new Date(p.nextFollowUpAt);
                          const today = new Date();
                          today.setHours(23, 59, 59, 999);
                          const overdue = due.getTime() < today.getTime() - 86_400_000;
                          // A farmer who has been visited leads with that: the
                          // badge answers "did the agent go?", and the next date
                          // is the follow-on. Without the visit shown, this cell
                          // reads the same whether they went or not.
                          const visited = p.lastVisitedAt;
                          return (
                            <div className="min-w-0">
                              <span
                                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                                  visited
                                    ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                                    : overdue
                                      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    visited
                                      ? "bg-green-600"
                                      : overdue
                                        ? "bg-red-600"
                                        : "bg-blue-600"
                                  }`}
                                />
                                {visited
                                  ? `Visited ${fmt(visited)}`
                                  : `${overdue ? "Overdue" : "Due"} ${fmt(p.nextFollowUpAt)}`}
                              </span>
                              <div className="mt-1 max-w-[16rem] text-xs text-zinc-500">
                                <span className={overdue && visited ? "text-red-600" : undefined}>
                                  Next {fmt(p.nextFollowUpAt)}
                                  {overdue && visited ? " · overdue" : ""}
                                </span>
                                {p.followUpNote ? (
                                  <span className="block truncate" title={p.followUpNote}>
                                    {p.followUpNote}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        }

                        if (p.skippedAt) {
                          return (
                            <div className="min-w-0">
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Not needed
                              </span>
                              <div
                                className="mt-1 max-w-[16rem] truncate text-xs text-zinc-500"
                                title={p.skipReason || undefined}
                              >
                                {p.skipReason || "No reason given"}
                              </div>
                            </div>
                          );
                        }

                        if (p.lastFollowUpDoneAt) {
                          return (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                              Done {fmt(p.lastFollowUpDoneAt)}
                            </span>
                          );
                        }

                        return <span className="text-xs text-zinc-400">—</span>;
                      })()}
                    </td>
                  )}
                  {showDetail && (
                    <td className="px-4 py-3">
                      {missing.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                          Complete
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          title={`Missing: ${missing.join(", ")}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Incomplete
                        </span>
                      )}
                      {missing.length > 0 && (
                        <div className="mt-1 text-xs text-zinc-500">{missing.join(" · ")}</div>
                      )}
                    </td>
                  )}
                  {showCounts && (
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-950/50 dark:text-green-300">
                        {p.onboardedCount ?? 0}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">by them</span>
                    </td>
                  )}
                  {showCounts && (
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
                        {p.assignedCount ?? 0}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">handed over</span>
                    </td>
                  )}
                  {showDetail && (
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/farmers/${p._id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Detail <ArrowRight size={14} />
                      </Link>
                    </td>
                  )}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 p-3 text-sm text-zinc-500 dark:border-zinc-800">
        <span>
          {total === 0
            ? "No records"
            : `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, total)} of ${total} records`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={current <= 1}
            className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2">
            {current} / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={current >= pageCount}
            className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Add farmer */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitAdd}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add farmer</h2>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X size={18} />
              </button>
            </div>

            <label className="mb-1 block text-sm text-zinc-500">
              Name <span className="text-red-600">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoFocus
              placeholder="Farmer's full name"
              className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />

            <label className="mb-1 block text-sm text-zinc-500">
              Mobile number <span className="text-red-600">*</span>
            </label>
            <input
              value={form.mobile}
              onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
              required
              inputMode="numeric"
              placeholder="10-digit number"
              className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />

            <label className="mb-1 block text-sm text-zinc-500">Assign agronomist</label>
            <select
              value={form.agronomistId}
              onChange={(e) => setForm((f) => ({ ...f, agronomistId: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            >
              <option value="">— Unassigned —</option>
              {agronomists.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.mobile})
                </option>
              ))}
            </select>

            {/*
              Only offered once an agronomist is picked — a visit day with
              nobody to do the visiting is not a thing we can ask for, and the
              submit handler drops it in that case anyway.
            */}
            {form.agronomistId && (
              <>
                <label className="mb-1 mt-3 block text-sm text-zinc-500">Visit by (optional)</label>
                <input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Shows against this farmer in the agronomist&apos;s Dashboard tab under Farm
                  Visits.
                </p>
              </>
            )}

            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium">First crop (optional)</p>

              <label className="mb-1 block text-sm text-zinc-500">Crop</label>
              <select
                value={form.crop}
                onChange={(e) =>
                  // Varieties belong to a crop, so clear the old one on change.
                  setForm((f) => ({ ...f, crop: e.target.value, variety: "" }))
                }
                className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              >
                <option value="">— No crop yet —</option>
                {catalog.map((c) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              {form.crop && (
                <>
                  <label className="mb-1 block text-sm text-zinc-500">Variety</label>
                  {varieties.length > 0 ? (
                    <select
                      value={form.variety}
                      onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))}
                      className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                    >
                      <option value="">— Any —</option>
                      {varieties.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={form.variety}
                      onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))}
                      placeholder="Variety name"
                      className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                    />
                  )}

                  <label className="mb-1 block text-sm text-zinc-500">
                    Date of planting (D.O.P){" "}
                    <span className="text-zinc-400">— optional</span>
                  </label>
                  <input
                    type="date"
                    value={form.dop}
                    onChange={(e) => setForm((f) => ({ ...f, dop: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    The Package of Practices schedule is counted from this date.
                  </p>
                </>
              )}
            </div>

            <p className="mt-3 text-xs text-zinc-500">
              The farmer stays <strong>Incomplete</strong> until they have an agronomist, a farm
              boundary and at least one crop. The farm boundary is drawn in the mobile app.
            </p>

            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? "Adding…" : "Add farmer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
