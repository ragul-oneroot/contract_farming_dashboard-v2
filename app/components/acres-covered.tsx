"use client";

import { Sprout } from "lucide-react";
import { useEffect, useState } from "react";

import { api, type Person } from "../lib/api";

/**
 * How much land one agronomist covers.
 *
 * A lookup rather than a filter: it answers a question about a person, and
 * narrowing whatever table or chart sits beside it would throw away what the
 * office was already looking at.
 *
 * Shared between the Farmers and Sales Analysis tabs so the two can never
 * disagree about what "acres covered" means - it is the land under every farmer
 * that agronomist onboarded, counted once each, wherever it is asked.
 */
export function AcresCovered({ agronomists }: { agronomists: Person[] }) {
  const [who, setWho] = useState("");
  /**
   * null while the answer is still coming, "error" when the request failed, and
   * "stale-server" when the backend answered without the figure at all.
   *
   * That last case earns its own state because the obvious shortcut - treating
   * a missing total as zero - prints "0 acres" under an agronomist who covers
   * eighty, which is worse than printing nothing.
   */
  const [coverage, setCoverage] = useState<
    { acres: number; farmers: number } | "error" | "stale-server" | null
  >(null);

  useEffect(() => {
    // Nothing chosen: the answer is simply not rendered, so there is nothing to
    // clear here. Clearing state straight from an effect body would make React
    // render twice for one change.
    if (!who) return;

    let stale = false;
    // `limit: 1` — the rows are not wanted, only the total the server works out
    // across every farmer they onboarded.
    api
      .listFarmersPage({ onboardedBy: who, page: 1, limit: 1 })
      .then((res) => {
        if (stale) return;
        setCoverage(
          typeof res.totals?.acres === "number"
            ? { acres: res.totals.acres, farmers: res.total }
            : "stale-server"
        );
      })
      .catch(() => {
        if (!stale) setCoverage("error");
      });
    return () => {
      stale = true;
    };
  }, [who]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Sprout size={15} className="text-green-600" />
      <span className="text-zinc-500">Acres covered</span>
      <select
        value={who}
        onChange={(e) => {
          setWho(e.target.value);
          // Cleared here rather than in the effect: the old number must not sit
          // under a newly chosen name for even a moment.
          setCoverage(null);
        }}
        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
      >
        <option value="">Choose an agronomist…</option>
        {agronomists.map((a) => (
          <option key={a._id} value={a._id}>
            {a.name}
            {a.mobile ? ` · ${a.mobile}` : ""}
          </option>
        ))}
      </select>

      {who && coverage === null && <span className="text-xs text-zinc-400">counting…</span>}

      {who && coverage === "error" && (
        <span className="text-xs text-red-600">Could not read the acreage.</span>
      )}

      {who && coverage === "stale-server" && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          The server did not send an acreage — restart the backend so it picks up this change.
        </span>
      )}

      {who && coverage && coverage !== "error" && coverage !== "stale-server" && (
        <span className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 dark:bg-green-950/40 dark:text-green-300">
          {coverage.acres.toLocaleString("en-IN")} acres
          <span className="text-xs font-normal text-green-700/70 dark:text-green-400/70">
            across {coverage.farmers} farmer{coverage.farmers === 1 ? "" : "s"} they onboarded
          </span>
        </span>
      )}
    </div>
  );
}
