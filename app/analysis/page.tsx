"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";

import { api, Person, ProductSale, saleBuyer } from "../lib/api";
import { isLateEntry, lateEntryDays, LateEntryTag } from "../components/late-entry-tag";
import { money, RankedBars, shortMoney, TrendChart } from "../components/charts";

/**
 * A period ending today, as the two yyyy-mm-dd ends of a closed window.
 *
 * Used only to seed the opening range — the page starts on the last 30 days
 * rather than on everything ever sold, which on a full database would be a slow
 * first paint answering a question nobody asked.
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function daysBack(days: number) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { from: iso(start), to: iso(new Date()) };
}

/**
 * Where a sale happened, at the level being grouped by.
 *
 * A farmer's address sits on the farmer; an FPO's on the FPO. Blank rather than
 * guessed when neither was ever geocoded — "Unknown" as a bar is honest, an
 * invented village is not.
 */
function regionOf(s: ProductSale, level: "district" | "taluk" | "village") {
  const a = s.farmer?.farmAddress ?? s.fpo?.address;
  return (a?.[level] || "").trim();
}

/** One day bucket, keyed by the local date so a chart matches the table. */
const dayKey = (d: string) => iso(new Date(d));

/**
 * Every sale, summed the ways a manager asks about them.
 *
 * Deliberately one page rather than a set: the questions — who sold, what sold,
 * where, and is it going up — are asked together and answered from the same
 * filtered set, so a figure here can always be traced to the rows below it.
 */
