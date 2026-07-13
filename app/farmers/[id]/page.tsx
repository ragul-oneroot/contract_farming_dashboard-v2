"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Phone, MapPin, Sprout, ShoppingCart, UserCog, Map as MapIcon, Camera, ClipboardCheck } from "lucide-react";
import {
  api,
  Crop,
  Order,
  OrderStatus,
  PackageOfPractices,
  Person,
  Product,
} from "../../lib/api";

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
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Sprout size={18} className="text-green-600" /> Crops ({crops.length})
        </h2>
        {crops.length === 0 ? (
          <p className="text-sm text-zinc-500">This farmer hasn&apos;t added any crops yet.</p>
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
                    <span className="text-xs text-zinc-400">Planted {fmtDate(crop.dop)}</span>
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
                        .map((p) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={p.stepIndex}
                            src={p.imageUrl}
                            alt={`Step ${p.stepIndex + 1}`}
                            title={pop?.steps[p.stepIndex]?.operation ?? `Step ${p.stepIndex + 1}`}
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.imageUrl} alt="Verification proof" className="h-16 w-16 shrink-0 rounded-md object-cover" />
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pp.imageUrl} alt="Product usage" className="h-40 w-full object-cover" />
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
    </div>
  );
}
