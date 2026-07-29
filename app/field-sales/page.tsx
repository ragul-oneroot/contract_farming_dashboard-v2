"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin, ShoppingBag } from "lucide-react";
import { api, Person, ProductSale } from "../lib/api";

function fmtTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const money = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Before/after pair for one product. The after-photo is taken on a follow-up
 * visit a week later, so a missing one is "still waiting" rather than a gap —
 * only an overdue one is worth flagging.
 */
function ProofPhotos({
  before,
  after,
  dueAt,
}: {
  before: string;
  after: string;
  dueAt: string | null;
}) {
  const due = dueAt ? new Date(dueAt) : null;
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86_400_000) : 0;
  const overdue = !after && (!due || daysLeft <= 0);

  return (
    <div className="flex gap-2">
      <div>
        {before ? (
          <a href={before} target="_blank" rel="noopener noreferrer" className="group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={before}
              alt="Before photo"
              className="h-24 w-24 rounded-lg object-cover ring-1 ring-zinc-200 group-hover:ring-green-500 dark:ring-zinc-700"
            />
          </a>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-zinc-100 text-[11px] text-zinc-400 dark:bg-zinc-900">
            No photo
          </div>
        )}
        <div className="mt-1 text-center text-[11px] text-zinc-500">Before</div>
      </div>

      <div>
        {after ? (
          <a href={after} target="_blank" rel="noopener noreferrer" className="group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={after}
              alt="After photo"
              className="h-24 w-24 rounded-lg object-cover ring-1 ring-zinc-200 group-hover:ring-green-500 dark:ring-zinc-700"
            />
          </a>
        ) : overdue ? (
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-lg bg-red-50 px-1 text-center text-[11px] font-medium text-red-600 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900">
            Overdue
          </div>
        ) : (
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-lg bg-amber-50 px-1 text-center text-[11px] font-medium text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
            Due in {daysLeft}d
          </div>
        )}
        <div className="mt-1 text-center text-[11px] text-zinc-500">After</div>
      </div>
    </div>
  );
}

export default function FieldSalesPage() {
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [agronomists, setPersons] = useState<Person[]>([]);
  const [who, setWho] = useState(""); // "" = everyone
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listProductSales({ agronomistId: who || undefined, since: from || undefined }),
      api.listAgronomists().catch(() => [] as Person[]),
    ])
      .then(([s, a]) => {
        setSales(s);
        setPersons(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load field sales"))
      .finally(() => setLoading(false));
  }, [who, from]);

  // Headline numbers for whatever filter is currently applied.
  const stats = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + (x.total ?? 0), 0);
    const units = sales.reduce((s, x) => s + x.items.reduce((n, i) => n + i.qty, 0), 0);
    const lines = sales.reduce((s, x) => s + x.items.length, 0);
    const complete = sales.reduce(
      (s, x) => s + x.items.filter((i) => i.beforePhotoUrl && i.afterPhotoUrl).length,
      0
    );
    // Only count an after-photo as missing once its waiting period has elapsed;
    // before that it is simply not due yet, which is not a failure.
    const overdue = sales.reduce((s, x) => {
      const due = x.afterDueAt ? new Date(x.afterDueAt).getTime() : 0;
      if (due > Date.now()) return s;
      return s + x.items.filter((i) => !i.afterPhotoUrl).length;
    }, 0);
    return { revenue, units, lines, complete, overdue };
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">Field Sales ({sales.length})</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All agronomists</option>
            {agronomists.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {(who || from) && (
            <button
              onClick={() => {
                setWho("");
                setFrom("");
              }}
              className="text-sm text-zinc-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Totals for the current filter. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Revenue", value: money(stats.revenue) },
          { label: "Sales", value: String(sales.length) },
          { label: "Units given", value: String(stats.units) },
          { label: "Both photos", value: `${stats.complete}/${stats.lines}` },
          {
            label: "After photo overdue",
            value: String(stats.overdue),
            alert: stats.overdue > 0,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
            <div className={`mt-1 text-xl font-semibold${s.alert ? " text-red-600" : ""}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : sales.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No field sales yet. They appear when an agronomist gives a product to a farmer in the app.
        </p>
      ) : (
        <div className="space-y-3">
          {sales.map((s) => {
            const hasLoc = s.location?.latitude != null && s.location?.longitude != null;
            return (
              <div
                key={s._id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {/* Who sold what to whom, and when. */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-900">
                  <div>
                    <div className="font-medium">
                      {s.agronomist?.name || s.agronomistName || "Agronomist"}
                      <span className="text-zinc-400"> → </span>
                      {s.farmerName || "Farmer"}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {fmtTime(s.soldAt)}
                      {s.farmerMobile ? ` · ${s.farmerMobile}` : ""}
                      {s.cropName ? ` · ${s.cropName}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasLoc && (
                      <a
                        href={`https://www.google.com/maps?q=${s.location.latitude},${s.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                      >
                        <MapPin size={13} /> Map <ExternalLink size={11} />
                      </a>
                    )}
                    <div className="text-lg font-semibold text-green-600">{money(s.total)}</div>
                  </div>
                </div>

                {/* One row per product, each with its own before/after proof. */}
                <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {s.items.map((it) => (
                    <div key={it.product} className="flex flex-wrap items-center gap-4 py-3">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="h-12 w-12 rounded-md object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-zinc-100 dark:bg-zinc-900" />
                      )}
                      <div className="min-w-[160px] flex-1">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-zinc-500">
                          {it.qty} × {money(it.unitPrice)}
                          {it.unit ? ` · ${it.unit}` : ""} ={" "}
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {money(it.lineTotal)}
                          </span>
                        </div>
                      </div>
                      <ProofPhotos
                        before={it.beforePhotoUrl}
                        after={it.afterPhotoUrl}
                        dueAt={s.afterDueAt}
                      />
                    </div>
                  ))}
                </div>

                {s.notes ? (
                  <div className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-600 dark:border-zinc-900 dark:text-zinc-300">
                    {s.notes}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
