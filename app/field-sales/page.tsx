"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, ExternalLink, MapPin, ShoppingBag } from "lucide-react";
import { api, Person, ProductSale, saleBuyer } from "../lib/api";
import { PhotoThumb } from "../components/lightbox";

function fmtTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const money = (n: number) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A period ending today, as the two yyyy-mm-dd ends of a closed window.
 *
 * Both ends always, so no choice can leave one side open — an open side is what
 * made a single date read as "everything up to then" and pull in earlier days.
 */
function daysBack(days: number) {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { from: iso(start), to: iso(new Date()) };
}

/**
 * GST on farm inputs is 5%, and it is already inside every price — the figure
 * on a product is what the farmer pays. So the taxable value is worked
 * backwards out of it, exactly as the app and the PDF do.
 */
const taxableOf = (inclusive: number) => round2(inclusive / 1.05);

/**
 * The bill behind one sale.
 *
 * `saleOffEx` is derived as the gap between the two taxable figures rather than
 * by dividing the discount by 1.05 on its own: both give the same answer to the
 * paisa almost always, but only this way is Subtotal − discount guaranteed to
 * land exactly on the taxable value, with no rounding crumb left on screen.
 */
function billOf(s: ProductSale) {
  const subtotalInclusive = round2(s.items.reduce((n, i) => n + (i.lineTotal ?? 0), 0));
  const total = round2(s.total ?? 0);
  const taxable = taxableOf(total);
  const cgst = round2(taxable * 0.025);
  const subtotalEx = taxableOf(subtotalInclusive);
  return {
    subtotalEx,
    saleOffEx: round2(subtotalEx - taxable),
    taxable,
    cgst,
    sgst: round2(total - taxable - cgst),
  };
}

