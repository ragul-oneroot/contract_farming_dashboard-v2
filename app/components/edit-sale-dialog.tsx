"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, type Fpo, type Person, type Product, type ProductSale } from "../lib/api";

const round2 = (n: number) => Math.round(n * 100) / 100;
/**
 * GST on farm inputs is 5%, already inside every price — the figure on a product
 * is what the farmer pays. The taxable value is worked backwards out of it, the
 * same way the row behind this dialog and the printed bill do.
 */
const taxableOf = (inclusive: number) => round2(inclusive / 1.05);
const money = (n: number) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Line = {
  productId: string;
  name: string;
  qty: string;
  unitPrice: string;
  discount: string;
  discountType: "rs" | "pct";
  /** Whether this line already carries a handover photo, which an edit keeps. */
  hasPhoto: boolean;
};

/** One line of the totals ladder. */
function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/** The day of a sale, as an <input type="date"> wants it — in local time. */
function asInputDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Correcting a sale the office has found a mistake in.
 *
 * Everything on the bill can be changed here — who bought, who sold, the crop,
 * the products, the prices, the discounts, the date, the note, and the invoice
 * number itself.
 *
 * Changing the number is called out on screen, because it is the one correction
 * the farmer cannot see from their own copy: their paper still reads the old
 * one. The handover photographs are the exception that stays — they are what
 * somebody saw in a field, and cannot honestly be swapped from a desk.
 *
 * The running total is a preview, not the answer. The server recomputes every
 * figure from the quantities, prices and discounts sent to it, which is why the
 * dialog closes on the sale the server returns.
 */
