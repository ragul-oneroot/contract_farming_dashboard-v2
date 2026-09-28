"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Navigation,
  Clock,
  MapPin,
  X,
  CloudRain,
  PauseCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Phone,
} from "lucide-react";
import { api, NearbyResult, Person, TrackingPause, TrackingSession } from "../lib/api";
import { PhotoThumb } from "../components/lightbox";

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function duration(from: string, to: string | null) {
  const mins = Math.max(0, Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function mins(from: string, to: string | null) {
  return Math.max(0, Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 60000));
}

function hm(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Minutes the agent was stepped out of the day. An open pause runs to now. */
function pausedMinutes(pauses: TrackingPause[] | undefined) {
  return (pauses || []).reduce((t, p) => t + mins(p.pausedAt, p.resumedAt), 0);
}

/**
 * The route drawn on satellite imagery, in a sandboxed iframe.
 *
 * Leaflet is loaded from a CDN inside the frame rather than bundled: the map is
 * one screen in the whole dashboard, and this keeps it out of the app bundle.
 */
/**
 * The route drawn on satellite imagery, in a sandboxed iframe.
 *
 * Leaflet is loaded from a CDN inside the frame rather than bundled: the map is
 * one screen in the whole dashboard, and this keeps it out of the app bundle.
 *
 * Two layers sit on it. The agent's own fixes are the day itself. The farmer
 * pins are context - whose land the agent was standing among - and they are
 * anchored to ONE point of the route rather than the whole of it, so "nearby"
 * always means near a specific place rather than near a line.
 */
function RouteMap({
  session,
  nearby,
}: {
  session: TrackingSession;
  nearby: NearbyResult | null;
}) {
  const points = (session.points ?? []).filter((p) => p.latitude != null && p.longitude != null);

  /**
   * Which legend groups are unticked.
   *
   * The map is rebuilt whenever the radius or the anchor changes, and a fresh
   * map would come back with everything ticked - undoing a choice the person
   * made seconds ago. A ref rather than state, because a tick must not itself
   * rebuild the map: that would throw away the zoom and pan it was made at.
   * It lives here, so closing the map and opening another starts fresh.
   */
  const hiddenRef = useRef<string[]>([]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.type === "oneroot:legend" && Array.isArray(d.hidden)) {
        hiddenRef.current = d.hidden.filter((k: unknown) => typeof k === "string");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const html = useMemo(() => {
    // `at` travels with each fix so a dot can say when it was recorded.
    const coords = points.map((p) => [p.latitude, p.longitude, p.at ?? null]);
    const anchor = nearby?.anchor ?? null;
    const farmers = nearby?.farmers ?? [];
    const radiusKm = nearby?.radiusKm ?? 0;
    const hidden = hiddenRef.current;
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eee}
.legend{background:rgba(255,255,255,.92);border-radius:8px;padding:6px 9px;font:12px system-ui,sans-serif;line-height:1.7;color:#27272a}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;border:1.5px solid #fff;vertical-align:-1px}
.legrow{display:flex;align-items:center;gap:0;cursor:pointer;user-select:none;white-space:nowrap}
.legrow input{margin:0 7px 0 0;accent-color:#16a34a;cursor:pointer}
.legrow:hover{color:#000}
.legempty{opacity:.45}
.pop{font:13px system-ui,sans-serif;line-height:1.5}
.pop b{font-size:14px}
.pop a{color:#16a34a;text-decoration:none;font-weight:600}
.endlabel{background:rgba(24,24,27,.85);border:0;color:#fff;font:600 11px system-ui,sans-serif;padding:1px 6px;border-radius:5px;box-shadow:none}
.endlabel::before{border-top-color:rgba(24,24,27,.85)}
.fitbtn{background:#fff;border-radius:6px;padding:5px 9px;font:600 12px system-ui,sans-serif;color:#166534;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.fitbtn:hover{background:#f0fdf4}
.leaflet-top.leaflet-right .fitbtn{margin-top:8px}</style></head>
<body><div id="map"></div><script>
  var C = ${JSON.stringify(coords)};
  var ANCHOR = ${JSON.stringify(anchor)};
  var FARMERS = ${JSON.stringify(farmers)};
  var RADIUS_KM = ${JSON.stringify(radiusKm)};
  var HIDDEN = ${JSON.stringify(hidden)};
  var map = L.map('map', { attributionControl: false, maxZoom: 20 });

  /**
   * Satellite imagery, with village names and roads laid over it.
   *
   * Imagery alone shows fields but not where they are: a cluster of route
   * dots over brown squares could be any village in the district. Esri's
   * reference layers are transparent tiles carrying names and roads, from the
   * same keyless service as the imagery, and at field zoom they name the
   * actual villages (Bhogapura, Gogapura, Sappaiahnapura) rather than only
   * the towns.
   *
   * maxNativeZoom 18: past zoom 18 Esri has no imagery for rural Karnataka and
   * serves a grey "Map data not yet available" tile instead. Capping the
   * native zoom makes Leaflet enlarge the zoom-18 tiles when you zoom further,
   * so a tight route shows a slightly soft photo rather than a grey square.
   */
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var tileOpts = { maxZoom: 20, maxNativeZoom: 18 };
  L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', tileOpts).addTo(map);
  var names = L.layerGroup([
    L.tileLayer(ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', tileOpts),
    L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', tileOpts),
  ]).addTo(map);

  /**
   * A provisional view, set before any layer is added.
   *
   * Leaflet projects a vector layer against the map's current centre and zoom.
   * With no view ever set there is nothing to project against, and a layer that
   * needs its own pixel position - circle.getBounds() above all - throws,
   * which silently kills every line after it and leaves a blank map wearing its
   * zoom buttons. The closing fitBounds below is what actually frames the day.
   */
  map.setView(
    ANCHOR ? [ANCHOR.latitude, ANCHOR.longitude] : C.length ? [C[0][0], C[0][1]] : [12.9716, 77.5946],
    ANCHOR || C.length ? 15 : 11
  );

  function timeAt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // The names and villages below come from the database, so they are escaped
  // before they are put into markup rather than trusted to be plain text.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * What the opening view has to contain: the route, the farmer pins, and the
   * whole search circle.
   *
   * The circle was once left out, to stop a short day being squeezed to a
   * pixel - but then on a route inside one village the circle was entirely off
   * screen and looked missing. Start and End now carry labels that are always
   * shown, and Start is drawn on top, so they stay findable zoomed out; "Zoom
   * to route" goes in close.
   */
  var bounds = [];
  /** The route on its own, for the button that returns to it. */
  var routeBounds = [];

  /**
   * The circle of ground the farmer list covers, drawn before the pins so the
   * count on the banner is visibly a count of what is inside this ring - not a
   * number that has to be taken on trust.
   */
  if (ANCHOR && RADIUS_KM) {
    var ring = L.circle([ANCHOR.latitude, ANCHOR.longitude], {
      radius: RADIUS_KM * 1000,
      color: '#FACC15',
      weight: 2,
      opacity: 0.9,
      fillColor: '#FACC15',
      fillOpacity: 0.07,
    }).addTo(map);
    ring.bringToBack();
    // From the coordinates rather than the drawn shape, so it cannot depend on
    // the map having been laid out yet.
    var rb = L.latLng(ANCHOR.latitude, ANCHOR.longitude).toBounds(RADIUS_KM * 2000);
    bounds.push([rb.getSouth(), rb.getWest()], [rb.getNorth(), rb.getEast()]);
  }

  /**
   * One group per legend row, so a checkbox can show or hide a whole kind of
   * marker at once. DRAW_ORDER is bottom to top, and is re-applied after every
   * toggle: a group put back on the map lands on top of everything, which
   * would bury Start and End under a hundred route dots.
   */
  var GROUPS = {
    approx: L.layerGroup(),
    own: L.layerGroup(),
    other: L.layerGroup(),
    route: L.layerGroup(),
    end: L.layerGroup(),
    start: L.layerGroup(),
  };
  var DRAW_ORDER = ['approx', 'own', 'other', 'route', 'end', 'start'];
  DRAW_ORDER.forEach(function (k) { GROUPS[k].addTo(map); });

  // Farmers go on first, so a dense village never buries the agent's own day.
  FARMERS.forEach(function (f) {
    var own = !!f.isOwn;
    // A farmer placed at their village centre gets a colour of their own -
    // pink, used for nothing else - and a dashed ring, so it cannot be read as
    // a pin on the farm itself, whoever's farmer they are.
    var approx = !!f.approx;
    L.circleMarker([f.latitude, f.longitude], {
      radius: approx ? 8 : 6,
      color: approx ? '#EC4899' : '#fff',
      weight: approx ? 2.5 : 2,
      dashArray: approx ? '3 3' : null,
      fillColor: approx ? '#EC4899' : own ? '#F59E0B' : '#A855F7',
      fillOpacity: approx ? 0.45 : 0.95,
    })
      .addTo(approx ? GROUPS.approx : own ? GROUPS.own : GROUPS.other)
      .bindTooltip(esc(f.name) + ' - ' + (approx ? '~' : '') + f.distanceKm + ' km' + (approx ? ' (village centre)' : ''))
      .bindPopup(
        '<div class="pop"><b>' + esc(f.name) + '</b><br/>' +
          (f.mobile ? '<a href="tel:' + esc(f.mobile) + '">' + esc(f.mobile) + '</a><br/>' : '') +
          esc([f.village, f.taluk].filter(Boolean).join(', ')) + '<br/>' +
          '<span style="color:#71717a">' + (approx ? 'about ' : '') + f.distanceKm + ' km away' +
          (f.fromGeofence ? ' - farm centre' : '') + '</span><br/>' +
          (approx
            ? '<span style="color:#b45309">Placed at the village centre - no farm location yet.</span><br/>'
            : '') +
          '<span style="color:#71717a">Agronomist: ' + esc(f.agronomist || 'unassigned') + '</span></div>'
      );
    bounds.push([f.latitude, f.longitude]);
  });

  // Every recorded fix as its own dot, deliberately NOT joined into a line:
  // a polyline draws a straight segment between consecutive fixes, which
  // invents travel through whatever lies between them. The dots show only
  // where the agent was actually recorded.
  function dot(c, opts) {
    return L.circleMarker([c[0], c[1]], {
      radius: opts.radius,
      color: '#fff',
      weight: opts.weight,
      fillColor: opts.fill,
      fillOpacity: opts.opacity,
    })
      .addTo(GROUPS[opts.group])
      .bindTooltip(
        // The hint belongs on a tooltip you summoned. On a label that is always
        // on screen it is just noise repeated at both ends of every route.
        opts.label +
          (timeAt(c[2]) ? ' - ' + timeAt(c[2]) : '') +
          (opts.permanent ? '' : ' - click to search here'),
        opts.permanent ? { permanent: true, direction: 'top', className: 'endlabel' } : {}
      )
      // Re-anchors the farmer search. The parent refetches: asking from in
      // here would mean the frame needed the API base and the admin token.
      .on('click', function () {
        parent.postMessage({ type: 'oneroot:anchor', lat: c[0], lng: c[1] }, '*');
      });
  }

  C.forEach(function (c) {
    bounds.push([c[0], c[1]]);
    routeBounds.push([c[0], c[1]]);
  });

  // The middle of the day first, so neither end can be buried under it.
  C.slice(1, -1).forEach(function (c, i) {
    dot(c, { group: 'route', radius: 4, weight: 1.5, fill: '#1E88E5', opacity: 0.85, label: 'Point ' + (i + 2) });
  });

  /**
   * End, then Start on top and smaller.
   *
   * A day that finishes in the yard it began in puts these two on the same
   * pixel, and whichever is drawn second hides the other completely - which is
   * exactly the case where "where did he set off from?" is worth asking. Drawn
   * this way they read as a green centre inside a red ring, and both labels
   * stay on the map rather than waiting for a hover that cannot separate them.
   */
  if (C.length > 1) {
    dot(C[C.length - 1], {
      group: 'end', radius: 9, weight: 3, fill: '#E5484D', opacity: 1, label: 'End', permanent: true,
    });
  }
  if (C.length) {
    dot(C[0], {
      group: 'start', radius: 5, weight: 2.5, fill: '#2E9E5B', opacity: 1, label: 'Start', permanent: true,
    });
  }

  /** A ring round the point the farmer search is centred on. */
  if (ANCHOR) {
    L.circleMarker([ANCHOR.latitude, ANCHOR.longitude], {
      radius: 11,
      color: '#FACC15',
      weight: 3,
      fill: false,
    })
      .addTo(map)
      .bindTooltip('Searching around here');
  }

  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 16);
  } else {
    map.setView([12.9716, 77.5946], 11);
  }

  /**
   * Back to the day itself.
   *
   * With farmers up to 25 km out the opening view can be wide, and the route is
   * then a speck in the middle of it. One click returns to it without hunting.
   */
  if (routeBounds.length) {
    var fit = L.control({ position: 'topright' });
    fit.onAdd = function () {
      var b = L.DomUtil.create('div', 'fitbtn');
      b.innerHTML = 'Zoom to route';
      L.DomEvent.on(b, 'click', function (e) {
        L.DomEvent.stop(e);
        if (routeBounds.length > 1) {
          map.fitBounds(L.latLngBounds(routeBounds), { padding: [50, 50] });
        } else {
          map.setView(routeBounds[0], 18);
        }
      });
      L.DomEvent.disableClickPropagation(b);
      return b;
    };
    fit.addTo(map);
  }

  /**
   * Names on or off.
   *
   * On by default, since naming the place is the point. Off is for reading
   * the ground itself - a label can sit right on top of the field in question.
   */
  var namesCtl = L.control({ position: 'topright' });
  namesCtl.onAdd = function () {
    var b = L.DomUtil.create('div', 'fitbtn');
    b.innerHTML = 'Hide names';
    L.DomEvent.on(b, 'click', function (e) {
      L.DomEvent.stop(e);
      if (map.hasLayer(names)) {
        map.removeLayer(names);
        b.innerHTML = 'Show names';
      } else {
        names.addTo(map);
        b.innerHTML = 'Hide names';
      }
    });
    L.DomEvent.disableClickPropagation(b);
    return b;
  };
  namesCtl.addTo(map);

  /** Put the groups back in stacking order, bottom to top. */
  function restack() {
    DRAW_ORDER.forEach(function (k) {
      if (map.hasLayer(GROUPS[k])) {
        GROUPS[k].eachLayer(function (l) { l.bringToFront(); });
      }
    });
  }

  function setShown(key, on) {
    if (on) GROUPS[key].addTo(map);
    else map.removeLayer(GROUPS[key]);
    restack();
  }

  /**
   * The legend doubles as the filter: tick a row to show that kind of marker,
   * untick to hide it. Everything starts ticked.
   *
   * All five rows always show, so the legend reads the same on every map. A
   * row whose group is empty on this day is greyed, so a tick that changes
   * nothing does not look broken.
   */
  var ROWS = [
    { key: 'start', color: '#2E9E5B', label: 'Start' },
    { key: 'route', color: '#1E88E5', label: 'Route point' },
    { key: 'end', color: '#E5484D', label: 'End' },
    { key: 'own', color: '#F59E0B', label: 'Their farmer' },
    { key: 'other', color: '#A855F7', label: 'Other farmer' },
    { key: 'approx', color: '#EC4899', label: 'Village centre only' },
  ];

  var legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    var d = L.DomUtil.create('div', 'legend');
    ROWS.forEach(function (r) {
      var n = GROUPS[r.key].getLayers().length;
      var row = L.DomUtil.create('label', 'legrow' + (n ? '' : ' legempty'), d);
      var box = L.DomUtil.create('input', '', row);
      box.type = 'checkbox';
      box.checked = HIDDEN.indexOf(r.key) === -1;
      var sw = L.DomUtil.create('i', '', row);
      sw.style.background = r.color;
      row.appendChild(document.createTextNode(r.label + (r.key === 'own' || r.key === 'other' || r.key === 'approx' ? ' (' + n + ')' : '')));
      L.DomEvent.on(box, 'change', function () {
        setShown(r.key, box.checked);
        // Tell the page, so the next rebuild of this map keeps the choice.
        var off = ROWS.filter(function (x) { return !map.hasLayer(GROUPS[x.key]); })
          .map(function (x) { return x.key; });
        parent.postMessage({ type: 'oneroot:legend', hidden: off }, '*');
      });
    });
    // Clicks and scrolls on the legend belong to the legend, not the map.
    L.DomEvent.disableClickPropagation(d);
    L.DomEvent.disableScrollPropagation(d);
    return d;
  };
  legend.addTo(map);

  // Apply whatever was unticked before this rebuild.
  HIDDEN.forEach(function (k) { if (GROUPS[k]) map.removeLayer(GROUPS[k]); });
  restack();
</script></body></html>`;
  }, [points, nearby]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        No location points were recorded for this session.
      </div>
    );
  }

  return (
    <iframe
      srcDoc={html}
      className="h-full w-full border-0"
      sandbox="allow-scripts allow-popups"
    />
  );
}

const PAGE_SIZE = 20;

export default function TrackingPage() {
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  /** Server-computed, so they cover the whole period rather than this page. */
  const [totals, setTotals] = useState({ km: 0, hours: 0, tracked: 0, live: 0, off: 0 });
  const [agents, setAgents] = useState<Person[]>([]);
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The session whose route is open, fetched separately because the list
  // deliberately omits points.
  const [open, setOpen] = useState<TrackingSession | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  /**
   * Where the open session's agent was, named, and whose farms are around it.
   *
   * Kept apart from the session itself because it is answered by a different
   * question: the route is a fact about the day, this is a lookup about one
   * point of it, and it is re-asked whenever that point or the radius changes.
   */
  const [nearby, setNearby] = useState<NearbyResult | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  /** null = the session's last fix, which is what the server defaults to. */
  const [anchor, setAnchor] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.listTrackingPage({
        userId: who || undefined,
        from: from || undefined,
        page,
        limit: PAGE_SIZE,
      }),
      api.listAgronomists().catch(() => [] as Person[]),
    ])
      .then(([res, a]) => {
        setSessions(res.items);
        setTotal(res.total);
        setTotals(res.totals);
        setAgents(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tracking"))
      .finally(() => setLoading(false));
  }, [who, from, page]);

  /**
   * The named place and the farmers around it, refetched whenever the question
   * changes - a different session, a different dot, a wider radius.
   *
   * `cancelled` guards the late reply: widening the radius twice quickly would
   * otherwise let the first, narrower answer land last and overwrite the one
   * actually asked for.
   */
  useEffect(() => {
    if (!open) {
      setNearby(null);
      return;
    }
    let cancelled = false;
    setNearbyLoading(true);
    api
      .getTrackingNearby(open._id, {
        lat: anchor?.lat,
        lng: anchor?.lng,
        radiusKm,
      })
      .then((r) => {
        if (!cancelled) setNearby(r);
      })
      .catch(() => {
        // Context, not the screen. The route still draws without it.
        if (!cancelled) setNearby(null);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, anchor, radiusKm]);

  /**
   * Clicking a route dot inside the map re-centres the farmer search on it.
   *
   * The map is a sandboxed iframe with no API base and no admin token, so it
   * asks the parent to do the fetching rather than doing it itself.
   */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.type !== "oneroot:anchor") return;
      if (typeof d.lat !== "number" || typeof d.lng !== "number") return;
      setAnchor({ lat: d.lat, lng: d.lng });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** Village and taluk read as one label; either may legitimately be missing. */
  const place = [nearby?.address?.village, nearby?.address?.taluk, nearby?.address?.district]
    .filter(Boolean)
    .join(", ");

  /** Changing agent or date must land on page one of the new results. */
  const applyFilter = (set: (v: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  const showRoute = async (id: string) => {
    setOpenLoading(true);
    // A pinned dot belongs to the session it was clicked on, not to the next one.
    setAnchor(null);
    setNearby(null);
    try {
      setOpen(await api.getTrackingSession(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the route");
    } finally {
      setOpenLoading(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation size={20} className="text-green-600" />
          <h2 className="text-lg font-semibold">Tracking ({total})</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={who}
            onChange={(e) => applyFilter(setWho)(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter(setFrom)(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {(who || from) && (
            <button
              onClick={() => {
                setWho("");
                setFrom("");
                setPage(1);
              }}
              className="text-sm text-zinc-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Distance", value: `${totals.km} km` },
          { label: "Time tracked", value: `${totals.hours} h` },
          { label: "Tracked days", value: String(totals.tracked) },
          { label: "No field work", value: String(totals.off) },
          { label: "Running now", value: String(totals.live), alert: totals.live > 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="card p-3"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
            <div className={`mt-1 text-xl font-semibold${s.alert ? " text-green-600" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No tracked days yet. They appear when an agent taps START in the app.
        </p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Ended</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Distance</th>
                <th className="px-4 py-3 font-medium">Pauses</th>
                <th className="px-4 py-3 font-medium">Photos</th>
                <th className="px-4 py-3 font-medium">Route</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                // A declared day in has no route or distance — it has a reason,
                // and showing it as "0 km" would read as a failure to work.
                const off = s.kind === "no_field";
                const pauses = s.pauses || [];
                const paused = pausedMinutes(pauses);
                const shots = [
                  { url: s.startPhotoUrl, label: off ? "Reason" : "Start" },
                  { url: s.endPhotoUrl, label: "End" },
                ].filter((p) => p.url);
                return (
                  <tr key={s._id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.user?.name || s.userName || "—"}</div>
                      {s.user?.mobile ? <div className="text-xs text-zinc-500">{s.user.mobile}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{fmtDateTime(s.startAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {off ? (
                        "—"
                      ) : s.endAt ? (
                        fmtTime(s.endAt)
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-green-600">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-green-600" /> Running
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {off ? (
                        "—"
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} /> {duration(s.startAt, s.endAt)}
                          </span>
                          {/* Elapsed time hides the gap. Spell out how much of
                              it the agent was actually out of the day for. */}
                          {paused > 0 ? (
                            <div className="text-xs text-amber-600 dark:text-amber-500">
                              {hm(Math.max(0, mins(s.startAt, s.endAt) - paused))} working ·{" "}
                              {hm(paused)} paused
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <div className="max-w-[220px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-500 dark:ring-amber-900">
                            <CloudRain size={12} /> No field work
                          </span>
                          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{s.reason}</div>
                        </div>
                      ) : (
                        <span className="font-semibold text-green-600">{s.distanceKm} km</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : pauses.length === 0 ? (
                        <span className="text-xs text-zinc-400">None</span>
                      ) : (
                        <div className="max-w-[300px] space-y-2">
                          {pauses.map((p, i) => (
                            <div key={`${p.pausedAt}-${i}`} className="flex items-start gap-2">
                              {p.photoUrl ? (
                                <PhotoThumb
                                  url={p.photoUrl}
                                  caption={`Paused ${fmtTime(p.pausedAt)} — ${p.reason || "no reason given"}`}
                                  group={pauses
                                    .filter((x) => x.photoUrl)
                                    .map((x) => ({
                                      url: x.photoUrl as string,
                                      caption: `Paused ${fmtTime(x.pausedAt)} — ${x.reason || "no reason given"}`,
                                    }))}
                                  index={pauses.filter((x) => x.photoUrl).indexOf(p)}
                                  alt="Where the agent paused"
                                  className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-amber-200 hover:ring-amber-500 dark:ring-amber-900"
                                />
                              ) : (
                                <PauseCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-amber-700 dark:text-amber-500">
                                  {fmtTime(p.pausedAt)}
                                  {p.resumedAt ? (
                                    <> – {fmtTime(p.resumedAt)} · {hm(mins(p.pausedAt, p.resumedAt))}</>
                                  ) : (
                                    <> · still paused</>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                                  {p.reason || "No reason given"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {shots.length > 0 ? (
                        <div className="flex gap-1.5">
                          {shots.map((p, pi) => (
                            <div key={p.label}>
                              <PhotoThumb
                                url={p.url}
                                caption={p.label}
                                group={shots.map((x) => ({ url: x.url, caption: x.label }))}
                                index={pi}
                                alt={p.label}
                                className="h-12 w-12 rounded-md object-cover ring-1 ring-zinc-200 hover:ring-green-500 dark:ring-zinc-700"
                              />
                              <div className="mt-0.5 text-center text-[10px] text-zinc-500">{p.label}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {off ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : (
                        <button
                          onClick={() => showRoute(s._id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          <MapPin size={13} /> View route
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Only worth showing once there is more than one page to move between. */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}{" "}
            sessions
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">
              {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              className="rounded-lg border border-zinc-300 p-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Route map */}
      {(open || openLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <div className="font-medium">{open?.user?.name || open?.userName || "Route"}</div>
                {open && (
                  <div className="text-xs text-zinc-500">
                    {fmtDateTime(open.startAt)} · {duration(open.startAt, open.endAt)} ·{" "}
                    {open.distanceKm} km · {open.points?.length ?? 0} points
                    {pausedMinutes(open.pauses) > 0 ? (
                      // The route will show a jump here. Say why, so the gap is
                      // not read as the tracking having failed.
                      <span className="text-amber-600 dark:text-amber-500">
                        {" "}
                        · {hm(pausedMinutes(open.pauses))} paused (not counted)
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(null);
                  setAnchor(null);
                  setNearby(null);
                }}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X size={18} />
              </button>
            </div>
            {/* Where the agent was, and who farms around there. */}
            {open && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin size={15} className="shrink-0 text-amber-500" />
                  {nearbyLoading && !nearby ? (
                    <span className="text-zinc-500">Locating…</span>
                  ) : place ? (
                    <span className="truncate">
                      <span className="font-medium">{place}</span>
                      {nearby?.address?.state ? (
                        <span className="text-zinc-500"> · {nearby.address.state}</span>
                      ) : null}
                      {/* Which fix this describes. "Last seen" and "a dot you
                          picked" are different claims and must not look alike. */}
                      <span className="text-xs text-zinc-500">
                        {" "}
                        · {anchor ? "picked point" : "last seen"}
                        {!anchor && nearby?.anchor?.at ? ` ${fmtTime(nearby.anchor.at)}` : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      Village not known for this spot
                      {/* The geocoder names populated places; a fix in open
                          country legitimately has no name to give. */}
                    </span>
                  )}
                  {anchor && (
                    <button
                      onClick={() => setAnchor(null)}
                      className="shrink-0 text-xs text-green-600 hover:underline"
                    >
                      reset
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <Users size={14} />
                    {nearbyLoading ? "…" : `${nearby?.farmers.length ?? 0} farmers`} within
                  </span>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {[1, 2, 5, 10, 25].map((r) => (
                      <option key={r} value={r}>
                        {r} km
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1">
                {openLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading route…</div>
                ) : open ? (
                  <RouteMap session={open} nearby={nearby} />
                ) : null}
              </div>

              {/*
                The same farmers as the pins, as a list you can read and call
                from. A pin answers "where"; this answers "who", and on a
                cluster of overlapping farms the map cannot answer that at all.
              */}
              {open && (
                <aside className="hidden w-72 shrink-0 flex-col border-l border-zinc-200 md:flex dark:border-zinc-800">
                  <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    Farmers nearby
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {nearbyLoading ? (
                      <p className="p-3 text-sm text-zinc-500">Searching…</p>
                    ) : !nearby || nearby.farmers.length === 0 ? (
                      <p className="p-3 text-sm text-zinc-500">
                        No farmers on record within {radiusKm} km of this spot.
                      </p>
                    ) : (
                      nearby.farmers.map((f) => (
                        <div
                          key={f._id}
                          className="border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                f.approx ? "bg-pink-500" : f.isOwn ? "bg-amber-500" : "bg-purple-500"
                              }`}
                              title={
                                f.approx
                                  ? "Placed at the village centre - no farm location yet"
                                  : f.isOwn
                                    ? "Their farmer"
                                    : "Another agronomist's farmer"
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{f.name}</div>
                              <div className="truncate text-xs text-zinc-500">
                                {[f.village, f.taluk].filter(Boolean).join(", ") || "No address"}
                              </div>
                              {f.approx ? (
                                <div className="text-[11px] text-pink-600 dark:text-pink-400">
                                  Village centre - no farm location yet
                                </div>
                              ) : null}
                              {f.mobile ? (
                                <a
                                  href={`tel:${f.mobile}`}
                                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-green-600 hover:underline"
                                >
                                  <Phone size={11} /> {f.mobile}
                                </a>
                              ) : null}
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-xs font-medium text-zinc-500">
                              {f.approx ? "~" : ""}
                              {f.distanceKm} km
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
