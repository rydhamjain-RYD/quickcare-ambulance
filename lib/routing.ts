import signalsData from "@/data/signals.json";
import avoidData from "@/data/avoid-polygons.json";
import { cumulative, haversine, locateOnRoute, pointInPolygon, type LngLat } from "./geo";

export type Signal = { id: string; lat: number; lng: number; name?: string | null; alongM: number };

export type RouteOption = {
  id: string;
  labels: ("quickest" | "fewest-signals")[];
  distanceM: number;
  durationS: number;
  coords: LngLat[];
  signals: Signal[];
  /** Set when the route enters a known narrow lane and no cleaner alternative exists. */
  narrowLaneWarning: boolean;
};

export type RoutesResult = {
  options: RouteOption[];
  source: "osrm";
};

type RawSignal = { id: number; lat: number; lng: number; name?: string | null };
const ALL_SIGNALS = signalsData as RawSignal[];
const AVOID = avoidData as LngLat[][]; // each entry is a ring of [lng, lat]

const MATCH_RADIUS_M = 30; // a signal this close to the line counts as "on the route"
const MERGE_WITHIN_M = 40; // signal nodes this close along the route are one junction

export function signalsAlong(coords: LngLat[]): Signal[] {
  const cum = cumulative(coords);
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const pad = 0.0005;
  const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;

  const hits: Signal[] = [];
  for (const s of ALL_SIGNALS) {
    if (s.lng < minLng || s.lng > maxLng || s.lat < minLat || s.lat > maxLat) continue;
    const loc = locateOnRoute([s.lng, s.lat], coords, cum);
    if (loc.dist <= MATCH_RADIUS_M) {
      hits.push({ id: String(s.id), lat: s.lat, lng: s.lng, name: s.name ?? null, alongM: Math.round(loc.alongM) });
    }
  }
  hits.sort((a, b) => a.alongM - b.alongM);

  // Merge the several signal nodes of one junction into a single stop.
  const merged: Signal[] = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h.alongM - last.alongM <= MERGE_WITHIN_M) continue;
    merged.push(h);
  }
  return merged;
}

function touchesNarrowLane(coords: LngLat[]): boolean {
  if (AVOID.length === 0) return false;
  return coords.some((c) => AVOID.some((ring) => pointInPolygon(c, ring)));
}

export class RoutingError extends Error {}

export async function planRoutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RoutesResult> {
  if (haversine([from.lng, from.lat], [to.lng, to.lat]) < 100) {
    throw new RoutingError("Start and hospital are less than 100 m apart.");
  }
  const url =
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?alternatives=3&overview=full&geometries=geojson&steps=false`;

  let data: { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] } }[] };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) throw new Error(`routing service returned ${res.status}`);
    data = await res.json();
  } catch (e) {
    throw new RoutingError(`Could not reach the routing service (${(e as Error).message}). Try again.`);
  }
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new RoutingError("No driving route found between these two places.");
  }

  let candidates = data.routes.map((r, i) => ({
    id: `r${i}`,
    distanceM: Math.round(r.distance),
    durationS: Math.round(r.duration),
    coords: r.geometry.coordinates,
    narrow: touchesNarrowLane(r.geometry.coordinates),
  }));

  // Prefer routes that stay out of known narrow lanes; keep them all only if none is clean.
  const clean = candidates.filter((c) => !c.narrow);
  const pool = clean.length > 0 ? clean : candidates;
  const warn = clean.length === 0 && candidates.some((c) => c.narrow);

  const withSignals = pool.map((c) => ({ ...c, signals: signalsAlong(c.coords) }));
  const quickest = withSignals.reduce((a, b) => (b.durationS < a.durationS ? b : a));
  const fewest = withSignals.reduce((a, b) =>
    b.signals.length < a.signals.length || (b.signals.length === a.signals.length && b.durationS < a.durationS) ? b : a,
  );

  const toOption = (c: (typeof withSignals)[number], labels: RouteOption["labels"]): RouteOption => ({
    id: c.id,
    labels,
    distanceM: c.distanceM,
    durationS: c.durationS,
    coords: c.coords,
    signals: c.signals,
    narrowLaneWarning: warn,
  });

  const options =
    quickest.id === fewest.id
      ? [toOption(quickest, ["quickest", "fewest-signals"])]
      : [toOption(quickest, ["quickest"]), toOption(fewest, ["fewest-signals"])];

  return { options, source: "osrm" };
}
