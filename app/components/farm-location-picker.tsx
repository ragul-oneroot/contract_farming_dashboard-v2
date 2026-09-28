"use client";

import { useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api, PlaceHit } from "../lib/api";

export type FarmLocation = { state: string; district: string; taluk: string; village: string };

export const EMPTY_LOCATION: FarmLocation = { state: "", district: "", taluk: "", village: "" };

/** The same field style as the rest of the Add farmer form. */
const FIELD =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

/** The option the village dropdown uses to switch to typing a new name. */
const NEW_VILLAGE = "__new__";

/**
 * A list that is guaranteed to hold the current value.
 *
 * A place picked from the search can be one no farmer is registered in yet,
 * so it is not among the options the dropdown was built from - and a <select>
 * whose value is missing from its options shows blank, hiding the choice.
 */
function withValue(list: string[], value: string) {
  return value && !list.includes(value) ? [value, ...list] : list;
}

/**
 * State > District > Taluk > Village, chosen rather than typed.
 *
 * The options are EVERY place in the chosen state, from the same map data the
 * geocoder reads when a farm boundary is drawn - so a picked village is spelled
 * exactly as a boundary would spell it, and the office cannot start a second
 * spelling of a place. Each level narrows the one below it.
 *
 * For a village no farmer is in yet, the search asks the same geocoder that
 * names a farm when its boundary is drawn, and fills all four levels from the
 * result. Typing a village by hand is the last resort, and even then the
 * server files it under an existing spelling when it is clearly the same place.
 */
export function FarmLocationPicker({
  value,
  onChange,
}: {
  value: FarmLocation;
  onChange: (next: FarmLocation) => void;
}) {
  const [opts, setOpts] = useState({
    states: [] as string[],
    districts: [] as string[],
    taluks: [] as string[],
    villages: [] as string[],
  });
  const [typingVillage, setTypingVillage] = useState(false);

  const [query, setQuery] = useState("");
  /**
   * The last answer, tagged with the query it answers. "Searching" and which
   * results to show are worked out from it rather than kept as flags, so a
   * late reply to an old query can never be shown against a new one.
   */
  const [result, setResult] = useState<{ q: string; hits: PlaceHit[] }>({ q: "", hits: [] });
  const q = query.trim();
  const searching = q.length >= 3 && result.q !== q;
  const hits = result.q === q ? result.hits : [];
  const searched = result.q === q && q.length >= 3;

  // Options for each level, narrowed by whatever is chosen above it.
  useEffect(() => {
    let cancelled = false;
    api
      .places({ state: value.state, district: value.district, taluk: value.taluk })
      .then((r) => {
        if (cancelled) return;
        setOpts({
          states: r.states,
          districts: r.districts,
          taluks: r.taluks,
          villages: r.villages,
        });
      })
      .catch(() => {
        if (!cancelled) setOpts({ states: [], districts: [], taluks: [], villages: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [value.state, value.district, value.taluk]);

  /**
   * Starts on the state the farmers are in, when they are all in one - every
   * state is offered, but nobody should scroll past thirty to reach Karnataka.
   * The form only sends an address once a district or below is picked, so this
   * never gives a farmer a state and nothing else.
   */
  useEffect(() => {
    api
      .farmerPlaces()
      .then((r) => {
        const onFile = r.states ?? [];
        if (onFile.length === 1 && !value.state) onChange({ ...value, state: onFile[0] });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced: the geocoder allows one lookup a second for the whole server.
  useEffect(() => {
    if (q.length < 3) return;
    const t = setTimeout(() => {
      api
        .searchPlaces(q)
        .then((r) => setResult({ q, hits: r.places }))
        .catch(() => setResult({ q, hits: [] }));
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  /** Choosing a level clears everything under it, which would now contradict it. */
  const set = (level: keyof FarmLocation, v: string) => {
    if (level === "state") onChange({ state: v, district: "", taluk: "", village: "" });
    else if (level === "district") onChange({ ...value, district: v, taluk: "", village: "" });
    else if (level === "taluk") onChange({ ...value, taluk: v, village: "" });
    else onChange({ ...value, village: v });
    if (level !== "village") setTypingVillage(false);
  };

  const pickHit = (h: PlaceHit) => {
    onChange({ state: h.state, district: h.district, taluk: h.taluk, village: h.village });
    setTypingVillage(false);
    setQuery("");
  };

  const levels: { key: keyof FarmLocation; label: string; list: string[]; needs?: string }[] = [
    { key: "state", label: "State", list: opts.states },
    { key: "district", label: "District", list: opts.districts, needs: value.state ? "" : "state" },
    { key: "taluk", label: "Taluk", list: opts.taluks, needs: value.district ? "" : "district" },
  ];

  return (
    <div className="space-y-3">
      {/* Search first: for a new village it fills every level in one go. */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 dark:border-zinc-700">
          <Search size={15} className="shrink-0 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Or search a village by name…"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
          {searching ? <span className="text-xs text-zinc-400">Searching…</span> : null}
        </div>
        {q.length >= 3 && (hits.length > 0 || searched) ? (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            {hits.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">
                No place found. Try another spelling or the nearest town.
              </p>
            ) : (
              hits.map((h) => (
                <button
                  type="button"
                  key={`${h.latitude},${h.longitude},${h.label}`}
                  onClick={() => pickHit(h)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <MapPin size={14} className="mt-0.5 shrink-0 text-green-600" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {[h.village, h.taluk, h.district].filter(Boolean).join(", ") || h.label}
                    </span>
                    {/* The full name tells apart villages that share one name. */}
                    <span className="block truncate text-xs text-zinc-500">{h.label}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {levels.map((l) => (
          <div key={l.key}>
            <label className="mb-1 block text-sm text-zinc-500">{l.label}</label>
            <select
              value={value[l.key]}
              onChange={(e) => set(l.key, e.target.value)}
              disabled={!!l.needs}
              className={`${FIELD} disabled:opacity-50`}
            >
              <option value="">{l.needs ? `Pick a ${l.needs} first` : `— Select ${l.label.toLowerCase()} —`}</option>
              {withValue(l.list, value[l.key]).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div>
          <label className="mb-1 block text-sm text-zinc-500">Village</label>
          {typingVillage ? (
            <div className="flex gap-2">
              <input
                value={value.village}
                onChange={(e) => set("village", e.target.value)}
                autoFocus
                placeholder="New village name"
                className={FIELD}
              />
              <button
                type="button"
                onClick={() => {
                  setTypingVillage(false);
                  set("village", "");
                }}
                className="shrink-0 text-xs text-zinc-500 hover:underline"
              >
                Back to list
              </button>
            </div>
          ) : (
            <select
              value={value.village}
              onChange={(e) => {
                if (e.target.value === NEW_VILLAGE) {
                  setTypingVillage(true);
                  set("village", "");
                } else set("village", e.target.value);
              }}
              disabled={!value.taluk}
              className={`${FIELD} disabled:opacity-50`}
            >
              <option value="">{value.taluk ? "— Select village —" : "Pick a taluk first"}</option>
              {withValue(opts.villages, value.village).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value={NEW_VILLAGE}>+ Village not in the list…</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
