"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Leaf, ClipboardList } from "lucide-react";
import { api, CatalogCrop } from "../lib/api";

type FormState = {
  id: string | null;
  name: string;
  varieties: string[];
  varietyInput: string;
  file: File | null;
  preview: string;
};

const emptyForm = (): FormState => ({
  id: null,
  name: "",
  varieties: [],
  varietyInput: "",
  file: null,
  preview: "",
});

export function CropCatalogManager() {
  const router = useRouter();
  const [crops, setCrops] = useState<CatalogCrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setCrops(await api.listCropCatalog());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load crops");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(c: CatalogCrop) {
    setForm({
      id: c._id,
      name: c.name,
      varieties: c.varieties ?? [],
      varietyInput: "",
      file: null,
      preview: c.imageUrl,
    });
    setError(null);
    setOpen(true);
  }

  function addVariety() {
    const v = form.varietyInput.trim();
    if (!v || form.varieties.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setForm({ ...form, varietyInput: "" });
      return;
    }
    setForm({ ...form, varieties: [...form.varieties, v], varietyInput: "" });
  }

  function removeVariety(v: string) {
    setForm({ ...form, varieties: form.varieties.filter((x) => x !== v) });
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("Crop name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("name", form.name.trim());
      data.append("varieties", JSON.stringify(form.varieties));
      if (form.file) data.append("image", form.file);

      if (form.id) await api.updateCropCatalog(form.id, data);
      else await api.createCropCatalog(data);

      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save crop");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: CatalogCrop) {
    if (!confirm(`Delete "${c.name}" from the catalog?`)) return;
    try {
      await api.deleteCropCatalog(c._id);
      setCrops((prev) => prev.filter((x) => x._id !== c._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete crop");
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Leaf size={18} className="text-green-600" /> Crop Catalog
          </h2>
          <p className="text-sm text-zinc-500">
            Crops farmers can pick in the app. Click a crop to edit its Package of Practices.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={16} /> Add Crop
        </button>
      </div>

      {error && !open && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : crops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No crops yet. Click “Add Crop” to create the first one.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {crops.map((c) => (
            <div
              key={c._id}
              onClick={() => router.push(`/crops/${encodeURIComponent(c.name)}`)}
              className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-green-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-green-600"
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt={c.name} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-green-50 dark:bg-green-950/30">
                  <Leaf size={28} className="text-green-600" />
                </div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(c);
                      }}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      title="Edit crop"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(c);
                      }}
                      className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Delete crop"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.varieties.length === 0 ? (
                    <span className="text-xs text-zinc-400">No varieties</span>
                  ) : (
                    c.varieties.map((v) => (
                      <span
                        key={v}
                        className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      >
                        {v}
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-green-600 opacity-0 transition-opacity group-hover:opacity-100">
                  <ClipboardList size={13} /> Edit Package of Practices →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{form.id ? "Edit crop" : "Add crop"}</h3>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">Crop name</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Turmeric"
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                />
              </label>

              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">Varieties</span>
                <div className="flex gap-2">
                  <input
                    value={form.varietyInput}
                    onChange={(e) => setForm({ ...form, varietyInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addVariety();
                      }
                    }}
                    placeholder="e.g. Salem, then Enter"
                    className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={addVariety}
                    className="shrink-0 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                  >
                    Add
                  </button>
                </div>
                {form.varieties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.varieties.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      >
                        {v}
                        <button onClick={() => removeVariety(v)} className="hover:text-red-600">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-sm">
                <span className="mb-1 block text-zinc-500">Image</span>
                <div className="flex items-center gap-3">
                  {form.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/30">
                      <Leaf size={22} className="text-green-600" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setForm({ ...form, file: f, preview: f ? URL.createObjectURL(f) : form.preview });
                    }}
                    className="text-sm"
                  />
                </div>
              </div>

              {error && open && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm">
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
        </div>
      )}
    </section>
  );
}
