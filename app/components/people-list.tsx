"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ChevronLeft, ChevronRight, ArrowRight, Plus, X } from "lucide-react";
import { api, CatalogCrop, missingDetails, Person } from "../lib/api";

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
  // Farmers also get District/Taluk/Village (from the boundary) and a Status column.
  const colCount = showDetail ? 10 : 4;
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // "Add farmer" form (farmers only).
  const [adding, setAdding] = useState(false);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [catalog, setCatalog] = useState<CatalogCrop[]>([]);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    agronomistId: "",
    crop: "",
    variety: "",
    dop: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    // The agronomist and crop dropdowns are only needed on the farmers page.
    if (role === "farmer") {
      api.listAgronomists().then(setAgronomists).catch(() => {});
      api.listCropCatalog().then(setCatalog).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const openAdd = () => {
    setForm({ name: "", mobile: "", agronomistId: "", crop: "", variety: "", dop: "" });
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
        {showDetail && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus size={15} /> Add farmer
          </button>
        )}
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
              {showDetail && <th className="px-4 py-3 font-semibold">Status</th>}
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
                      {p.agronomist ? (
                        p.agronomist.name
                      ) : (
                        <span className="text-zinc-400">Unassigned</span>
                      )}
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
