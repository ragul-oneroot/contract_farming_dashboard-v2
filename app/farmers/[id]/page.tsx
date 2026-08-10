"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Phone, MapPin, Sprout, ShoppingCart, UserCog, Map as MapIcon, Camera, ClipboardCheck, Pencil, Plus, Trash2, X, Mic, CalendarClock, Ban } from "lucide-react";
import {
  api,
  CatalogCrop,
  Crop,
  Order,
  OrderStatus,
  PackageOfPractices,
  Person,
  Product,
} from "../../lib/api";
import { AudioPlayer } from "../../components/audio-player";
import { PhotoThumb } from "../../components/lightbox";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// Read-only Leaflet satellite map (via iframe srcDoc) showing the farm boundary polygon.
function geofenceMapHtml(points: { latitude: number; longitude: number }[]) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}</style></head>
<body><div id="map"></div><script>
  var pts = ${JSON.stringify(points)};
  var map = L.map('map');
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20}).addTo(map);
  var latlngs = pts.map(function(p){return [p.latitude, p.longitude];});
  var poly = L.polygon(latlngs,{color:'#2e9e5b',weight:3,fillColor:'#2e9e5b',fillOpacity:0.25}).addTo(map);
  latlngs.forEach(function(ll){ L.circleMarker(ll,{radius:5,color:'#fff',weight:2,fillColor:'#2e9e5b',fillOpacity:1}).addTo(map); });
  map.fitBounds(poly.getBounds(),{padding:[24,24]});