/** One line of the totals ladder. */
function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={tone ?? "text-zinc-500"}>{label}</span>
      <span className={tone ?? ""}>{value}</span>
    </div>
  );
}

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

  // Both shots of the same product form one group, so the lightbox arrows step
  // straight from before to after — which is the comparison being made.
  const pair = [
    ...(before ? [{ url: before, caption: "Before" }] : []),
    ...(after ? [{ url: after, caption: "After" }] : []),
  ];

  return (
    <div className="flex gap-2">
      <div>
        {before ? (
          <PhotoThumb
            url={before}
            caption="Before"
            group={pair}
            index={0}
            alt="Before photo"
            className="h-24 w-24 rounded-lg object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-zinc-100 text-[11px] text-zinc-400 dark:bg-zinc-900">
            No photo
          </div>
        )}
        <div className="mt-1 text-center text-[11px] text-zinc-500">Before</div>
      </div>

      <div>
        {after ? (
          <PhotoThumb
            url={after}
            caption="After"
            group={pair}
            index={pair.length - 1}
            alt="After photo"
            className="h-24 w-24 rounded-lg object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
          />
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
  // A closed window, not an open-ended "since": a lone date read as a picker
  // but meant "everything from here onward", with no way to bound the far end.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /**
   * Which kind of buyer. Narrowed here rather than on the server: the two live
   * in one collection and the page already has every sale it is showing, so a
   * round trip would only make the toggle feel slower than it is.
   */
  const [buyerKind, setBuyerKind] = useState<"" | "farmer" | "fpo">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listProductSales({
        agronomistId: who || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
      api.listAgronomists().catch(() => [] as Person[]),
    ])
      .then(([s, a]) => {
        setSales(s);
        setPersons(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load field sales"))
      .finally(() => setLoading(false));
  }, [who, from, to]);

  const rows = useMemo(
    () => (buyerKind ? sales.filter((s) => saleBuyer(s).kind === buyerKind) : sales),
    [sales, buyerKind]
  );

  /** How the fetched set splits, so each option can carry its own count. */
  const kinds = useMemo(
    () => ({
      farmer: sales.filter((s) => saleBuyer(s).kind === "farmer").length,
      fpo: sales.filter((s) => saleBuyer(s).kind === "fpo").length,
    }),
    [sales]
  );

  // Headline numbers for whatever filter is currently applied.
  const stats = useMemo(() => {
    const revenue = rows.reduce((s, x) => s + (x.total ?? 0), 0);
    const units = rows.reduce((s, x) => s + x.items.reduce((n, i) => n + i.qty, 0), 0);
    const lines = rows.reduce((s, x) => s + x.items.length, 0);
    const complete = rows.reduce(
      (s, x) => s + x.items.filter((i) => i.beforePhotoUrl && i.afterPhotoUrl).length,
      0
    );
    // Only count an after-photo as missing once its waiting period has elapsed;
    // before that it is simply not due yet, which is not a failure.
    const overdue = rows.reduce((s, x) => {
      const due = x.afterDueAt ? new Date(x.afterDueAt).getTime() : 0;
      if (due > Date.now()) return s;
      return s + x.items.filter((i) => !i.afterPhotoUrl).length;
    }, 0);
    /**
     * Everything taken off the list price — the per-product discounts plus the
     * basket-wide ones. Worth its own figure: it is the difference between what
     * the catalogue says and what the company actually collected, and until now
     * nothing on this page showed it at all.
     */
    const discounts = rows.reduce((n, x) => {
      const lines = x.items.reduce((m, i) => m + (i.discountAmount ?? 0), 0);
      return n + lines + (x.discountAmount ?? 0);
    }, 0);
    return { revenue, units, lines, complete, overdue, discounts };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">
            Field Sales ({rows.length}
            {rows.length !== sales.length ? ` of ${sales.length}` : ""})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Farmer or FPO. A segmented control rather than another dropdown:
              there are only two kinds of buyer and the split is the thing being
              asked about, so it is worth seeing without opening anything. */}
          <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
            {(
              [
                { key: "", label: "All", n: sales.length },
                { key: "farmer", label: "Farmers", n: kinds.farmer },
                { key: "fpo", label: "FPOs", n: kinds.fpo },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => setBuyerKind(o.key)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  buyerKind === o.key
                    ? "bg-green-600 text-white"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                {o.label}
                <span className={buyerKind === o.key ? "ml-1.5 opacity-80" : "ml-1.5 text-zinc-400"}>
                  {o.n}
                </span>
              </button>
            ))}
          </div>
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
          {/* Periods, then one exact day.
              Two date boxes read as a range, but either could be left empty —
              filling only the second meant "everything up to then", which
              quietly included days before it. Every choice here sets BOTH ends,
              so a date always means that date. */}
          <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
            {(
              [
                { key: "today", label: "Today", days: 0 },
                { key: "7d", label: "7 days", days: 6 },
                { key: "30d", label: "30 days", days: 29 },
              ] as const
            ).map((o) => {
              const range = daysBack(o.days);
              const on = from === range.from && to === range.to;
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    if (on) {
                      setFrom("");
                      setTo("");
                    } else {
                      setFrom(range.from);
                      setTo(range.to);
                    }
                  }}
                  className={`px-3 py-1.5 text-sm font-medium transition ${
                    on ? "bg-green-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2 dark:border-zinc-700">
            <CalendarDays size={15} className="text-zinc-400" />
            <input
              type="date"
              value={from && from === to ? from : ""}
              // One day, both ends. Picking 23 Aug shows the 23rd and nothing else.
              onChange={(e) => {
                setFrom(e.target.value);
                setTo(e.target.value);
              }}
              className="bg-transparent py-1.5 text-sm outline-none"
            />
          </div>
          {(who || from || to || buyerKind) && (
            <button
              onClick={() => {
                setWho("");
                setFrom("");
                setTo("");
                setBuyerKind("");
              }}
              className="text-sm text-zinc-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Totals for the current filter. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Revenue", value: money(stats.revenue) },
          { label: "Discounts given", value: money(stats.discounts) },
          { label: "Sales", value: String(rows.length) },
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {sales.length === 0
            ? "No field sales yet. They appear when an agronomist gives a product to a farmer or an FPO in the app."
            : `No sales to ${buyerKind === "fpo" ? "FPOs" : "farmers"} match these filters.`}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((s) => {
            const hasLoc = s.location?.latitude != null && s.location?.longitude != null;
            const bill = billOf(s);
            // Farmer or FPO — one helper, so the two can never be shown as
            // each other.
            const buyer = saleBuyer(s);
            return (
              <div
                key={s._id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                {/* Who gave what to whom, and when — the head of a bill. */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {buyer.name}
                      {/* Said, not implied: without it an FPO sale reads as a
                          farmer sale whose details happen to be missing. */}
                      {buyer.kind === "fpo" ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          FPO
                        </span>
                      ) : null}
                      {buyer.mobile ? (
                        <span className="text-sm font-normal text-zinc-500">{buyer.mobile}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {fmtTime(s.soldAt)} · by{" "}
                      {s.agronomist?.name || s.agronomistName || "Agronomist"}
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
                    {/* The same PDF the agronomist hands the farmer, so office
                        and field are never reconciling two different bills. */}
                    <a
                      href={api.saleInvoicePdfUrl(s._id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      <Download size={13} /> Bill
                    </a>
                    <div className="text-lg font-semibold text-green-600">{money(s.total)}</div>
                  </div>
                </div>

                {/* One row per product: the invoice columns, then the proof. */}
                <div className="hidden px-4 pt-3 text-[10px] uppercase tracking-wide text-zinc-500 sm:flex">
                  <span className="flex-1">Product</span>
                  <span className="w-16 text-right">Qty</span>
                  <span className="w-24 text-right">Rate</span>
                  <span className="w-28 text-right">Amount</span>
                  <span className="w-28 text-right">Discount</span>
                  <span className="w-28 text-right">Net</span>
                  <span className="w-52 pl-4">Proof</span>
                </div>
                <div className="divide-y divide-zinc-100 px-4 dark:divide-zinc-900">
                  {s.items.map((it, i) => {
                    const gross = round2(it.qty * it.unitPrice);
                    const off = round2(it.discountAmount ?? 0);
                    return (
                      <div
                        key={`${it.product}-${i}`}
                        className="flex flex-wrap items-center gap-y-2 py-3 sm:flex-nowrap"
                      >
                        <div className="flex min-w-[180px] flex-1 items-center gap-3">
                          {it.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.imageUrl}
                              alt={it.name}
                              className="h-11 w-11 rounded-md object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-md bg-zinc-100 dark:bg-zinc-900" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{it.name}</div>
                            {it.unit ? (
                              <div className="text-xs text-zinc-500">{it.unit}</div>
                            ) : null}
                          </div>
                        </div>
                        <span className="w-16 text-right text-sm">{it.qty}</span>
                        <span className="w-24 text-right text-sm">{money(it.unitPrice)}</span>
                        {/* Stated ex-tax, the way the app states it and the way
                            a GST bill reads — the tax is added once at the end,
                            so this will not equal qty x rate. */}
                        <span className="w-28 text-right text-sm">{money(taxableOf(gross))}</span>
                        <span className="w-28 text-right text-sm text-red-600">
                          {off > 0
                            ? `${it.discountType === "pct" ? `${it.discount}% ` : ""}− ${money(off)}`
                            : "—"}
                        </span>
                        <span className="w-28 text-right text-sm font-semibold">
                          {money(taxableOf(round2(gross - off)))}
                        </span>
                        <div className="w-52 pl-4">
                          <ProofPhotos
                            before={it.beforePhotoUrl}
                            after={it.afterPhotoUrl}
                            dueAt={s.afterDueAt}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* The bill, in the same order the app shows it: what the items
                    come to, what came off, what is taxable, the tax, the total. */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-900 dark:bg-zinc-900/40">
                  <div className="min-w-[180px] flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {s.notes ? s.notes : <span className="italic text-zinc-400">No notes</span>}
                  </div>
                  <div className="w-full max-w-xs space-y-1 text-sm sm:w-auto">
                    <Row label="Subtotal" value={money(bill.subtotalEx)} />
                    {bill.saleOffEx > 0 ? (
                      <Row
                        label={
                          s.discountType === "pct"
                            ? `Overall discount (${s.discount}%)`
                            : "Overall discount"
                        }
                        value={`− ${money(bill.saleOffEx)}`}
                        tone="text-red-600"
                      />
                    ) : null}
                    <Row label="Taxable value" value={money(bill.taxable)} />
                    <Row label="CGST 2.5%" value={money(bill.cgst)} />
                    <Row label="SGST 2.5%" value={money(bill.sgst)} />
                    <div className="mt-1 flex items-center justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
                      <span className="font-semibold">Total payable</span>
                      <span className="text-base font-bold text-green-600">{money(s.total)}</span>
                    </div>
                    <div className="text-right text-[11px] text-zinc-400">
                      Prices include 5% GST
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
