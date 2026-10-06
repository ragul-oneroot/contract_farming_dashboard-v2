"use client";

import { Check, Download, X } from "lucide-react";
import { useState } from "react";
import type { SheetData } from "write-excel-file/browser";

type Cell = string | number | Date | null | undefined;

/** One column the person can tick for the download. */
export type ExportColumn<T> = {
  key: string;
  label: string;
  value: (row: T) => Cell;
  /** Ticked when the dialog first opens. Defaults to true. */
  checked?: boolean;
};

const STORE = "oneroot_export_cols:";

/** Which columns were ticked last time for this download, if remembered. */
function remembered(id: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORE + id);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * "Download Excel": pick the columns with checkboxes, get an .xlsx of exactly
 * those, for exactly the rows the page's filters currently select.
 *
 * `rows` is a function so a paged list can fetch every matching row at the
 * moment of download rather than only the page on screen. The ticked columns
 * are remembered per download (`id`), so a report pulled every week keeps its
 * shape.
 */
export function ExcelExport<T>({
  id,
  fileName,
  columns,
  rows,
  label = "Download Excel",
}: {
  id: string;
  fileName: string;
  columns: ExportColumn<T>[];
  rows: () => T[] | Promise<T[]>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const last = remembered(id);
    const known = new Set(columns.map((c) => c.key));
    setPicked(
      new Set(last ? last.filter((k) => known.has(k)) : columns.filter((c) => c.checked !== false).map((c) => c.key))
    );
    setError(null);
    setOpen(true);
  };

  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const download = async () => {
    const cols = columns.filter((c) => picked.has(c.key));
    if (!cols.length) return;
    setBusy(true);
    setError(null);
    try {
      const data = await rows();
      if (!data.length) {
        setError("Nothing to download - no rows match the current filters.");
        return;
      }
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const header: SheetData[number] = cols.map((c) => ({ value: c.label, fontWeight: "bold" as const }));
      const body: SheetData = data.map((r) =>
        cols.map((c) => {
          const v = c.value(r);
          if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { value: v, format: "dd/mm/yyyy hh:mm" };
          return v === undefined || v === null || v === "" ? null : { value: v };
        })
      );
      await writeXlsxFile([header, ...body], {
        columns: cols.map((c) => ({ width: Math.min(Math.max(c.label.length + 4, 14), 40) })),
        stickyRowsCount: 1,
      }).toFile(`${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      try {
        window.localStorage.setItem(STORE + id, JSON.stringify(cols.map((c) => c.key)));
      } catch {
        // Not remembering the columns is harmless.
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-1.5 rounded-lg border border-green-600 px-2.5 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950"
      >
        <Download size={15} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-12 w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
              <div>
                <h2 className="text-lg font-semibold">Download Excel</h2>
                <p className="text-xs text-zinc-500">Tick the columns you want. The current filters apply.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-3">
              <div className="mb-2 flex justify-between text-xs">
                <button onClick={() => setPicked(new Set(columns.map((c) => c.key)))} className="text-green-700 hover:underline">
                  Select all
                </button>
                <button onClick={() => setPicked(new Set())} className="text-zinc-500 hover:underline">
                  Clear
                </button>
              </div>
              <div className="grid max-h-80 grid-cols-2 gap-x-3 overflow-y-auto">
                {columns.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="flex items-center gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        picked.has(c.key) ? "border-green-600 bg-green-600 text-white" : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {picked.has(c.key) && <Check size={12} />}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-900">
              <span className="mr-auto text-xs text-zinc-500">{picked.size} column(s)</span>
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
                Cancel
              </button>
              <button
                onClick={download}
                disabled={busy || picked.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Download size={15} /> {busy ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
