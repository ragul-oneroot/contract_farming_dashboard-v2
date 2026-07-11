"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { api, Product } from "../lib/api";

type FormState = {
  id: string | null;
  name: string;
  description: string;
  price: string;
  unit: string;
  crops: string[]; // crop names this product is mapped to
  file: File | null;
  preview: string; // existing imageUrl or object URL of a new file
};

const emptyForm = (): FormState => ({
  id: null,
  name: "",
  description: "",
  price: "",
  unit: "",
  crops: [],
  file: null,
  preview: "",
});

export function ProductsManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cropOptions, setCropOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [prods, practices] = await Promise.all([api.listProducts(), api.listPractices()]);
      setProducts(prods);
      setCropOptions(practices.map((p) => p.crop));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  function toggleCrop(crop: string) {
    setForm((f) => ({
      ...f,
      crops: f.crops.includes(crop) ? f.crops.filter((c) => c !== crop) : [...f.crops, crop],
    }));
  }

  function openNew() {
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setForm({
      id: p._id,
      name: p.name,
      description: p.description,
      price: String(p.price),
      unit: p.unit,
      crops: p.crops ?? [],
      file: null,
      preview: p.imageUrl,
    });
    setError(null);
    setOpen(true);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, file, preview: file ? URL.createObjectURL(file) : f.preview }));
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("name", form.name.trim());
      data.append("description", form.description.trim());
      data.append("price", form.price || "0");
      data.append("unit", form.unit.trim());
      data.append("crops", JSON.stringify(form.crops));
      if (form.file) data.append("image", form.file);

      if (form.id) await api.updateProduct(form.id, data);
      else await api.createProduct(data);

      setOpen(false);
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Product) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.deleteProduct(p._id);
      setProducts((prev) => prev.filter((x) => x._id !== p._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Products <span className="text-zinc-400">({products.length})</span>
        </h1>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={16} /> Add product
        </button>
      </div>

      {error && !open && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-6 text-zinc-500">Loading…</p>
      ) : products.length === 0 ? (
        <p className="mt-6 text-zinc-500">No products yet. Click “Add product”.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p._id}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"}
                alt={p.name}
                className="h-40 w-full bg-zinc-100 object-cover dark:bg-zinc-900"
              />
              <div className="flex flex-1 flex-col p-4">
                <div className="font-semibold">{p.name}</div>
                {p.description && <p className="mt-1 text-sm text-zinc-500">{p.description}</p>}
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-semibold text-green-600">₹{p.price}</span>
                  {p.unit && <span className="text-xs text-zinc-500">{p.unit}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.crops && p.crops.length > 0 ? (
                    p.crops.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      >
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-900">
                      All crops
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      {open && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? "Edit product" : "Add product"}</h2>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">Name *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                />
              </label>

              <div className="flex gap-3">
                <label className="block flex-1 text-sm">
                  <span className="mb-1 block text-zinc-500">Price (₹)</span>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                  />
                </label>
                <label className="block flex-1 text-sm">
                  <span className="mb-1 block text-zinc-500">Unit</span>
                  <input
                    placeholder="per 1 kg"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                  />
                </label>
              </div>

              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">Image</span>
                <div className="flex items-center gap-3">
                  {form.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-900">
                      none
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Choose image
                  </button>
                </div>
              </div>

              {/* Map to crops */}
              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">Map to crop(s)</span>
                {cropOptions.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No crops yet — add one under “Crops &amp; Package of Practices”.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {cropOptions.map((crop) => {
                      const on = form.crops.includes(crop);
                      return (
                        <button
                          key={crop}
                          type="button"
                          onClick={() => toggleCrop(crop)}
                          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                            on
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          }`}
                        >
                          {crop}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-xs text-zinc-400">
                  {form.crops.length === 0
                    ? "Not mapped → shown for every crop."
                    : `Shown only for: ${form.crops.join(", ")}`}
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
