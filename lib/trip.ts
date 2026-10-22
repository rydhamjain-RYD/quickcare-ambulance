import { cumulative, headingAt, pointAtDistance, type LngLat } from "./geo";
import type { RouteOption } from "./routing";

export const ALERT_DISTANCE_M = 800; // officer is alerted this far before the signal
export const ESCALATE_AFTER_MS = 25_000; // no answer in this long goes to the control room
export const SPEEDS = [1, 4, 8, 16] as const;

export type AlertStatus = "waiting" | "alerted" | "cleared" | "cannot" | "unanswered";

export type SignalAlert = {
  signalId: string;
  index: number; // 1-based position on the route
  lat: number;
  lng: number;
  alongM: number;
  status: AlertStatus;
  alertedAt?: number;
  respondedAt?: number;
  direction?: string;
};

export type Trip = {
  id: string;
  status: "enroute" | "arrived";
  hospital: { name: string; lat: number; lng: number };
  start: { lat: number; lng: number };
  route: RouteOption;
  note?: { raw: string; severity?: string; summary?: string; aiOk: boolean };
  progressM: number;
  speed: number; // simulation speed multiplier
  lastTickAt: number;
  startedAt: number;
  alerts: SignalAlert[];
};

export type TripView = Trip & {
  position: LngLat;
  baseSpeedMps: number;
  remainingM: number;
  etaS: number; // real-world seconds to hospital at normal speed
  nextSignal?: { index: number; distanceM: number; etaS: number };
};

// In-memory store: fine for a single local server. Replace with Upstash for the deployed demo.
const g = globalThis as unknown as { __qcTrip?: Trip | null; __qcCum?: number[] };

export function getTripRaw(): Trip | null {
  return g.__qcTrip ?? null;
}

export function resetTrip() {
  g.__qcTrip = null;
  g.__qcCum = undefined;
}

export function startTrip(args: {
  hospital: Trip["hospital"];
  start: Trip["start"];
  route: RouteOption;
  note?: Trip["note"];
}): Trip {
  const cum = cumulative(args.route.coords);
  const now = Date.now();
  const trip: Trip = {
    id: `trip-${now}`,
    status: "enroute",
    hospital: args.hospital,
    start: args.start,
    route: args.route,
    note: args.note,
    progressM: 0,
    speed: 8,
    lastTickAt: now,
    startedAt: now,
    alerts: args.route.signals.map((s, i) => ({
      signalId: s.id,
      index: i + 1,
      lat: s.lat,
      lng: s.lng,
      alongM: s.alongM,
      status: "waiting" as AlertStatus,
      direction: headingAt(args.route.coords, cum, s.alongM),
    })),
  };
  g.__qcTrip = trip;
  g.__qcCum = cum;
  return trip;
}

export function setSpeed(speed: number) {
  const t = g.__qcTrip;
  if (!t) return;
  tick();
  t.speed = speed;
}

/** Advance the simulated ambulance and fire/escalate alerts. Called on every read. */
export function tick(): Trip | null {
  const t = g.__qcTrip;
  if (!t) return null;
  const now = Date.now();
  const base = t.route.distanceM / t.route.durationS;

  if (t.status === "enroute") {
    t.progressM = Math.min(t.route.distanceM, t.progressM + ((now - t.lastTickAt) / 1000) * base * t.speed);
    if (t.progressM >= t.route.distanceM) t.status = "arrived";
  }
  t.lastTickAt = now;

  for (const a of t.alerts) {
    if (a.status === "waiting" && a.alongM - t.progressM <= ALERT_DISTANCE_M) {
      a.status = "alerted";
      a.alertedAt = now;
    }
    if (a.status === "alerted" && a.alertedAt && now - a.alertedAt > ESCALATE_AFTER_MS) {
      a.status = "unanswered";
    }
  }
  return t;
}

export function respond(signalId: string, answer: "clear" | "cannot"): { ok: boolean; error?: string } {
  const t = tick();
  if (!t) return { ok: false, error: "No ambulance trip is active." };
  const a = t.alerts.find((x) => x.signalId === signalId);
  if (!a) return { ok: false, error: "This junction is not on the ambulance's route." };
  if (a.status === "waiting") return { ok: false, error: "The ambulance is not close enough yet." };
  if (a.status === "cleared" || a.status === "cannot") return { ok: false, error: "Already answered." };
  a.status = answer === "clear" ? "cleared" : "cannot";
  a.respondedAt = Date.now();
  return { ok: true };
}

export function view(): TripView | null {
  const t = tick();
  if (!t) return null;
  const cum = g.__qcCum ?? cumulative(t.route.coords);
  const base = t.route.distanceM / t.route.durationS;
  const remainingM = Math.max(0, t.route.distanceM - t.progressM);
  const next = t.alerts.find((a) => a.alongM > t.progressM);
  return {
    ...t,
    position: pointAtDistance(t.route.coords, cum, t.progressM),
    baseSpeedMps: base,
    remainingM,
    etaS: remainingM / base,
    nextSignal: next
      ? { index: next.index, distanceM: next.alongM - t.progressM, etaS: (next.alongM - t.progressM) / base }
      : undefined,
  };
}
