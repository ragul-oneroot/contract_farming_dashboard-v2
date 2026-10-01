"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Minus, Plus, Search, Trash2, Undo2, X } from "lucide-react";

import {
  api,
  type Product,
  type StaffStock,
  type StockEntryType,
  type StockSummaryRow,
} from "../lib/api";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

/** Today in the browser's own time zone - toISOString alone is UTC, a day behind before 5:30 IST. */
const localDay = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const TYPE_LABEL: Record<StockEntryType, string> = {
  opening: "Opening count",
  issue: "Issued",
  return: "Returned",
  adjust: "Adjustment",
};
const TYPE_STYLE: Record<StockEntryType, string> = {
  opening: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  issue: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  return: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  adjust: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

/**
 * Who is carrying how much stock.
 *
 * Nothing here stores a stock figure. What each person holds is their opening
 * count, plus what the office issued, less what they returned and sold, plus
 * any adjustment - so every number can be opened up and traced.
 */
export default function StockPage() {
  const [rows, setRows] = useState<StockSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ staff: string; type: StockEntryType } | null>(null);

  const load = useCallback(() => {
    api
      .stockSummary()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load stock"));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => !t || r.name.toLowerCase().includes(t) || r.mobile.includes(t) || r.region.toLowerCase().includes(t)
    );
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      units: (rows ?? []).reduce((n, r) => n + r.units, 0),
      value: (rows ?? []).reduce((n, r) => n + r.value, 0),
      holding: (rows ?? []).filter((r) => r.units > 0).length,
      short: (rows ?? []).filter((r) => r.short > 0).length,
    }),
    [rows]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Stock with staff" value={inr(totals.value)} />
        <Stat label="Units in hand" value={totals.units.toLocaleString("en-IN")} />
        <Stat label="Staff holding stock" value={String(totals.holding)} />
        <Stat label="Staff with shortages" value={String(totals.short)} warn={totals.short > 0} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
          <h2 className="flex items-center gap-2 font-semibold">
            <Boxes size={18} className="text-green-600" /> Stock by staff
          </h2>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, region"
              className="w-64 rounded-lg border border-zinc-200 py-1.5 pl-8 pr-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>

        {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
        {!rows && !error && <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>}

        {rows && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Region</th>
                  <th className="px-4 py-2 text-right">Products</th>
                  <th className="px-4 py-2 text-right">Units in hand</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2">Counting since</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r._id}
                    onClick={() => setOpenId(r._id)}
                    className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-zinc-500">{r.mobile}</div>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{r.region || "—"}</td>
                    <td className="px-4 py-2.5 text-right">{r.products}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {r.units.toLocaleString("en-IN")}
                      {r.short > 0 && (
                        <span
                          title={`${r.short} product(s) sold beyond what was given`}
                          className="ml-2 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
                        >
                          <AlertTriangle size={11} /> {r.short} short
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">{inr(r.value)}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {r.since ? fmtDate(r.since) : <span className="text-zinc-400">Not started</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEntry({ staff: r._id, type: r.since ? "issue" : "opening" })}
                        className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        {r.since ? "Issue stock" : "Enter opening stock"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                      No staff match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && (
        <StaffPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onEntry={(type) => setEntry({ staff: openId, type })}
          // Re-read after every saved entry, so the panel and the table agree.
          version={rows}
        />
      )}
      {entry && (
        <EntryDialog
          staff={rows?.find((r) => r._id === entry.staff) ?? null}
          initialType={entry.type}
          onClose={() => setEntry(null)}
          onSaved={() => {
            setEntry(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

/** One person's stock, product by product, and every entry behind it. */
function StaffPanel({
  id,
  onClose,
  onEntry,
  version,
}: {
  id: string;
  onClose: () => void;
  onEntry: (type: StockEntryType) => void;
  version: unknown;
}) {
  const [data, setData] = useState<StaffStock | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .staffStock(id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load"));
    return () => {
      live = false;
    };
  }, [id, version]);

  const lines = data?.lines.filter((l) => l.inHand !== 0 || l.opening || l.issued) ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start gap-3 border-b border-zinc-100 bg-white px-5 py-4 dark:border-zinc-900 dark:bg-zinc-950">
          <div>
            <h2 className="text-lg font-semibold">{data?.staff.name ?? "…"}</h2>
            <p className="text-xs text-zinc-500">
              {data?.staff.mobile}
              {data?.since && ` · counting since ${fmtDate(data.since)}`}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {!data?.since && (
            <ActionBtn onClick={() => onEntry("opening")} icon={<Plus size={14} />} label="Opening stock" primary />
          )}
          <ActionBtn onClick={() => onEntry("issue")} icon={<Plus size={14} />} label="Issue stock" primary={!!data?.since} />
          <ActionBtn onClick={() => onEntry("return")} icon={<Undo2 size={14} />} label="Record return" />
          <ActionBtn onClick={() => onEntry("adjust")} icon={<Minus size={14} />} label="Adjust" />
        </div>

        {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}

        <div className="px-5 py-4">
          <h3 className="mb-2 text-sm font-semibold">In hand</h3>
          {data && !lines.length && <p className="text-sm text-zinc-500">No stock recorded yet.</p>}
          {!!lines.length && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Opening</th>
                    <th className="px-3 py-2 text-right">Issued</th>
                    <th className="px-3 py-2 text-right">Returned</th>
                    <th className="px-3 py-2 text-right">Adjusted</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">In hand</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={`${l.product}:${l.variant}`} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.name}</div>
                        {l.unit && <div className="text-xs text-zinc-500">{l.unit}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">{l.opening || "—"}</td>
                      <td className="px-3 py-2 text-right">{l.issued || "—"}</td>
                      <td className="px-3 py-2 text-right">{l.returned || "—"}</td>
                      <td className="px-3 py-2 text-right">{l.adjusted ? (l.adjusted > 0 ? `+${l.adjusted}` : l.adjusted) : "—"}</td>
                      <td className="px-3 py-2 text-right">{l.sold || "—"}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${l.inHand < 0 ? "text-red-600" : ""}`}>
                        {l.inHand}
                        {l.inHand < 0 && <div className="text-[10px] font-normal">sold more than given</div>}
                      </td>
                      <td className="px-3 py-2 text-right">{inr(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-5 pb-6">
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          {data && !data.history.length && <p className="text-sm text-zinc-500">No entries yet.</p>}
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
            {data?.history.map((m) => {
              const q = m.type === "return" ? -m.qty : m.qty;
              return (
                <li key={m._id} className="flex items-start gap-3 py-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${TYPE_STYLE[m.type]}`}>
                    {TYPE_LABEL[m.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div>
                      {m.productName} {m.unit && <span className="text-zinc-500">· {m.unit}</span>}
                    </div>
                    {m.note && <div className="text-xs text-zinc-500">{m.note}</div>}
                  </div>
                  <div className={`w-12 text-right font-medium ${q < 0 ? "text-red-600" : "text-green-700"}`}>
                    {q > 0 ? `+${q}` : q}
                  </div>
                  <div className="w-28 text-right text-xs text-zinc-500">
                    {fmtDate(m.at)}
                    {m.by && <div>by {m.by}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-zinc-400">
            Sales are taken from Field Sales automatically and are not listed here.
          </p>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  onClick,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
        primary
          ? "bg-green-600 text-white hover:bg-green-700"
          : "border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      }`}
    >
      {icon} {label}
    </button>
  );
}

type Draft = { key: number; product: string; variant: string; qty: string };

/** Record stock given, returned, counted or corrected - several products at once. */
function EntryDialog({
  staff,
  initialType,
  onClose,
  onSaved,
}: {
  staff: StockSummaryRow | null;
  initialType: StockEntryType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<StockEntryType>(initialType);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Draft[]>([{ key: 0, product: "", variant: "", qty: "" }]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => localDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProducts()
      .then((p) => setProducts([...p].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setProducts([]));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const set = (key: number, patch: Partial<Draft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!staff) return;
    setBusy(true);
    setError(null);
    try {
      const today = localDay();
      await api.addStock({
        staff: staff._id,
        type,
        note: note.trim(),
        // Today's entries keep the exact time; a back-dated count is taken as noon that day.
        at: date === today ? undefined : new Date(`${date}T12:00:00`).toISOString(),
        items: lines
          .filter((l) => l.product)
          .map((l) => ({ product: l.product, variant: l.variant || null, qty: Number(l.qty) })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const types: StockEntryType[] = ["opening", "issue", "return", "adjust"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
          <div>
            <h2 className="text-lg font-semibold">Stock entry</h2>
            <p className="text-xs text-zinc-500">{staff?.name}</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  type === t
                    ? "bg-green-600 text-white"
                    : "border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            {type === "opening" && "What they are holding right now, from a physical count. Sales from this date on are subtracted automatically."}
            {type === "issue" && "Stock handed to them from the office or warehouse."}
            {type === "return" && "Stock they handed back. Cannot be more than they hold."}
            {type === "adjust" && "Damaged, lost or a recount difference. Use a minus number to take away (e.g. -2). A reason is required."}
          </p>

          <div className="space-y-2">
            {lines.map((l) => {
              const p = byId.get(l.product);
              return (
                <div key={l.key} className="flex flex-wrap items-center gap-2">
                  <select
                    value={l.product}
                    onChange={(e) => set(l.key, { product: e.target.value, variant: "" })}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <option value="">Product…</option>
                    {products.map((x) => (
                      <option key={x._id} value={x._id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  {!!p?.variants?.length && (
                    <select
                      value={l.variant}
                      onChange={(e) => set(l.key, { variant: e.target.value })}
                      className="w-32 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <option value="">Size…</option>
                      {(p.variants ?? []).map((v) => (
                        <option key={v._id} value={v._id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    value={l.qty}
                    onChange={(e) => set(l.key, { qty: e.target.value })}
                    inputMode="numeric"
                    placeholder="Qty"
                    className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  />
                  <button
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-900"
                    title="Remove line"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() =>
                setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, product: "", variant: "", qty: "" }])
              }
              className="inline-flex items-center gap-1 text-sm text-green-700 hover:underline"
            >
              <Plus size={14} /> Add another product
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-500">Date</span>
              <input
                type="date"
                value={date}
                max={localDay()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              />
            </label>
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-xs text-zinc-500">
                Note {type === "adjust" ? "(required)" : "(optional)"}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type === "adjust" ? "e.g. 2 bottles damaged in transit" : "e.g. from Gokak warehouse"}
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-zinc-400">Entries cannot be edited or deleted. Fix a mistake with an Adjustment.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-900">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !lines.some((l) => l.product && l.qty)}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
