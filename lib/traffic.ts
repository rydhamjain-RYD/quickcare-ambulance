import hotspotsData from "@/data/hotspots.json";
import { haversine, type LngLat } from "./geo";

/**
 * Assumed traffic. There is no live traffic feed here, so this MODEL stands in for one.
 * Every number below is an assumption chosen to be plausible for Bengaluru, not a measurement,
 * and they all live in this one file so they are easy to change.
 *
 * How it works:
 *  1. The time of day (India time) sets a traffic level:
 *       heavy    12:30 pm to 3 pm
 *       light    10 pm to 6 am
 *       moderate every other hour
 *  2. The routing service gives a free-flow travel time. The level slows all of it by a multiplier.
 *  3. Near well-known congested places (data/hotspots.json) the slowdown is bigger, fading with distance.
 *  4. Every traffic signal on the route adds a wait that depends on the level.
 *  5. An ambulance with its siren on is helped through traffic, so only part of the slowdown applies.
 *
 * This file has no server-only code, so the screens can use its labels too.
 */

export type TrafficLevel = "light" | "moderate" | "heavy";

export const LEVEL_INFO: Record<TrafficLevel, { label: string; when: string }> = {
  light: { label: "Light", when: "10 pm to 6 am" },
  moderate: { label: "Moderate", when: "most of the day" },
  heavy: { label: "Heavy", when: "12:30 pm to 3 pm" },
};

const HEAVY_FROM_H = 12.5; // 12:30 pm
const HEAVY_UNTIL_H = 15; // 3 pm
const LIGHT_FROM_H = 22; // 10 pm
const LIGHT_UNTIL_H = 6; // 6 am

const SLOWDOWN: Record<TrafficLevel, number> = { light: 1.0, moderate: 1.7, heavy: 2.8 }; // travel time multiplier for car traffic
const HOTSPOT_EXTRA: Record<TrafficLevel, number> = { light: 0, moderate: 1.0, heavy: 2.0 }; // extra slowdown at the centre of a hotspot
const SIGNAL_WAIT_S: Record<TrafficLevel, number> = { light: 5, moderate: 20, heavy: 45 }; // wait at each signal
const SIREN_RELIEF = 0.75; // share of the slowdown an ambulance still feels
const HOTSPOT_MIN_WEIGHT = 0.25; // a hotspot counts as "on the route" above this strength

type Hotspot = { name: string; lat: number; lng: number; radiusM: number; severity: number };
const HOTSPOTS = hotspotsData as Hotspot[];

/** Hour of day in India time, e.g. 13.5 for 1:30 pm. */
export function indiaHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

export function levelAt(d: Date): TrafficLevel {
  const h = indiaHour(d);
  if (h >= LIGHT_FROM_H || h < LIGHT_UNTIL_H) return "light";
  if (h >= HEAVY_FROM_H && h < HEAVY_UNTIL_H) return "heavy";
  return "moderate";
}

export type TrafficEstimate = {
  level: TrafficLevel;
  durationS: number; // travel time including assumed traffic
  freeFlowS: number; // travel time with no traffic, from the routing service
  delayS: number; // durationS - freeFlowS
  slowAreas: string[]; // congested places the route passes, in the order it reaches them
  at: string; // the moment this was estimated for (ISO)
};

/** Estimate how long a route takes at a given moment, with assumed traffic. */
export function estimateTraffic(coords: LngLat[], freeFlowS: number, signalCount: number, at: Date): TrafficEstimate {
  const level = levelAt(at);
  const base = 1 + (SLOWDOWN[level] - 1) * SIREN_RELIEF;
  const hotExtra = HOTSPOT_EXTRA[level] * SIREN_RELIEF;

  let totalM = 0;
  const seg: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversine(coords[i], coords[i + 1]);
    seg.push(d);
    totalM += d;
  }
  const freeSpeed = totalM > 0 ? totalM / freeFlowS : 1; // metres per second with no traffic

  let seconds = 0;
  const slow: string[] = [];
  for (let i = 0; i < seg.length; i++) {
    let weight = 0;
    for (const h of HOTSPOTS) {
      const d = haversine(coords[i], [h.lng, h.lat]);
      if (d >= h.radiusM) continue;
      const w = h.severity * (1 - d / h.radiusM);
      if (w > weight) weight = w;
      if (w >= HOTSPOT_MIN_WEIGHT && !slow.includes(h.name)) slow.push(h.name);
    }
    seconds += (seg[i] / freeSpeed) * base * (1 + hotExtra * weight);
  }
  seconds += signalCount * SIGNAL_WAIT_S[level];

  const durationS = Math.max(Math.round(seconds), Math.round(freeFlowS));
  return {
    level,
    durationS,
    freeFlowS: Math.round(freeFlowS),
    delayS: durationS - Math.round(freeFlowS),
    slowAreas: slow.slice(0, 4),
    at: at.toISOString(),
  };
}
