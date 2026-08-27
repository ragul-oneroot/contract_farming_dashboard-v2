"use client";

import { useId, useState } from "react";

/**
 * Charts drawn as inline SVG, deliberately without a charting library.
 *
 * The dashboard has four dependencies and no build step worth defending; adding
 * a charting package for three simple forms would be the largest thing in it.
 * These are also the only two forms the sales data needs — a trend over time and
 * a magnitude comparison — so the general machinery would go mostly unused.
 *
 * Colours come from the validated data-viz palette: blue as the single
 * sequential hue, orange as the second when two series share a chart. Both
 * modes were run through the palette validator rather than eyeballed — the four
 * hues clear the CVD, lightness and chroma gates in light and dark.
 */
const BLUE = "var(--viz-1)";

export const money = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Rupees at a glance: ₹1.2L, ₹45.0k, ₹900. Axis ticks only — never a total. */
export const shortMoney = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
};

/**
 * A period of takings, as an area with a 2px line.
 *
 * One series, so no legend: the card's title already says what is plotted, and
 * a box with a single swatch would only restate it.
 */
export function TrendChart({
  points,
  height = 200,
}: {
  points: { label: string; value: number; sales: number }[];
  height?: number;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <Empty height={height} />;
  }

  const W = 800;
  const H = height;
  const PAD = { top: 16, right: 16, bottom: 26, left: 52 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const max = Math.max(...points.map((p) => p.value), 1);
  // A single point has no span to divide by; centre it rather than divide by 0.
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.top + ih} L${x(0)},${PAD.top + ih} Z`;

  // Four ticks is enough to read a magnitude; more is grid for its own sake.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  // Labels thin out rather than overlap — measured by count, not by guessing.
  const every = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" style={{ height }}>
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity="0.18" />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Recessive grid: hairline, solid, one step off the surface. */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-zinc-400 text-[11px]"
            >
              {shortMoney(t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gid}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke={BLUE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <text
            key={`x${i}`}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-zinc-400 text-[11px]"
          >
            {i % every === 0 ? p.label : ""}
          </text>
        ))}

        {/* The hovered point, ringed in the surface colour so it stays legible
            where it sits on the line. */}
        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + ih}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth="1"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].value)}
              r="5"
              fill={BLUE}
              className="stroke-white dark:stroke-zinc-950"
              strokeWidth="2"
            />
          </g>
        ) : null}

        {/* Hit targets wider than the marks: a 5px dot is far too small to aim
            at, so each point owns a full-height band of the plot. */}
        {points.map((p, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - iw / Math.max(points.length, 1) / 2}
            y={PAD.top}
            width={iw / Math.max(points.length, 1)}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover !== null ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <div className="font-semibold">{points[hover].label}</div>
          <div className="text-zinc-500">
            {money(points[hover].value)} · {points[hover].sales} sale
            {points[hover].sales === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Magnitude, ranked high to low.
 *
 * Horizontal because the categories are names — an agronomist, a product, a
 * village — and names read badly rotated. One hue, because one series: colour
 * here would encode nothing that the length does not already say.
 */
export function RankedBars({
  rows,
  max: maxProp,
  emptyLabel = "Nothing to show",
}: {
  rows: { label: string; value: number; sub?: string }[];
  max?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">{emptyLabel}</p>;
  }
  const max = maxProp ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            {/* Direct label on every row is legitimate here: the rows are few
                and ranked, and the number IS the comparison being made. */}
            <span className="shrink-0 font-semibold tabular-nums">{money(r.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`,
                backgroundColor: BLUE,
              }}
            />
          </div>
          {r.sub ? <div className="mt-0.5 text-xs text-zinc-400">{r.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-zinc-400"
      style={{ height }}
    >
      No sales in this period
    </div>
  );
}
