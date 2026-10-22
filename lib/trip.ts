import { cumulative, headingAt, pointAtDistance, type LngLat } from "./geo";
import { officerLookup } from "./officers";
import { hospitalPresence } from "./hospitalStaff";
import { HEAVY_REASONS, type HeavyReason } from "./status";
import * as store from "./store";
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
  name?: string; // the roads that meet at this signal
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
  /** Progress at `lastTickAt`. The position now is worked out from these two, so reading never has to save. */
  progressM: number;
  speed: number; // simulation speed multiplier
  lastTickAt: number;
  startedAt: number;
  reroutes: number;
  reroutingAt?: number; // set while the server is picking a new route, so the app does not flash a warning
  notice?: { text: string; at: number }; // what the app just did for the crew, e.g. an automatic reroute
  hospitalAck?: { by: string; role: string; at: number }; // the hospital confirmed its team is ready
  alerts: SignalAlert[];
};

export type ViewAlert = SignalAlert & { onDuty?: { name: string; badge: string } };

export type TripView = Omit<Trip, "alerts" | "reroutingAt"> & {
  alerts: ViewAlert[];
  rerouting: boolean;
  hospitalDesk: { online: boolean };
  position: LngLat;
  baseSpeedMps: number;
  remainingM: number;
  etaS: number; // real-world seconds to hospital at normal speed
  nextSignal?: { index: number; distanceM: number; etaS: number };
};

const KEY = "trip:current";
const TRIP_TTL_S = 12 * 3600;
const REROUTING_STALE_MS = 15_000;

