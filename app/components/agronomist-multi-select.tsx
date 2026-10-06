"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Pick any number of agronomists - none picked means everyone.
 *
 * The value is a list of ids; pages send it to the server comma-separated
 * (`?agronomist=a,b`), which every list endpoint accepts. `noneLabel` adds an
 * extra row for "nobody" (sent as `none`), e.g. farmers with no agronomist.
 */
export function AgronomistMultiSelect({
  agronomists,
  value,
  onChange,
  allLabel = "All agronomists",
  noneLabel,
}: {
  agronomists: { _id: string; name: string; mobile?: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  allLabel?: string;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  /**
   * Where the panel sits, in screen pixels. Fixed rather than absolute: the
   * filter bars sit inside scrolling, clipped containers, and an absolute
   * panel was cut off by them and slid under the sidebar.
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const PANEL_W = 288;

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = box.current?.getBoundingClientRect();
    if (r) {
      // Under the button, starting at its left edge, kept on screen.
      const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_W - 8);
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(true);
  };

  // Close on a click outside, and on scroll or resize, where the panel would
  // otherwise be left floating away from its button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const close = (e: Event) => {
      if (e.type === "scroll" && box.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const options = useMemo(() => {
    const all = [
      ...(noneLabel ? [{ _id: "none", name: noneLabel, mobile: "" }] : []),
      ...[...agronomists].sort((a, b) => a.name.localeCompare(b.name)),
    ];
    const t = q.trim().toLowerCase();
    return t ? all.filter((a) => a.name.toLowerCase().includes(t) || (a.mobile ?? "").includes(t)) : all;
  }, [agronomists, noneLabel, q]);

  const picked = new Set(value);
  const toggle = (id: string) => onChange(picked.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? value[0] === "none"
          ? noneLabel
          : (agronomists.find((a) => a._id === value[0])?.name ?? "1 agronomist")
        : `${value.length} agronomists`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm ${
          value.length
            ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <span className="max-w-44 truncate">{label}</span>
        {value.length > 0 ? (
          <X
            size={14}
            className="text-zinc-500 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          />
        ) : (
          <ChevronDown size={14} className="text-zinc-400" />
        )}
      </button>

      {open && pos && (
        <div
          style={{ top: pos.top, left: pos.left, width: PANEL_W }}
          className="fixed z-50 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center gap-2 border-b border-zinc-100 px-2 dark:border-zinc-900">
            <Search size={14} className="text-zinc-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agronomist"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="flex justify-between px-3 py-1.5 text-xs">
            <button
              type="button"
              onClick={() => onChange([...new Set([...value, ...options.map((o) => o._id)])])}
              className="text-green-700 hover:underline"
            >
              Select {q ? "shown" : "all"}
            </button>
            <button type="button" onClick={() => onChange([])} className="text-zinc-500 hover:underline">
              Clear
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto pb-1">
            {options.map((a) => (
              <li key={a._id}>
                <button
                  type="button"
                  onClick={() => toggle(a._id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      picked.has(a._id) ? "border-green-600 bg-green-600 text-white" : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {picked.has(a._id) && <Check size={12} />}
                  </span>
                  <span className={`truncate ${a._id === "none" ? "italic text-zinc-500" : ""}`}>{a.name}</span>
                  {a.mobile && <span className="ml-auto text-xs text-zinc-400">{a.mobile}</span>}
                </button>
              </li>
            ))}
            {!options.length && <li className="px-3 py-2 text-sm text-zinc-500">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
