"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { api, Person } from "../lib/api";

const PAGE_SIZE = 12;

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
  // Farmers also get District/Taluk/Village, derived from their farm boundary.
  const colCount = showDetail ? 9 : 4;
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = role === "farmer" ? await api.listFarmers() : await api.listAgronomists();
      setPeople(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setQuery("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    // Place names are searchable too, so "Anekal" finds every farmer in that taluk.
    return people.filter((p) =>
      [p.name, p.mobile, p.farmAddress?.district, p.farmAddress?.taluk, p.farmAddress?.village]
        .some((f) => f?.toLowerCase().includes(q))
    );
  }, [people, query]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

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
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or mobile number…"
            className="w-full rounded-lg border border-zinc-300 bg-transparent py-2 pl-9 pr-3 text-sm dark:border-zinc-700"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Registered at</th>
              <th className="px-4 py-3 font-semibold">Mobile Number</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              {showDetail && <th className="px-4 py-3 font-semibold">District</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Taluk</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Village</th>}
              {showDetail && <th className="px-4 py-3 font-semibold">Agronomist</th>}
              {showDetail && <th className="px-4 py-3 font-semibold text-right">Details</th>}
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
              rows.map((p) => (
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
                      {p.agronomist ? (
                        p.agronomist.name
                      ) : (
                        <span className="text-zinc-400">Unassigned</span>
                      )}
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
              ))
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
    </div>
  );
}