function buildAlerts(route: RouteOption, cum: number[], previous?: SignalAlert[]): SignalAlert[] {
  const old = new Map((previous ?? []).map((a) => [a.signalId, a]));
  return route.signals.map((s, i) => {
    const prev = old.get(s.id);
    const keep = prev && prev.status !== "waiting";
    return {
      signalId: s.id,
      index: i + 1,
      name: s.name ?? undefined,
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

/**
 * Move a copy of the trip forward to `now`. Returns true when something other than plain progress
 * changed (an alert fired, an alert timed out, the ambulance arrived), which is worth saving.
 */
function advance(t: Trip, now: number): boolean {
  let changed = false;
  const base = t.route.distanceM / t.route.durationS;

  if (t.status === "enroute") {
    t.progressM = Math.min(t.route.distanceM, t.progressM + ((now - t.lastTickAt) / 1000) * base * t.speed);
    if (t.progressM >= t.route.distanceM) {
      t.status = "arrived";
      changed = true;
    }
  }
  t.lastTickAt = now;

  for (const a of t.alerts) {
    if (a.status === "waiting" && a.alongM - t.progressM <= ALERT_DISTANCE_M) {
      a.status = "alerted";
      a.alertedAt = now;
      changed = true;
    }
    if (a.status === "alerted" && a.alertedAt && now - a.alertedAt > NO_REPLY_AFTER_MS) {
      a.status = "unanswered";
      changed = true;
    }
  }
  return changed;
}

async function load(): Promise<{ trip: Trip; version: number } | null> {
  const row = await store.get<Trip>(KEY);
  return row ? { trip: row.value, version: row.version } : null;
}

/**
 * The current trip, moved forward to now. Reading normally saves nothing (progress is worked out
 * from the last saved point). It saves only when an alert fires, times out or the ambulance arrives,
 * and only if nobody else changed the trip in the meantime.
 */
async function settle(): Promise<Trip | null> {
  for (let i = 0; i < 5; i++) {
    const cur = await load();
    if (!cur) return null;
    const t = structuredClone(cur.trip);
    if (!advance(t, Date.now())) return t;
    if (await store.cas(KEY, cur.version, t)) return t;
  }
  const cur = await load();
  if (!cur) return null;
  const t = structuredClone(cur.trip);
  advance(t, Date.now());
  return t;
}

/** Change the trip safely: read it, apply `fn`, save only if nobody changed it meanwhile, otherwise try again. */
async function mutate<R>(fn: (t: Trip, now: number) => R): Promise<{ found: false } | { found: true; result: R }> {
  for (let i = 0; i < 6; i++) {
    const cur = await load();
    if (!cur) return { found: false };
    const now = Date.now();
    const t = structuredClone(cur.trip);
    advance(t, now);
    const result = fn(t, now);
    if (await store.cas(KEY, cur.version, t)) return { found: true, result };
  }
  throw new Error("The trip is busy right now. Try again in a moment.");
}

export async function getTripRaw(): Promise<Trip | null> {
  return settle();
}

export async function resetTrip() {
  await store.del(KEY);
}

export async function startTrip(args: {
  hospital: Trip["hospital"];
  start: Trip["start"];
  route: RouteOption;
  note?: Trip["note"];
}): Promise<Trip> {
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
  await store.put(KEY, trip, { ttlSec: TRIP_TTL_S });
  return trip;
}

/** Switch to a new route planned from the ambulance's current position. */
export async function replaceRoute(route: RouteOption): Promise<boolean> {
  const r = await mutate((t, now) => {
    if (t.status !== "enroute") return false;
    t.alerts = buildAlerts(route, cumulative(route.coords), t.alerts);
    t.route = route;
    t.progressM = 0;
    t.lastTickAt = now;
    t.reroutes += 1;
    return true;
  });
  return r.found && r.result;
}

export async function setRerouting(on: boolean) {
  await mutate((t, now) => {
    t.reroutingAt = on ? now : undefined;
  });
}

export async function setNotice(text: string) {
  await mutate((t, now) => {
    t.notice = { text, at: now };
  });
}

export async function setHospitalAck(by: string, role: string) {
  await mutate((t, now) => {
    t.hospitalAck = { by, role, at: now };
  });
}

export async function setSpeed(speed: number) {
  await mutate((t) => {
    t.speed = speed; // progress up to now was already worked out by mutate, at the old speed
  });
}

const ANSWER_STATUS: Record<OfficerAnswer, AlertStatus> = { clear: "cleared", heavy: "heavy", cannot: "cannot" };

/** Officer reply. Can be updated until the ambulance passes, because traffic changes. */
export async function respond(
  signalId: string,
  answer: OfficerAnswer,
  by: { name: string; badge: string },
  reason?: HeavyReason,
): Promise<{ ok: boolean; error?: string }> {
  const r = await mutate((t, now): { ok: boolean; error?: string } => {
    const a = t.alerts.find((x) => x.signalId === signalId);
    if (!a) return { ok: false, error: "This junction is not on the ambulance's route." };
    if (a.status === "waiting") return { ok: false, error: "The ambulance is not close enough yet." };
    if (a.alongM <= t.progressM) return { ok: false, error: "The ambulance has already passed this junction." };
    a.status = ANSWER_STATUS[answer];
    a.reason = answer === "heavy" ? (reason ?? "congestion") : undefined;
    a.answeredBy = by;
    a.respondedAt = now;
    return { ok: true };
  });
  return r.found ? r.result : { ok: false, error: "No ambulance trip is active." };
}

export async function view(): Promise<TripView | null> {
  // The trip, who is posted where, and who is online are all read at the same time.
  const [t, officerAt, hospitalOnline] = await Promise.all([settle(), officerLookup(), hospitalPresence()]);
  if (!t) return null;
  const cum = cumulative(t.route.coords);
  const base = t.route.distanceM / t.route.durationS;
  const remainingM = Math.max(0, t.route.distanceM - t.progressM);
  const next = t.alerts.find((a) => a.alongM > t.progressM);
  const { reroutingAt, ...rest } = t;
  return {
    ...rest,
    alerts: t.alerts.map((a) => ({ ...a, onDuty: officerAt(a.lat, a.lng) })),
    rerouting: !!reroutingAt && Date.now() - reroutingAt < REROUTING_STALE_MS,
    hospitalDesk: { online: hospitalOnline(t.hospital.lat, t.hospital.lng) },
    position: pointAtDistance(t.route.coords, cum, t.progressM),
    baseSpeedMps: base,
    remainingM,
    etaS: remainingM / base,
    nextSignal: next
      ? { index: next.index, distanceM: next.alongM - t.progressM, etaS: (next.alongM - t.progressM) / base }
      : undefined,
  };
}
