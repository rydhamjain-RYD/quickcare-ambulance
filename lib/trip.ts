import { cumulative, headingAt, pointAtDistance, type LngLat } from "./geo";
import { officerNear } from "./officers";
import { hospitalDeskOnline } from "./hospitalStaff";
import { HEAVY_REASONS, type HeavyReason } from "./status";
import type { RouteOption } from "./routing";

export const ALERT_DISTANCE_M = 800; // officer is alerted this far before the signal
export const NO_REPLY_AFTER_MS = 25_000; // no answer in this long is shown to the crew as "no reply"
export const SPEEDS = [1, 4, 8, 16] as const;

export type AlertStatus = "waiting" | "alerted" | "cleared" | "heavy" | "cannot" | "unanswered";
export type OfficerAnswer = "clear" | "heavy" | "cannot";
export { HEAVY_REASONS };
export type { HeavyReason };

export type SignalAlert = {
  signalId: string;
  index: number; // 1-based position on the route
  lat: number;
  lng: number;
  alongM: number;
  status: AlertStatus;
  reason?: HeavyReason; // why traffic is heavy, when the officer said so
  answeredBy?: { name: string; badge: string };
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
  reroutes: number;
  rerouting?: boolean; // true while the server is picking a new route, so the app does not flash a warning
  notice?: { text: string; at: number }; // what the app just did for the crew, e.g. an automatic reroute
  hospitalAck?: { by: string; role: string; at: number }; // the hospital confirmed its team is ready
  alerts: SignalAlert[];
};

export type ViewAlert = SignalAlert & { onDuty?: { name: string; badge: string } };

export type TripView = Omit<Trip, "alerts"> & {
  alerts: ViewAlert[];
  hospitalDesk: { online: boolean };
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

function buildAlerts(route: RouteOption, cum: number[], previous?: SignalAlert[]): SignalAlert[] {
  const old = new Map((previous ?? []).map((a) => [a.signalId, a]));
  return route.signals.map((s, i) => {
    const prev = old.get(s.id);
    const keep = prev && prev.status !== "waiting";
    return {
      signalId: s.id,
      index: i + 1,
      lat: s.lat,
      lng: s.lng,
      alongM: s.alongM,
      status: keep ? prev.status : ("waiting" as AlertStatus),
      reason: keep ? prev.reason : undefined,
      answeredBy: keep ? prev.answeredBy : undefined,
      alertedAt: keep ? prev.alertedAt : undefined,
      respondedAt: keep ? prev.respondedAt : undefined,
      direction: headingAt(route.coords, cum, s.alongM),
    };
  });
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
    reroutes: 0,
    alerts: buildAlerts(args.route, cum),
  };
  g.__qcTrip = trip;
  g.__qcCum = cum;
  return trip;
}

/** Switch to a new route planned from the ambulance's current position. */
export function replaceRoute(route: RouteOption): boolean {
  const t = tick();
  if (!t || t.status !== "enroute") return false;
  const cum = cumulative(route.coords);
  t.alerts = buildAlerts(route, cum, t.alerts);
  t.route = route;
  t.progressM = 0;
  t.lastTickAt = Date.now();
  t.reroutes += 1;
  g.__qcCum = cum;
  return true;
}

export function setRerouting(on: boolean) {
  if (g.__qcTrip) g.__qcTrip.rerouting = on;
}

export function setNotice(text: string) {
  if (g.__qcTrip) g.__qcTrip.notice = { text, at: Date.now() };
}

export function setHospitalAck(by: string, role: string) {
  if (g.__qcTrip) g.__qcTrip.hospitalAck = { by, role, at: Date.now() };
}

export function setSpeed(speed: number) {
  const t = g.__qcTrip;
  if (!t) return;
  tick();
  t.speed = speed;
}

/** Advance the simulated ambulance and fire alerts. Called on every read. */
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
    if (a.status === "alerted" && a.alertedAt && now - a.alertedAt > NO_REPLY_AFTER_MS) {
      a.status = "unanswered";
    }
  }
  return t;
}

const ANSWER_STATUS: Record<OfficerAnswer, AlertStatus> = { clear: "cleared", heavy: "heavy", cannot: "cannot" };

/** Officer reply. Can be updated until the ambulance passes, because traffic changes. */
export function respond(
  signalId: string,
  answer: OfficerAnswer,
  by: { name: string; badge: string },
  reason?: HeavyReason,
): { ok: boolean; error?: string } {
  const t = tick();
  if (!t) return { ok: false, error: "No ambulance trip is active." };
  const a = t.alerts.find((x) => x.signalId === signalId);
  if (!a) return { ok: false, error: "This junction is not on the ambulance's route." };
  if (a.status === "waiting") return { ok: false, error: "The ambulance is not close enough yet." };
  if (a.alongM <= t.progressM) return { ok: false, error: "The ambulance has already passed this junction." };
  a.status = ANSWER_STATUS[answer];
  a.reason = answer === "heavy" ? (reason ?? "congestion") : undefined;
  a.answeredBy = by;
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
    alerts: t.alerts.map((a) => ({ ...a, onDuty: officerNear(a.lat, a.lng) })),
    hospitalDesk: { online: hospitalDeskOnline(t.hospital.lat, t.hospital.lng) },
    position: pointAtDistance(t.route.coords, cum, t.progressM),
    baseSpeedMps: base,
    remainingM,
    etaS: remainingM / base,
    nextSignal: next
      ? { index: next.index, distanceM: next.alongM - t.progressM, etaS: (next.alongM - t.progressM) / base }
      : undefined,
  };
}