export function EditSaleDialog({
  sale,
  onClose,
  onSaved,
}: {
  sale: ProductSale;
  onClose: () => void;
  onSaved: (updated: ProductSale) => void;
}) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [farmers, setFarmers] = useState<Person[]>([]);
  const [fpos, setFpos] = useState<Fpo[]>([]);
  const [agronomists, setAgronomists] = useState<Person[]>([]);

  const startedAsFpo = !!(sale.fpo?._id || sale.fpoName);
  const [buyerKind, setBuyerKind] = useState<"farmer" | "fpo">(startedAsFpo ? "fpo" : "farmer");
  const [farmerId, setFarmerId] = useState(sale.farmer?._id ?? "");
  const [fpoId, setFpoId] = useState(sale.fpo?._id ?? "");
  const [agronomistId, setAgronomistId] = useState(sale.agronomist?._id ?? "");
  const [cropName, setCropName] = useState(sale.cropName ?? "");
  const [invoiceNo, setInvoiceNo] = useState(sale.invoiceNo ?? "");

  const [lines, setLines] = useState<Line[]>(() =>
    sale.items.map((it) => ({
      productId: it.product,
      name: it.name,
      qty: String(it.qty ?? 1),
      unitPrice: String(it.unitPrice ?? 0),
      discount: it.discount ? String(it.discount) : "",
      discountType: it.discountType === "pct" ? "pct" : "rs",
      hasPhoto: !!it.beforePhotoUrl,
    }))
  );
  const [basketOff, setBasketOff] = useState(sale.discount ? String(sale.discount) : "");
  const [basketOffType, setBasketOffType] = useState<"rs" | "pct">(
    sale.discountType === "pct" ? "pct" : "rs"
  );
  const [soldAt, setSoldAt] = useState(asInputDate(sale.soldAt));
  const [notes, setNotes] = useState(sale.notes ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProducts().then(setCatalog).catch(() => setCatalog([]));
    api.listAgronomists().then(setAgronomists).catch(() => setAgronomists([]));
    // A page each: enough to find anyone by scrolling the select, and the sale's
    // own buyer is added below whether or not they land in it.
    api
      .listFarmersPage({ page: 1, limit: 500 })
      .then((r) => setFarmers(r.items))
      .catch(() => setFarmers([]));
    api
      .listFposPage({ page: 1, limit: 500 })
      .then((r) => setFpos(r.items))
      .catch(() => setFpos([]));
  }, []);

  const preview = useMemo(() => {
    const rows = lines.map((l) => {
      const gross = round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
      const entered = Math.max(0, Number(l.discount) || 0);
      const off = Math.min(gross, round2(l.discountType === "pct" ? (gross * entered) / 100 : entered));
      return { gross, off, net: round2(gross - off) };
    });
    const subtotal = round2(rows.reduce((n, r) => n + r.net, 0));
    const enteredBasket = Math.max(0, Number(basketOff) || 0);
    const basket = Math.min(
      subtotal,
      round2(basketOffType === "pct" ? (subtotal * enteredBasket) / 100 : enteredBasket)
    );
    const total = round2(subtotal - basket);

    /**
     * The same ladder the sale's own row shows, so nobody has to hold two
     * different pictures of one bill in their head while editing it.
     *
     * The discount is taken as the gap between the two taxable figures rather
     * than divided out on its own: both agree to the paisa almost always, but
     * only this way is Subtotal − discount guaranteed to land exactly on the
     * taxable value with no crumb left on screen.
     */
    const taxable = taxableOf(total);
    const cgst = round2(taxable * 0.025);
    const subtotalEx = taxableOf(subtotal);
    return {
      rows,
      subtotal,
      basket,
      total,
      subtotalEx,
      basketEx: round2(subtotalEx - taxable),
      taxable,
      cgst,
      sgst: round2(total - taxable - cgst),
    };
  }, [lines, basketOff, basketOffType]);

  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const addLine = () => {
    const first = catalog[0];
    if (!first) return;
    setLines((ls) => [
      ...ls,
      {
        productId: first._id,
        name: first.name,
        qty: "1",
        unitPrice: String(first.price ?? 0),
        discount: "",
        discountType: "rs",
        hasPhoto: false,
      },
    ]);
  };

  const save = async () => {
    if (!lines.length) {
      setError("A sale needs at least one product.");
      return;
    }
    if (buyerKind === "farmer" && !farmerId) {
      setError("Choose the farmer this sale went to.");
      return;
    }
    if (buyerKind === "fpo" && !fpoId) {
      setError("Choose the FPO this sale went to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProductSale(sale._id, {
        items: lines.map((l) => ({
          productId: l.productId,
          qty: Number(l.qty) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          discount: Math.max(0, Number(l.discount) || 0),
          discountType: l.discountType,
        })),
        discount: Math.max(0, Number(basketOff) || 0),
        discountType: basketOffType,
        // One buyer, never both — the server refuses a request carrying two.
        farmerId: buyerKind === "farmer" ? farmerId : null,
        fpoId: buyerKind === "fpo" ? fpoId : null,
        agronomistId: agronomistId || undefined,
        invoiceNo,
        cropName,
        notes,
        // Local midday, not midnight: IST sits five and a half hours off UTC,
        // and a bare date is close enough to the edge to file the sale a day out.
        soldAt: new Date(`${soldAt}T12:00:00`).toISOString(),
        reason: reason.trim(),
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the changes.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
  const label = "mb-1 block text-xs font-medium text-zinc-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
          <div>
            <h2 className="text-lg font-semibold">Edit sale</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              recorded {new Date(sale.createdAt).toLocaleDateString()} · the handover photos stay as
              they are
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Who bought, who sold, and what it was for. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>Sold to</span>
              <div className="flex gap-2">
                <select
                  value={buyerKind}
                  onChange={(e) => setBuyerKind(e.target.value as "farmer" | "fpo")}
                  className="rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700"
                >
                  <option value="farmer">Farmer</option>
                  <option value="fpo">FPO</option>
                </select>
                {buyerKind === "farmer" ? (
                  <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} className={field}>
                    <option value="">Choose a farmer…</option>
                    {/* The sale's own buyer first, in case they are not on the
                        page of farmers that was loaded. */}
                    {sale.farmer?._id && !farmers.some((f) => f._id === sale.farmer?._id) && (
                      <option value={sale.farmer._id}>{sale.farmer.name} (current)</option>
                    )}
                    {farmers.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} · {f.mobile}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={fpoId} onChange={(e) => setFpoId(e.target.value)} className={field}>
                    <option value="">Choose an FPO…</option>
                    {sale.fpo?._id && !fpos.some((f) => f._id === sale.fpo?._id) && (
                      <option value={sale.fpo._id}>{sale.fpo.name} (current)</option>
                    )}
                    {fpos.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} · {f.mobile}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <label className="text-sm">
              <span className={label}>Sold by</span>
              <select
                value={agronomistId}
                onChange={(e) => setAgronomistId(e.target.value)}
                className={field}
              >
                <option value="">{sale.agronomistName || "Unchanged"}</option>
                {agronomists.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} · {a.mobile}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className={label}>Date of sale</span>
              <input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} className={field} />
            </label>

            {/* Editable, but not lightly: the farmer's copy still reads the old
                number, so the change is written into the trail by name. */}
            <label className="text-sm">
              <span className={label}>Invoice number</span>
              <input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, ""))}
                placeholder="ENP-GOK01"
                className={`${field} font-mono`}
              />
              {invoiceNo !== (sale.invoiceNo ?? "") && (
                <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                  The farmer&apos;s copy still reads {sale.invoiceNo || "no number"}
                </span>
              )}
            </label>

            <label className="text-sm">
              <span className={label}>Crop</span>
              <input
                value={cropName}
                onChange={(e) => setCropName(e.target.value)}
                placeholder="Optional"
                className={field}
              />
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Rate</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-3 py-2">
                      <select
                        value={l.productId}
                        onChange={(e) => {
                          const p = catalog.find((c) => c._id === e.target.value);
                          set(i, {
                            productId: e.target.value,
                            name: p?.name ?? l.name,
                            unitPrice: p ? String(p.price ?? 0) : l.unitPrice,
                          });
                        }}
                        className="w-44 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                      >
                        {/* The sale's own product stays selectable even if it has
                            since been removed from the catalogue. */}
                        {!catalog.some((c) => c._id === l.productId) && (
                          <option value={l.productId}>{l.name}</option>
                        )}
                        {catalog.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {l.hasPhoto && <div className="mt-1 text-[11px] text-zinc-400">handover photo kept</div>}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={l.qty}
                        onChange={(e) => set(i, { qty: e.target.value })}
                        inputMode="decimal"
                        className="w-16 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={l.unitPrice}
                        onChange={(e) => set(i, { unitPrice: e.target.value })}
                        inputMode="decimal"
                        className="w-24 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={l.discount}
                          onChange={(e) => set(i, { discount: e.target.value })}
                          placeholder="0"
                          inputMode="decimal"
                          className="w-16 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                        />
                        <select
                          value={l.discountType}
                          onChange={(e) => set(i, { discountType: e.target.value as "rs" | "pct" })}
                          className="rounded-lg border border-zinc-300 bg-transparent px-1 py-1 dark:border-zinc-700"
                        >
                          <option value="rs">₹</option>
                          <option value="pct">%</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(preview.rows[i]?.net ?? 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                        className="rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        aria-label={`Remove ${l.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={addLine}
            disabled={!catalog.length}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <Plus size={14} /> Add product
          </button>

          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/50">
            <label className="text-sm">
              <span className={label}>Discount on the whole basket</span>
              <div className="flex items-center gap-1">
                <input
                  value={basketOff}
                  onChange={(e) => setBasketOff(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="w-24 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                />
                <select
                  value={basketOffType}
                  onChange={(e) => setBasketOffType(e.target.value as "rs" | "pct")}
                  className="rounded-lg border border-zinc-300 bg-transparent px-1 py-1 dark:border-zinc-700"
                >
                  <option value="rs">₹</option>
                  <option value="pct">%</option>
                </select>
              </div>
            </label>
            {/* The whole ladder, as the row and the printed bill show it — not
                just the figure at the bottom. Somebody correcting a sale is
                usually checking the tax too. */}
            <div className="min-w-[15rem] text-sm">
              <Line label="Subtotal" value={money(preview.subtotalEx)} />
              {preview.basketEx > 0 && (
                <Line label="Less : Discount" value={`− ${money(preview.basketEx)}`} tone="text-red-600" />
              )}
              <Line label="Taxable value" value={money(preview.taxable)} />
              <Line label="CGST 2.5%" value={money(preview.cgst)} />
              <Line label="SGST 2.5%" value={money(preview.sgst)} />
              <div className="mt-1 flex items-center justify-between gap-6 border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
                <span className="font-semibold">Total payable</span>
                <span className="text-base font-bold text-green-600">{money(preview.total)}</span>
              </div>
              {round2(preview.total) !== round2(sale.total) && (
                <div className="text-right text-xs text-amber-600 dark:text-amber-400">
                  was {money(sale.total)}
                </div>
              )}
              <div className="text-right text-[11px] text-zinc-400">Prices include 5% GST</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className={label}>Note on the bill</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className={field}
              />
            </label>
            <label className="text-sm">
              <span className={label}>Why is this being corrected? (kept with the sale)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. quantity was entered twice"
                className={field}
              />
            </label>
          </div>

          {sale.edits && sale.edits.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
              <div className="mb-1 font-semibold text-zinc-600 dark:text-zinc-300">Earlier corrections</div>
              {sale.edits.map((e, i) => (
                <div key={i}>
                  {new Date(e.at).toLocaleString()} · {e.by} · {money(e.wasTotal)} → {money(e.nowTotal)}
                  {e.nowInvoiceNo ? ` · number ${e.wasInvoiceNo || "(none)"} → ${e.nowInvoiceNo}` : ""}
                  {e.reason ? ` · ${e.reason}` : ""}
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-900">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
