"use client";

import { Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api, type Region } from "../lib/api";

/**
 * The taluks the company sells in, and the code each one's bills carry.
 *
 * The code is typed, not derived from the name: Chamarajanagar is CHM, not CHA,
 * and no rule short of asking gets that right. It is also what a farmer reads
 * off the paper they were handed, so it has to be the office's choice.
 *
 * District and taluk suggestions come from the places our own farmers already
 * sit in, rather than an outside list — no key to manage, nothing to go down,
 * and the spellings match the records these bills will be reconciled against.
 */
export function RegionsDialog({ onClose }: { onClose: () => void }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [taluks, setTaluks] = useState<string[]>([]);
  const [district, setDistrict] = useState("");
  const [taluk, setTaluk] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The region being corrected, held as text while it is being typed. */
  const [editing, setEditing] = useState<{
    id: string;
    district: string;
    taluk: string;
    code: string;
  } | null>(null);

  const load = () => api.listRegions().then(setRegions).catch(() => setRegions([]));

  useEffect(() => {
    load();
    api.farmerPlaces().then((p) => setDistricts(p.districts ?? [])).catch(() => setDistricts([]));
  }, []);

  /**
   * Taluks narrow to the district being typed, the way the farmer filters do —
   * and before one is chosen, every taluk we know of is offered.
   *
   * Always asked for, rather than cleared on the spot when the district is
   * emptied: setting state straight from an effect body makes React render
   * twice for one change, and the answer is a moment away in any case.
   */
  useEffect(() => {
    api
      .farmerPlaces(district ? { district } : {})
      .then((p) => setTaluks(p.taluks ?? []))
      .catch(() => setTaluks([]));
  }, [district]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createRegion({ district: district.trim(), taluk: taluk.trim(), code: code.trim() });
      setTaluk("");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that region.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateRegion(editing.id, {
        district: editing.district.trim(),
        taluk: editing.taluk.trim(),
        code: editing.code.trim(),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that region.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Region) => {
    setError(null);
    try {
      await api.deleteRegion(r._id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that region.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MapPin size={18} className="text-green-600" /> Regions
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Bills are numbered per taluk — ENP-CHM01 out of Chamarajanagar, ENP-GOK01 out of
              Gokak.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input
              list="region-districts"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="District"
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <datalist id="region-districts">
              {districts.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <input
              list="region-taluks"
              value={taluk}
              onChange={(e) => setTaluk(e.target.value)}
              placeholder="Taluk"
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <datalist id="region-taluks">
              {taluks.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="CHM"
              maxLength={6}
              className="w-24 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm uppercase dark:border-zinc-700"
            />
            <button
              onClick={add}
              disabled={busy || !district.trim() || !taluk.trim() || code.trim().length < 2}
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Plus size={15} /> Add
            </button>
          </div>

          {editing && (regions.find((r) => r._id === editing.id)?.seq ?? 0) > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Bills already issued keep the number printed on them — a new code only changes the ones
              issued from now on.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Taluk</th>
                  <th className="px-3 py-2 font-medium">District</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 text-right font-medium">Bills issued</th>
                  <th className="px-3 py-2 text-right font-medium">Agronomists</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => {
                  const open = editing?.id === r._id;
                  const cell =
                    "w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";
                  return (
                    <tr key={r._id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                      <td className="px-3 py-2 font-medium">
                        {open && editing ? (
                          <input
                            value={editing.taluk}
                            onChange={(e) => setEditing({ ...editing, taluk: e.target.value })}
                            className={cell}
                          />
                        ) : (
                          r.taluk
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {open && editing ? (
                          <input
                            value={editing.district}
                            onChange={(e) => setEditing({ ...editing, district: e.target.value })}
                            className={cell}
                          />
                        ) : (
                          r.district
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {open && editing ? (
                          <input
                            value={editing.code}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                              })
                            }
                            maxLength={6}
                            className={`${cell} w-20 font-mono uppercase`}
                          />
                        ) : (
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                            ENP-{r.code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.seq}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.agronomists ?? 0}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {open && editing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={busy || editing.code.length < 2 || !editing.taluk.trim()}
                              className="rounded-lg p-1 text-green-600 hover:bg-green-50 disabled:opacity-40 dark:hover:bg-green-950/40"
                              aria-label="Save"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              aria-label="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                setEditing({ id: r._id, district: r.district, taluk: r.taluk, code: r.code })
                              }
                              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                              aria-label={`Edit ${r.taluk}`}
                            >
                              <Pencil size={15} />
                            </button>
                            {/* A region with bills against it is never offered
                                for deletion: those numbers are on paper. */}
                            {r.seq === 0 && (r.agronomists ?? 0) === 0 ? (
                              <button
                                onClick={() => remove(r)}
                                className="rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                aria-label={`Remove ${r.taluk}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {regions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-400">
                      No regions yet. Until a taluk is added and an agronomist mapped to it, bills
                      keep the year-based numbering.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