</script></body></html>`;
}

function dayNumber(dop: string | null) {
  if (!dop) return null;
  return Math.floor((Date.now() - new Date(dop).getTime()) / DAY_MS) + 1;
}

// Current POP stage + progress for a crop, given its schedule and day count.
function stageInfo(pop: PackageOfPractices | undefined, dayN: number | null) {
  if (!pop) return { stage: "No schedule available", stepNo: 0, total: 0, pct: 0 };
  const total = pop.steps.length;
  if (dayN == null) return { stage: "Planting date not set", stepNo: 0, total, pct: 0 };
  if (dayN < 1) return { stage: "Not planted yet", stepNo: 0, total, pct: 0 };
  if (dayN > pop.durationDays) return { stage: "Cycle complete", stepNo: total, total, pct: 100 };
  let stepNo = 1;
  let stage = pop.steps[0]?.operation ?? "—";
  pop.steps.forEach((s, i) => {
    if (s.day[0] <= dayN) {
      stage = s.operation;
      stepNo = i + 1;
    }
  });
  return { stage, stepNo, total, pct: Math.min(100, Math.round((dayN / pop.durationDays) * 100)) };
}

export default function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [farmer, setFarmer] = useState<Person | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [pops, setPops] = useState<Record<string, PackageOfPractices>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [agronomists, setAgronomists] = useState<Person[]>([]);
  const [productById, setProductById] = useState<Record<string, Product>>({});
  const [savingAgro, setSavingAgro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit farmer identity (admin only).
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", mobile: "" });

  // Crops are added from the same Edit modal. A farmer can have several.
  const [catalog, setCatalog] = useState<CatalogCrop[]>([]);
  const [cropForm, setCropForm] = useState({ name: "", variety: "", dop: "", area: "" });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [user, cropList, orderList, agroList, productList] = await Promise.all([
          api.getUser(id),
          api.listUserCrops(id),
          api.listUserOrders(id).catch(() => []),
          api.listAgronomists().catch(() => []),
          api.listProducts().catch(() => []),
        ]);
        api.listCropCatalog().then(setCatalog).catch(() => {});
        setFarmer(user);
        setCrops(cropList);
        setOrders(orderList);
        setAgronomists(agroList);
        setProductById(Object.fromEntries(productList.map((p) => [p._id, p])));

        // Fetch each distinct crop's Package of Practices.
        const names = [...new Set(cropList.map((c) => c.name))];
        const results = await Promise.all(names.map((n) => api.getPractices(n).catch(() => null)));
        const map: Record<string, PackageOfPractices> = {};
        results.forEach((p, i) => {
          if (p) map[names[i].toLowerCase()] = p;
        });
        setPops(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load farmer");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function onAssign(agronomistId: string) {
    setSavingAgro(true);
    try {
      const updated = await api.assignAgronomist(id, agronomistId || null);
      setFarmer((f) => (f ? { ...f, agronomist: updated.agronomist } : f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign agronomist");
    } finally {
      setSavingAgro(false);
    }
  }

  // Existing crops' planting dates, keyed by crop id, as yyyy-mm-dd for <input type="date">.
  const [cropDops, setCropDops] = useState<Record<string, string>>({});

  const toInputDate = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "");

  function openEdit() {
    if (!farmer) return;
    setEditForm({ name: farmer.name, mobile: farmer.mobile });
    setCropForm({ name: "", variety: "", dop: "", area: "" });
    setCropDops(Object.fromEntries(crops.map((c) => [c._id, toInputDate(c.dop)])));
    setFormError(null);
    setEditing(true);
  }

  // Saves identity changes and, if a crop was picked, adds it in the same step.
  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (farmer && (editForm.name !== farmer.name || editForm.mobile !== farmer.mobile)) {
        const updated = await api.updateFarmer(id, editForm);
        setFarmer((f) => (f ? { ...f, name: updated.name, mobile: updated.mobile } : f));
      }

      // Planting dates changed on existing crops.
      const changed = crops.filter((c) => (cropDops[c._id] ?? "") !== toInputDate(c.dop));
      if (changed.length) {
        const updated = await Promise.all(
          changed.map((c) =>
            api.updateCrop(c._id, { dop: cropDops[c._id] ? cropDops[c._id] : null })
          )
        );
        const byId = new Map(updated.map((u) => [u._id, u]));
        setCrops((cs) => cs.map((c) => byId.get(c._id) ?? c));
      }

      if (cropForm.name) {
        const created = await api.addUserCrop(id, {
          name: cropForm.name,
          variety: cropForm.variety || undefined,
          dop: cropForm.dop || null,
          area: cropForm.area ? Number(cropForm.area) : null,
        });
        setCrops((cs) => [created, ...cs]);
        // Pull in this crop's Package of Practices if it's one we haven't seen.
        const key = created.name.toLowerCase();
        if (!pops[key]) {
          const pop = await api.getPractices(created.name).catch(() => null);
          if (pop) setPops((p) => ({ ...p, [key]: pop }));
        }
      }

      setEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function removeCrop(cropId: string, cropName: string) {
    if (!confirm(`Remove "${cropName}" from this farmer? This cannot be undone.`)) return;
    try {
      await api.deleteCrop(cropId);
      setCrops((cs) => cs.filter((c) => c._id !== cropId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove crop");
    }
  }

  // Varieties depend on which catalog crop is selected.
  const varieties = catalog.find((c) => c.name === cropForm.name)?.varieties ?? [];

  if (loading) return <p className="text-zinc-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!farmer) return <p className="text-zinc-500">Farmer not found.</p>;

  const hasLoc = farmer.location?.latitude != null && farmer.location?.longitude != null;
  const geofence = farmer.geofence ?? [];

  // Agronomist verifications across all crops (newest first) — proof the
  // agronomist checked whether the farmer did each day's task.
  const verifications = crops
    .flatMap((c) => (c.verifications ?? []).map((v) => ({ ...v, crop: c.name })))
    .sort((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime());

  // Every product-application photo the farmer uploaded (newest first).
  const productPhotos = crops
    .flatMap((c) =>
      (c.productProgress ?? [])
        .filter((pp) => pp.imageUrl)
        .map((pp) => ({ ...pp, crop: c.name }))
    )
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  return (
    <div className="space-y-6">
      <Link href="/farmers" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-green-600">
        <ArrowLeft size={16} /> Back to farmers
      </Link>

      {/* Identity */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-xl font-semibold text-white">
          {farmer.name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{farmer.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-500">
            <a href={`tel:${farmer.mobile}`} className="flex items-center gap-1.5 hover:text-green-600">
              <Phone size={14} /> {farmer.mobile}
            </a>
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />{" "}
              {hasLoc
                ? `${farmer.location.latitude!.toFixed(4)}, ${farmer.location.longitude!.toFixed(4)}`
                : "Location not set"}
            </span>
            <span>Registered {fmtDate(farmer.createdAt)}</span>
          </div>
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <Pencil size={15} /> Edit details
        </button>
      </div>

      {/* Agronomist assignment */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <UserCog size={18} className="text-green-600" />
          <div>
            <div className="text-sm font-medium">Assigned agronomist</div>
            <div className="text-sm text-zinc-500">
              {farmer.agronomist ? `${farmer.agronomist.name} · ${farmer.agronomist.mobile}` : "Not assigned"}
            </div>
          </div>
        </div>
        <select
          value={farmer.agronomist?._id ?? ""}
          disabled={savingAgro}
          onChange={(e) => onAssign(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700"
        >
          <option value="" className="dark:bg-zinc-900">
            — Unassigned —
          </option>
          {agronomists.map((a) => (
            <option key={a._id} value={a._id} className="dark:bg-zinc-900">
              {a.name} ({a.mobile})
            </option>
          ))}
        </select>
      </div>

      {/*
        What the field decided about this farmer. Shown here because the
        dashboard's own view of a farmer is otherwise silent on it: an admin
        looking at a row has no way of telling whether nobody has visited or
        somebody visited and judged nothing was needed.
      */}
      {farmer?.nextFollowUpAt || farmer?.skippedAt ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CalendarClock size={18} className="text-green-600" /> Follow-up
          </h2>
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            {farmer.nextFollowUpAt ? (
              (() => {
                const due = new Date(farmer.nextFollowUpAt);
                const endOfToday = new Date();
                endOfToday.setHours(23, 59, 59, 999);
                const overdue = due.getTime() < endOfToday.getTime() - 86_400_000;
                return (
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 rounded-md p-1.5 ${
                        overdue
                          ? "bg-red-50 text-red-600 dark:bg-red-950/40"
                          : "bg-green-50 text-green-600 dark:bg-green-950/30"
                      }`}
                    >
                      <CalendarClock size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        Next visit due{" "}
                        {due.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {overdue ? (
                          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-950/40">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {farmer.followUpNote
                          ? farmer.followUpNote
                          : "No reason recorded"}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}

            {farmer.skippedAt ? (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40">
                  <Ban size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    Marked as needing no visit on{" "}
                    {new Date(farmer.skippedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {farmer.skipReason || "No reason recorded"}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* The conversation recorded while this farmer was being onboarded. */}
      {farmer?.onboardingAudioUrl ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Mic size={18} className="text-green-600" /> Onboarding recording
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <AudioPlayer
              src={farmer.onboardingAudioUrl}
              fallbackSeconds={farmer.onboardingAudioSeconds ?? 0}
            />
            <div className="mt-3 text-xs text-zinc-500">
              Recorded while this farmer was registered
              {farmer.onboardingAudioAt
                ? ` on ${new Date(farmer.onboardingAudioAt).toLocaleString(undefined, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
              {farmer.onboardingAudioSeconds
                ? ` · ${Math.floor(farmer.onboardingAudioSeconds / 60)}m ${
                    farmer.onboardingAudioSeconds % 60
                  }s`
                : ""}
              {farmer.onboardedBy?.name ? ` · by ${farmer.onboardedBy.name}` : ""}
            </div>
          </div>
        </section>
      ) : null}

      {/* Farm boundary (geofence) */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <MapIcon size={18} className="text-green-600" /> Farm boundary
          {geofence.length >= 3 && (
            <span className="text-sm font-normal text-zinc-500">· {geofence.length} corners</span>
          )}
        </h2>
        {geofence.length >= 3 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <iframe
              title="Farm boundary"
              srcDoc={geofenceMapHtml(geofence)}
              className="h-80 w-full"
              sandbox="allow-scripts"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            This farmer hasn’t drawn a farm boundary yet.
          </div>
        )}
      </section>

      {/* Crops + POP stage */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sprout size={18} className="text-green-600" /> Crops ({crops.length})
          </h2>
          <button
            onClick={openEdit}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus size={15} /> Add crop
          </button>
        </div>
        {crops.length === 0 ? (
          <p className="text-sm text-zinc-500">
            This farmer hasn&apos;t added any crops yet. Use <strong>Add crop</strong> to add one.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {crops.map((crop) => {
              const pop = pops[crop.name.toLowerCase()];
              const dayN = dayNumber(crop.dop);
              const info = stageInfo(pop, dayN);
              const doneCount = (crop.progress ?? []).filter((p) => p.done).length;
              return (
                <div
                  key={crop._id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {crop.name}
                      {crop.variety ? <span className="text-zinc-400"> · {crop.variety}</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Planted {fmtDate(crop.dop)}</span>
                      <button
                        onClick={() => removeCrop(crop._id, crop.name)}
                        title="Remove this crop"
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-green-600" style={{ width: `${info.pct}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-500">
                    <span>
                      {dayN != null && dayN >= 1 && pop
                        ? `Day ${Math.min(dayN, pop.durationDays)} of ${pop.durationDays}`
                        : dayN != null && dayN < 1
                          ? "Not planted yet"
                          : "—"}
                    </span>
                    <span>{info.pct}%</span>
                  </div>

                  {/* Current stage + tasks */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                      <div className="text-xs text-zinc-500">Current stage</div>
                      <div className="text-sm font-medium">{info.stage}</div>
                      {info.total > 0 && info.stepNo > 0 && (
                        <div className="text-xs text-zinc-400">
                          Step {info.stepNo} of {info.total}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                      <div className="text-xs text-zinc-500">Tasks done</div>
                      <div className="text-sm font-medium">
                        {doneCount}
                        {info.total ? ` / ${info.total}` : ""}
                      </div>
                    </div>
                  </div>

                  {/* Completed task photos */}
                  {(crop.progress ?? []).some((p) => p.imageUrl) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {crop.progress
                        .filter((p) => p.imageUrl)
                        .map((p, pi, all) => (
                          <PhotoThumb
                            key={p.stepIndex}
                            url={p.imageUrl}
                            caption={pop?.steps[p.stepIndex]?.operation ?? `Step ${p.stepIndex + 1}`}
                            group={all.map((x) => ({
                              url: x.imageUrl,
                              caption:
                                pop?.steps[x.stepIndex]?.operation ?? `Step ${x.stepIndex + 1}`,
                            }))}
                            index={pi}
                            alt={`Step ${p.stepIndex + 1}`}
                            className="h-12 w-12 rounded-md object-cover"
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Agronomist verifications (did the farmer do each day's task?) */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck size={18} className="text-green-600" /> Agronomist verifications ({verifications.length})
        </h2>
        {verifications.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No verifications yet. They appear when the agronomist checks a day&apos;s task in the app and marks it
            done or not done.
          </p>
        ) : (
          <div className="space-y-3">
            {verifications.map((v, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {v.imageUrl ? (
                  <PhotoThumb
                    url={v.imageUrl}
                    caption="Verification proof"
                    alt="Verification proof"
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
                    <Camera size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{v.operation || `Day ${v.day}`}</span>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {v.kind === "product" ? "Product" : "Operation"}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        v.status === "done"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      }`}
                    >
                      {v.status === "done" ? "Done" : "Not done"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {v.crop} · Day {v.day}
                    {v.dayEnd && v.dayEnd !== v.day ? `–${v.dayEnd}` : ""} · {fmtDate(v.verifiedAt)}
                  </div>
                  {v.note ? <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{v.note}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Product application photos (farmer's proof of use) */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Camera size={18} className="text-green-600" /> Product usage photos ({productPhotos.length})
        </h2>
        {productPhotos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No product photos yet. They appear when the farmer takes a photo after applying a product.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {productPhotos.map((pp, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <PhotoThumb
                  url={pp.imageUrl}
                  caption={productById[pp.productId]?.name ?? "Product usage"}
                  alt="Product usage"
                  className="h-40 w-full object-cover"
                />
                <div className="p-3">
                  <div className="text-sm font-medium">
                    {productById[pp.productId]?.name ?? "Product"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {pp.crop} · {fmtDate(pp.completedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Orders */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart size={18} className="text-green-600" /> Orders ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">No products bought yet.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div
                key={o._id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{fmtDate(o.createdAt)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[o.status]}`}>
                    {o.status}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>
                        {it.name} <span className="text-zinc-400">× {it.qty}</span>
                      </span>
                      <span className="text-zinc-500">₹{it.price * it.qty}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800">
                  Total: <span className="font-semibold text-green-600">₹{o.total}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          Note: the in-app cart lives on the farmer&apos;s device — only placed orders appear here.
        </p>
      </section>

      {/* Edit farmer details */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitEdit}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit farmer details</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X size={18} />
              </button>
            </div>

            <label className="mb-1 block text-sm text-zinc-500">Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoFocus
              className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />

            <label className="mb-1 block text-sm text-zinc-500">Mobile number</label>
            <input
              value={editForm.mobile}
              onChange={(e) => setEditForm((f) => ({ ...f, mobile: e.target.value }))}
              required
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <p className="mt-1 text-xs text-amber-600">
              The mobile number is how this farmer signs into the app — changing it changes their
              login.
            </p>

            {/* Planting dates on crops this farmer already has. */}
            {crops.length > 0 && (
              <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="mb-1 text-sm font-medium">Planting dates (D.O.P)</p>
                <p className="mb-2 text-xs text-zinc-500">
                  The Package of Practices schedule is counted from this date — a crop with no
                  date has no schedule.
                </p>
                <div className="space-y-2">
                  {crops.map((c) => (
                    <div key={c._id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1 truncate text-sm">
                        {c.name}
                        {c.variety ? <span className="text-zinc-400"> · {c.variety}</span> : null}
                        {!c.dop && !cropDops[c._id] && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            not set
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={cropDops[c._id] ?? ""}
                        onChange={(e) =>
                          setCropDops((d) => ({ ...d, [c._id]: e.target.value }))
                        }
                        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add a crop in the same step. A farmer can have several. */}
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium">
                Add a crop <span className="font-normal text-zinc-500">(optional)</span>
              </p>

              <label className="mb-1 block text-sm text-zinc-500">Crop</label>
              <select
                value={cropForm.name}
                onChange={(e) => setCropForm((f) => ({ ...f, name: e.target.value, variety: "" }))}
                className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              >
                <option value="">— Don&apos;t add a crop —</option>
                {catalog.map((c) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              {cropForm.name && (
                <>
                  <label className="mb-1 block text-sm text-zinc-500">Variety</label>
                  {varieties.length > 0 ? (
                    <select
                      value={cropForm.variety}
                      onChange={(e) => setCropForm((f) => ({ ...f, variety: e.target.value }))}
                      className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                    >
                      <option value="">— Any —</option>
                      {varieties.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={cropForm.variety}
                      onChange={(e) => setCropForm((f) => ({ ...f, variety: e.target.value }))}
                      placeholder="Variety name"
                      className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm text-zinc-500">
                        Date of planting <span className="text-zinc-400">— optional</span>
                      </label>
                      <input
                        type="date"
                        value={cropForm.dop}
                        onChange={(e) => setCropForm((f) => ({ ...f, dop: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-zinc-500">Area (acres)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        placeholder="e.g. 2.5"
                        value={cropForm.area}
                        onChange={(e) => setCropForm((f) => ({ ...f, area: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    The Package of Practices schedule is counted from the planting date.
                  </p>
                </>
              )}
            </div>

            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
