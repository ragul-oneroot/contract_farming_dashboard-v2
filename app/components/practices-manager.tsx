"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, GripVertical, Package, X } from "lucide-react";
import { api, Practice, PopStep, Product } from "../lib/api";

const emptyStep = (): PopStep => ({
  day: [1, 1],
  category: "monitoring",
  operation: "",
  details: "",
  products: [],
});

// When `crop` is passed, the manager locks to that single crop (no tabs / picker)
// — used by the per-crop Package of Practices page.
export function PracticesManager({ crop }: { crop?: string } = {}) {
  const scoped = !!crop;
  const [practices, setPractices] = useState<Practice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState(0);
  const [steps, setSteps] = useState<PopStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectKey?: string) => {
    setLoading(true);
    try {
      let list = await api.listPractices();
      if (crop) {
        // Scoped: find this crop's POP, creating an empty one if it doesn't exist yet.
        let pick = list.find((p) => p.crop.toLowerCase() === crop.toLowerCase());
        if (!pick) {
          try {
            pick = await api.createPractice({ crop, durationDays: 0, steps: [] });
          } catch {
            // May already exist (e.g. double-invoke) — fall through to re-fetch.
          }
          list = await api.listPractices();
          pick = list.find((p) => p.crop.toLowerCase() === crop.toLowerCase()) ?? pick;
        }
        setPractices(list);
        if (pick) selectCrop(pick);
      } else {
        setPractices(list);
        const pick = list.find((p) => p.key === selectKey) ?? list[0] ?? null;
        if (pick) selectCrop(pick);
        else setActiveKey(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop]);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => {});
  }, []);

  function toggleStepProduct(i: number, productId: string) {
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        const cur = s.products ?? [];
        const products = cur.includes(productId)
          ? cur.filter((p) => p !== productId)
          : [...cur, productId];
        return { ...s, products };
      })
    );
  }

  function selectCrop(p: Practice) {
    setActiveKey(p.key);
    setDurationDays(p.durationDays);
    // deep copy so edits don't mutate the list until saved
    setSteps(p.steps.map((s) => ({ ...s, day: [s.day[0], s.day[1]] })));
    setMsg(null);
    setError(null);
  }

  function updateStep(i: number, patch: Partial<PopStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function updateDay(i: number, which: 0 | 1, value: number) {
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        const day: [number, number] = [s.day[0], s.day[1]];
        day[which] = value;
        return { ...s, day };
      })
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    if (!activeKey) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await api.updatePractice(activeKey, { durationDays: Number(durationDays) || 0, steps });
      setMsg("Saved ✓");
      await load(activeKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addCrop() {
    const crop = window.prompt("New crop name (e.g. Chilli):")?.trim();
    if (!crop) return;
    try {
      const created = await api.createPractice({ crop, durationDays: 0, steps: [] });
      await load(created.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create crop");
    }
  }

  async function deleteCrop() {
    if (!activeKey) return;
    if (!window.confirm(`Delete the entire "${activeKey}" package of practices?`)) return;
    try {
      await api.deletePractice(activeKey);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {scoped ? `${crop} · Package of Practices` : "Package of Practices"}
        </h1>
        {!scoped && (
          <button
            onClick={addCrop}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus size={16} /> New crop
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-zinc-500">Loading…</p>
      ) : practices.length === 0 ? (
        <p className="mt-6 text-zinc-500">No crops yet. Click “New crop” to add one.</p>
      ) : (
        <>
          {/* Crop tabs (hidden when scoped to one crop) */}
          {!scoped && (
            <div className="mt-6 flex flex-wrap gap-2">
              {practices.map((p) => (
                <button
                  key={p.key}
                  onClick={() => selectCrop(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    activeKey === p.key
                      ? "bg-green-600 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {p.crop}
                </button>
              ))}
            </div>
          )}

          {/* Editor */}
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Cycle duration (days)</span>
                <input
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-32 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                />
              </label>
              {!scoped && (
                <button
                  onClick={deleteCrop}
                  className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={16} /> Delete crop
                </button>
              )}
            </div>

            {/* Steps */}
            <div className="mt-5 space-y-3">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-1 text-zinc-400">
                      <button onClick={() => move(i, -1)} className="hover:text-zinc-700" title="Move up">▲</button>
                      <GripVertical size={16} />
                      <button onClick={() => move(i, 1)} className="hover:text-zinc-700" title="Move down">▼</button>
                    </div>

                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-500">Day</label>
                        <input
                          type="number"
                          value={s.day[0]}
                          onChange={(e) => updateDay(i, 0, Number(e.target.value))}
                          className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                        />
                        <span className="text-zinc-400">–</span>
                        <input
                          type="number"
                          value={s.day[1]}
                          onChange={(e) => updateDay(i, 1, Number(e.target.value))}
                          className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                        />
                      </div>

                      <input
                        placeholder="Operation (title)"
                        value={s.operation}
                        onChange={(e) => updateStep(i, { operation: e.target.value })}
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm sm:col-span-2 dark:border-zinc-700"
                      />
                      <textarea
                        placeholder="Details"
                        value={s.details}
                        onChange={(e) => updateStep(i, { details: e.target.value })}
                        rows={2}
                        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm sm:col-span-2 dark:border-zinc-700"
                      />

                      {/* Products used on this day */}
                      <div className="sm:col-span-2">
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                          <Package size={13} /> Products to use this day
                        </div>
                        {products.length === 0 ? (
                          <p className="text-xs text-zinc-400">No products yet — add them in the Products tab.</p>
                        ) : (
                          <>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) toggleStepProduct(i, e.target.value);
                                e.target.value = "";
                              }}
                              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                            >
                              <option value="" className="dark:bg-zinc-900">
                                ＋ Add a product to this day…
                              </option>
                              {products
                                .filter((p) => !(s.products ?? []).includes(p._id))
                                .map((p) => (
                                  <option key={p._id} value={p._id} className="dark:bg-zinc-900">
                                    {p.name}
                                  </option>
                                ))}
                            </select>

                            {(s.products ?? []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(s.products ?? []).map((pid) => {
                                  const prod = products.find((p) => p._id === pid);
                                  return (
                                    <span
                                      key={pid}
                                      className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs text-white"
                                    >
                                      {prod?.name ?? "Product"}
                                      <button
                                        type="button"
                                        onClick={() => toggleStepProduct(i, pid)}
                                        className="hover:text-red-200"
                                        title="Remove"
                                      >
                                        <X size={12} />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => removeStep(i)}
                      className="mt-1 text-red-500 hover:text-red-700"
                      title="Remove step"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={addStep}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <Plus size={16} /> Add step
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                <Save size={16} /> {saving ? "Saving…" : "Save changes"}
              </button>
              {msg && <span className="text-sm text-green-600">{msg}</span>}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
