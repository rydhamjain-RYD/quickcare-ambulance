import signalsData from "@/data/signals.json";
import avoidData from "@/data/avoid-polygons.json";
import { cumulative, haversine, locateOnRoute, pointInPolygon, type LngLat } from "./geo";
import { estimateTraffic, type TrafficLevel } from "./traffic";

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
  /**
   * Assumed traffic (see lib/traffic.ts). durationS already includes it. These are optional because
   * a trip saved before this existed does not have them.
   */
  trafficLevel?: TrafficLevel;
  freeFlowS?: number; // the time with no traffic
  trafficDelayS?: number; // how much of durationS is assumed traffic
  slowAreas?: string[]; // congested places the route passes
  trafficAt?: string; // the moment the traffic was assumed for (ISO)
};

export type RoutesResult = {
  options: RouteOption[];
  source: "osrm";
  /** True when every route found passes through a signal that was asked to be avoided. */
  blocked?: boolean;
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

const AVOID_RADIUS_M = 60; // a route passing this close to a blocked signal is dropped

type RawRoute = { distanceM: number; durationS: number; coords: LngLat[] };

/** Ask the public OSRM server for driving routes through the given points, in order. */
async function osrmRoutes(points: { lat: number; lng: number }[], alternatives: number): Promise<RawRoute[]> {
  const path = points.map((p) => `${p.lng},${p.lat}`).join(";");
  // Alternatives only work with two points.
  const alt = points.length === 2 && alternatives > 0 ? `alternatives=${alternatives}` : "alternatives=false";
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?${alt}&overview=full&geometries=geojson&steps=false`;
  let data: { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] } }[] };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) throw new Error(`routing service returned ${res.status}`);
    data = await res.json();
  } catch (e) {
    throw new RoutingError(`Could not reach the routing service (${(e as Error).message}). Try again.`);
  }
  if (data.code !== "Ok" || !data.routes?.length) return [];
  return data.routes.map((r) => ({ distanceM: Math.round(r.distance), durationS: Math.round(r.duration), coords: r.geometry.coordinates }));
}

export async function planRoutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { avoid?: { lat: number; lng: number }[]; at?: Date } = {},
): Promise<RoutesResult> {
  if (haversine([from.lng, from.lat], [to.lng, to.lat]) < 100) {
    throw new RoutingError("Start and hospital are less than 100 m apart.");
  }
  let candidates = (await osrmRoutes([from, to], 3)).map((r, i) => ({ id: `r${i}`, ...r, narrow: touchesNarrowLane(r.coords) }));
  if (candidates.length === 0) throw new RoutingError("No driving route found between these two places.");

  // Drop routes that pass through a signal the officer reported as blocked or heavy.
  const avoid = opts.avoid ?? [];
  if (avoid.length > 0) {
    const clearOfAvoided = (coords: LngLat[]) => {
      const cum = cumulative(coords);
      return !avoid.some((p) => locateOnRoute([p.lng, p.lat], coords, cum).dist < AVOID_RADIUS_M);
    };
    candidates = candidates.filter((c) => clearOfAvoided(c.coords));

    if (candidates.length === 0) {
      // Every alternative shares the blocked signal, so try detours that pass through a point
      // 1 km (then 1.6 km) away from it in eight directions. Diagonals matter: a point straight
      // north or south often still funnels the route back through the same junction.
      const b = avoid[0];
      const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      for (const distM of [1000, 1600]) {
        const vias = DIRS.map(([dx, dy]) => ({
          lat: b.lat + (dy * distM) / 111320,
          lng: b.lng + (dx * distM) / (111320 * Math.cos((b.lat * Math.PI) / 180)),
        }));
        const detours = await Promise.allSettled(vias.map((v) => osrmRoutes([from, v, to], 0)));
        candidates = detours
          .flatMap((d) => (d.status === "fulfilled" ? d.value : []))
          .filter((r, i, all) => all.findIndex((x) => x.durationS === r.durationS && x.distanceM === r.distanceM) === i)
          .map((r, i) => ({ id: `d${distM}-${i}`, ...r, narrow: touchesNarrowLane(r.coords) }))
          .filter((c) => clearOfAvoided(c.coords));
        if (candidates.length > 0) break;
      }
    }
    if (candidates.length === 0) return { options: [], source: "osrm", blocked: true };
  }

  // Prefer routes that stay out of known narrow lanes; keep them all only if none is clean.
  const clean = candidates.filter((c) => !c.narrow);
  const pool = clean.length > 0 ? clean : candidates;
  const warn = clean.length === 0 && candidates.some((c) => c.narrow);

  // Add the assumed traffic for this time of day. This changes every route's time, and so can change
  // which route is the quickest.
  const at = opts.at ?? new Date();
  const withSignals = pool.map((c) => {
    const signals = signalsAlong(c.coords);
    const traffic = estimateTraffic(c.coords, c.durationS, signals.length, at);
    return { ...c, signals, traffic, durationS: traffic.durationS };
  });
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
    trafficLevel: c.traffic.level,
    freeFlowS: c.traffic.freeFlowS,
    trafficDelayS: c.traffic.delayS,
    slowAreas: c.traffic.slowAreas,
    trafficAt: c.traffic.at,
  });

  const options =
    quickest.id === fewest.id
      ? [toOption(quickest, ["quickest", "fewest-signals"])]
      : [toOption(quickest, ["quickest"]), toOption(fewest, ["fewest-signals"])];

  return { options, source: "osrm" };
}
