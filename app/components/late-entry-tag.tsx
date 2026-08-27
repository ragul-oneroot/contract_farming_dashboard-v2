import { Clock } from "lucide-react";

import type { ProductSale } from "../lib/api";

/**
 * How far apart the sale and its record have to be before it counts as entered
 * late. An agent typing up the day's rounds after dinner is ordinary; two days
 * of slack keeps that out of it.
 */
const LATE_ENTRY_MS = 2 * 86_400_000;

type Sale = Pick<ProductSale, "soldAt" | "createdAt">;

export const lateEntryDays = (s: Sale) =>
  Math.round((new Date(s.createdAt).getTime() - new Date(s.soldAt).getTime()) / 86_400_000);

export const isLateEntry = (s: Sale) =>
  !!s.createdAt && new Date(s.createdAt).getTime() - new Date(s.soldAt).getTime() > LATE_ENTRY_MS;

/**
 * The day alone, for a date nobody actually recorded a time for.
 *
 * A backdated sale is entered from a calendar: the agent remembers the day,
 * not the hour. Something has to be stored as an instant, and it is midday —
 * far from either edge of the day, so no timezone can slide the sale onto the
 * day before. Printing that midday back as "12:00 PM" would dress an invented
 * number up as an observation, so the time is simply not shown.
 */
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** When it was typed, which IS a real instant we watched happen. */
const fmtMoment = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The pill on a sale that was written up well after it happened.
 *
 * The date on a row is the day of the handover, which is what the office
 * reconciles against — but a sale typed in from memory is not the same kind of
 * record as one made with the farmer standing there, and nothing else on the
 * row would say so.
 */
export function LateEntryTag({ sale }: { sale: Sale }) {
  if (!isLateEntry(sale)) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      <Clock size={10} /> OLD SALE
    </span>
  );
}

/**
 * The two dates behind the pill, written out on the row itself.
 *
 * This was a hover card once. It is not any more: the detail is what someone
 * reconciling a row actually needs, and making them find it with the cursor
 * hid it from anyone scanning the list — and from touch entirely. The row has
 * the width to simply say it.
 */
export function LateEntryNote({ sale, className = "" }: { sale: Sale; className?: string }) {
  if (!isLateEntry(sale)) return null;
  return (
    <div className={`text-xs leading-snug text-zinc-500 ${className}`}>
      <div className="font-semibold text-amber-700 dark:text-amber-400">
        Recorded {plural(lateEntryDays(sale))} after the sale
      </div>
      <div>Sold {fmtDay(sale.soldAt)}</div>
      <div>Entered {fmtMoment(sale.createdAt)}</div>
    </div>
  );
}