export default function AnalysisPage() {
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-side: these decide which sales are fetched at all.
  const [who, setWho] = useState("");
  const [from, setFrom] = useState(daysBack(29).from);
  const [to, setTo] = useState(daysBack(0).to);
  // Client-side: these narrow what has already arrived.
  const [product, setProduct] = useState("");
  const [region, setRegion] = useState("");
  const [buyerKind, setBuyerKind] = useState<"" | "farmer" | "fpo">("");
  const [query, setQuery] = useState("");

  /**
   * @param stale asked before anything is written to state. A response that
   *   arrives after the filters have moved on belongs to a window that is no
   *   longer on screen — without this, changing the date twice quickly could
   *   leave the first window's sales under the second window's heading.
   */
  const load = useCallback(
    async (stale?: () => boolean) => {
      setLoading(true);
      try {
        const [s, a] = await Promise.all([
          api.listProductSales({
            agronomistId: who || undefined,
            from: from || undefined,
            to: to || undefined,
            withAcres: true,
          }),
          api.listAgronomists().catch(() => [] as Person[]),
        ]);
        if (stale?.()) return;
        setSales(s);
        setAgronomists(a);
        setError(null);
      } catch (e) {
        if (!stale?.()) setError(e instanceof Error ? e.message : "Failed to load sales");
      } finally {
        if (!stale?.()) setLoading(false);
      }
    },
    [who, from, to]
  );

  useEffect(() => {
    let cancelled = false;
    // Wrapped rather than called straight from the effect body: `load` sets
    // state on its first line, which the compiler lint reads as a cascading
    // render when it happens synchronously during the effect.
    const run = () => load(() => cancelled);
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Products and districts actually present, so no filter can match nothing. */
  const options = useMemo(() => {
    const products = new Set<string>();
    const regions = new Set<string>();
    sales.forEach((s) => {
      s.items.forEach((i) => products.add(i.name));
      const d = regionOf(s, "district");
      if (d) regions.add(d);
    });
    return {
      products: [...products].sort((a, b) => a.localeCompare(b)),
      regions: [...regions].sort((a, b) => a.localeCompare(b)),
    };
  }, [sales]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return sales.filter((s) => {
      const buyer = saleBuyer(s);
      if (buyerKind && buyer.kind !== buyerKind) return false;
      if (product && !s.items.some((i) => i.name === product)) return false;
      if (region && regionOf(s, "district") !== region) return false;
      if (!q) return true;
      return (
        buyer.name.toLowerCase().includes(q) ||
        (!!digits && buyer.mobile.replace(/\D/g, "").includes(digits))
      );
    });
  }, [sales, buyerKind, product, region, query]);

  /**
   * The headline figures.
   *
   * `units` and `lines` count what was handed over; `revenue` is what was
   * actually charged, after both kinds of discount — the figure the company
   * collected, not the one the catalogue lists.
   */
  const kpi = useMemo(() => {
    const revenue = rows.reduce((n, s) => n + (s.total ?? 0), 0);
    const units = rows.reduce((n, s) => n + s.items.reduce((m, i) => m + i.qty, 0), 0);
    const discounts = rows.reduce(
      (n, s) =>
        n + s.items.reduce((m, i) => m + (i.discountAmount ?? 0), 0) + (s.discountAmount ?? 0),
      0
    );
    const buyers = new Set(rows.map((s) => saleBuyer(s).id ?? saleBuyer(s).name)).size;

    /**
     * Land farmed by the people sold to, counted once each.
     *
     * Summing per sale would count a farmer's five acres twice for buying
     * twice, and "acres covered" would climb with repeat trade rather than with
     * reach. FPO sales are left out entirely — an FPO has no land of its own,
     * so folding it in as nought would understate revenue per acre.
     */
    const acresByFarmer = new Map<string, number>();
    rows.forEach((s) => {
      const id = saleBuyer(s).id;
      if (id && typeof s.farmerAcres === "number") acresByFarmer.set(id, s.farmerAcres);
    });
    const acres = [...acresByFarmer.values()].reduce((n, a) => n + a, 0);
    // Only the money from farmers whose land is counted, or the ratio would
    // divide FPO revenue by land nobody in it farms.
    const farmerRevenue = rows
      .filter((s) => typeof s.farmerAcres === "number")
      .reduce((n, s) => n + (s.total ?? 0), 0);

    return {
      revenue,
      sales: rows.length,
      units,
      discounts,
      buyers,
      acres: Math.round(acres * 100) / 100,
      perAcre: acres > 0 ? farmerRevenue / acres : 0,
      avg: rows.length ? revenue / rows.length : 0,
    };
  }, [rows]);

  /** Takings per day across the chosen window, gaps included. */
  const trend = useMemo(() => {
    if (!from || !to) return [];
    const byDay = new Map<string, { value: number; sales: number }>();
    rows.forEach((s) => {
      const k = dayKey(s.soldAt);
      const cur = byDay.get(k) ?? { value: 0, sales: 0 };
      byDay.set(k, { value: cur.value + (s.total ?? 0), sales: cur.sales + 1 });
    });

    // Every day in the window, not only the ones with a sale — a line that
    // skips empty days reads as steady trade when trade actually stopped.
    const out: { label: string; value: number; sales: number }[] = [];
    const cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    let guard = 0;
    while (cursor <= end && guard++ < 400) {
      const k = iso(cursor);
      const hit = byDay.get(k) ?? { value: 0, sales: 0 };
      out.push({
        label: cursor.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        ...hit,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [rows, from, to]);

  /** Ranked totals, highest first, for each way of cutting the same money. */
  const cuts = useMemo(() => {
    const sum = (pick: (s: ProductSale) => { key: string; value: number }[]) => {
      const m = new Map<string, { value: number; n: number }>();
      rows.forEach((s) =>
        pick(s).forEach(({ key, value }) => {
          if (!key) return;
          const cur = m.get(key) ?? { value: 0, n: 0 };
          m.set(key, { value: cur.value + value, n: cur.n + 1 });
        })
      );
      return [...m.entries()]
        .map(([label, v]) => ({ label, value: v.value, n: v.n }))
        .sort((a, b) => b.value - a.value);
    };

    return {
      byPerson: sum((s) => [
        { key: s.agronomist?.name || s.agronomistName || "Unknown", value: s.total ?? 0 },
      ]),
      // Per product the money is the LINE total: a basket's overall discount
      // belongs to the basket, and splitting it across products would invent
      // per-product prices nobody agreed.
      byProduct: sum((s) => s.items.map((i) => ({ key: i.name, value: i.lineTotal ?? 0 }))),
      byRegion: sum((s) => [
        { key: regionOf(s, "district") || "No district recorded", value: s.total ?? 0 },
      ]),
    };
  }, [rows]);

  /**
   * One row per product line, not per sale.
   *
   * A spreadsheet gets pivoted, and a basket squeezed into one cell cannot be.
   * The sale's own totals repeat down its lines, which is what lets a reader sum
   * either column without double-counting the other.
   */
  const downloadCsv = () => {
    const head = [
      "Date",
      "Time",
      "Buyer",
      "Buyer type",
      "Mobile",
      "Village",
      "Taluk",
      "District",
      "Buyer acres",
      // Two columns rather than one flag: the office reconciles against dates,
      // and "when was this typed" answers more than a yes/no ever could.
      "Recorded on",
      "Entered late",
      "Agronomist",
      "Crop",
      "Product",
      "Qty",
      "Rate",
      "Line discount",
      "Line total",
      "Sale discount",
      "Sale total",
      "Notes",
    ];
    // Quote everything and double any quote inside: a farmer named O"Brien, or
    // a note with a comma, would otherwise shift every later column.
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const lines = [head.map(cell).join(",")];
    rows.forEach((s) => {
      const b = saleBuyer(s);
      const a = s.farmer?.farmAddress ?? s.fpo?.address;
      const d = new Date(s.soldAt);
      s.items.forEach((i) => {
        lines.push(
          [
            iso(d),
            d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
            b.name,
            b.kind === "fpo" ? "FPO" : "Farmer",
            b.mobile,
            a?.village ?? "",
            a?.taluk ?? "",
            a?.district ?? "",
            // Blank, not 0, on an FPO row: a spreadsheet summing this column
            // should not be told an FPO farms nought acres.
            typeof s.farmerAcres === "number" ? s.farmerAcres : "",
            s.createdAt ? new Date(s.createdAt).toLocaleString() : "",
            isLateEntry(s) ? "yes" : "",
            s.agronomist?.name || s.agronomistName || "",
            s.cropName || "",
            i.name,
            i.qty,
            i.unitPrice,
            i.discountAmount ?? 0,
            i.lineTotal ?? 0,
            s.discountAmount ?? 0,
            s.total ?? 0,
            s.notes || "",
          ]
            .map(cell)
            .join(",")
        );
      });
    });

    // A BOM, so Excel opens it as UTF-8 and rupee signs and Kannada names are
    // not mangled into Latin-1 noise.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${from || "all"}-to-${to || "today"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = !!(who || product || region || buyerKind || query);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={20} className="text-green-600" />
        <h2 className="text-lg font-semibold">
          Sales Analysis ({rows.length}
          {rows.length !== sales.length ? ` of ${sales.length}` : ""})
        </h2>
      </div>

      {/* Filters in one row above the charts, as on every other tab. */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <button
            onClick={() => load()}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by farmer, FPO or number…"
              className="w-full rounded-lg border border-zinc-300 bg-transparent py-2 pl-9 pr-3 text-sm dark:border-zinc-700"
            />
          </div>
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Download size={15} /> Download CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="text-zinc-500">Sold to</span>
          <select
            value={buyerKind}
            onChange={(e) => setBuyerKind(e.target.value as "" | "farmer" | "fpo")}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">All</option>
            <option value="farmer">Farmers</option>
            <option value="fpo">FPOs</option>
          </select>

          <span className="text-zinc-500">Agronomist</span>
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">All</option>
            {agronomists.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>

          <span className="text-zinc-500">Product</span>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">All</option>
            {options.products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <span className="text-zinc-500">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">All districts</option>
            {options.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <CalendarDays size={15} className="text-zinc-400" />
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
          {filtered && (
            <button
              onClick={() => {
                setWho("");
                setProduct("");
                setRegion("");
                setBuyerKind("");
                setQuery("");
              }}
              className="rounded-lg px-2.5 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error ? <p className="text-red-600">{error}</p> : null}

      {/* Headline numbers first: stat tiles, not a chart. A handful of totals is
          exactly the case a bar chart handles worse than plain type. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { label: "Revenue", value: money(kpi.revenue), hint: "after discounts" },
          { label: "Sales", value: String(kpi.sales) },
          { label: "Units given", value: String(kpi.units) },
          { label: "Avg sale", value: money(kpi.avg) },
          { label: "Discounts", value: money(kpi.discounts) },
          { label: "Buyers", value: String(kpi.buyers) },
          {
            label: "Acres covered",
            value: kpi.acres ? `${kpi.acres}` : "—",
            hint: "farmers' own land",
          },
          {
            label: "Per acre",
            value: kpi.perAcre ? money(kpi.perAcre) : "—",
            hint: "farmer sales only",
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">{k.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
            {k.hint ? <div className="text-[11px] text-zinc-400">{k.hint}</div> : null}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-green-600" />
          <h3 className="font-semibold">Sales per day</h3>
          <span className="text-xs text-zinc-500">
            {trend.length} day{trend.length === 1 ? "" : "s"} · hover for a day&apos;s takings
          </span>
        </div>
        {loading ? (
          <div className="h-[200px] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        ) : (
          <TrendChart points={trend} />
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { title: "By agronomist", rows: cuts.byPerson, empty: "No sales by anyone yet" },
          { title: "By product", rows: cuts.byProduct, empty: "No products sold yet" },
          { title: "By region", rows: cuts.byRegion, empty: "No regions recorded" },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="mb-3 font-semibold">{c.title}</h3>
            <RankedBars
              rows={c.rows.slice(0, 8).map((r) => ({
                label: r.label,
                value: r.value,
                sub: `${r.n} sale${r.n === 1 ? "" : "s"}`,
              }))}
              emptyLabel={c.empty}
            />
            {/* Said, not silently truncated: a top-eight that looks like the
                whole list is a chart that lies by omission. */}
            {c.rows.length > 8 ? (
              <p className="mt-3 text-xs text-zinc-400">
                Top 8 of {c.rows.length} · the CSV has them all
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* The rows behind every figure above. */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Buyer</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 text-right font-medium">Acres</th>
              <th className="px-4 py-3 font-medium">Agronomist</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Discount</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  No sales match these filters.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const b = saleBuyer(s);
                const a = s.farmer?.farmAddress ?? s.fpo?.address;
                const off =
                  s.items.reduce((n, i) => n + (i.discountAmount ?? 0), 0) +
                  (s.discountAmount ?? 0);
                return (
                  <tr
                    key={s._id}
                    className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {new Date(s.soldAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {/* Under the date here, not beside it: the column is
                          narrow and the tag is what qualifies the date. The
                          full pair of dates does not fit a table cell, so this
                          says how late it was; the export carries the exact
                          instant in its Recorded on column. */}
                      {isLateEntry(s) ? (
                        <div className="mt-1 space-y-0.5">
                          <LateEntryTag sale={s} />
                          <div className="whitespace-normal text-[11px] text-amber-700 dark:text-amber-400">
                            entered {lateEntryDays(s)} days later
                          </div>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-zinc-500">
                        {b.kind === "fpo" ? "FPO" : "Farmer"}
                        {b.mobile ? ` · ${b.mobile}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {[a?.village, a?.district].filter(Boolean).join(", ") || (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    {/* The buyer's whole holding. A dash on an FPO row, which
                        farms nothing itself, and on a farmer with no area
                        recorded — the two are told apart by the buyer type
                        beside the name. */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {typeof s.farmerAcres === "number" && s.farmerAcres > 0 ? (
                        s.farmerAcres
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{s.agronomist?.name || s.agronomistName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="line-clamp-2 max-w-[260px]">
                        {s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.items.reduce((n, i) => n + i.qty, 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                      {off > 0 ? `− ${money(off)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {money(s.total ?? 0)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-800">
                <td className="px-4 py-3" colSpan={3}>
                  {rows.length} sale{rows.length === 1 ? "" : "s"}
                </td>
                {/* Not the column added up: a farmer who bought three times
                    shows their holding on all three rows but is counted once
                    here, so the total is land reached, not land re-counted. */}
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  title="Land of the farmers sold to, each counted once"
                >
                  {kpi.acres ? kpi.acres : "—"}
                </td>
                <td className="px-4 py-3" colSpan={2} />
                <td className="px-4 py-3 text-right tabular-nums">{kpi.units}</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">
                  {kpi.discounts > 0 ? `− ${money(kpi.discounts)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-green-600">
                  {money(kpi.revenue)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        Revenue is what was charged after both kinds of discount. Axis figures are shortened
        ({shortMoney(125000)} means ₹1,25,000); every exact number is in the table and the CSV.
      </p>
    </div>
  );
}
