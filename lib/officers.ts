import { randomBytes, timingSafeEqual } from "node:crypto";
import roster from "@/data/officers.json";
import signalsData from "@/data/signals.json";
import { haversine } from "./geo";

/**
 * Officer identity and daily posting.
 *
 * The roster in data/officers.json is a DEMO stand-in for the police department's own records.
 * A real deployment must verify officers against the department (and use real credentials),
 * because this app cannot prove that someone is a police officer by itself.
 */

export const POSTING_RADIUS_M = 100; // an officer posted here covers signals within this distance
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 5 * 60_000;

export type Officer = { badge: string; name: string; rank: string; station: string };
export type Posting = { lat: number; lng: number; label: string; since: number; date: string };

type Rec = { badge: string; pin: string; name: string; rank: string; station: string };
const ROSTER = roster as Rec[];
const SIGNALS = signalsData as { id: number; lat: number; lng: number }[];

const g = globalThis as unknown as {
  __qcSessions?: Map<string, string>; // token -> badge
  __qcDuty?: Map<string, Posting>; // badge -> posting
  __qcFails?: Map<string, { n: number; until: number }>;
};
const sessions = () => (g.__qcSessions ??= new Map());
const duty = () => (g.__qcDuty ??= new Map());
const fails = () => (g.__qcFails ??= new Map());

const today = () => new Date().toISOString().slice(0, 10);
const publicOf = (r: Rec): Officer => ({ badge: r.badge, name: r.name, rank: r.rank, station: r.station });

function pinMatches(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function login(badge: string, pin: string): { ok: true; token: string; officer: Officer } | { ok: false; error: string } {
  const key = badge.trim().toUpperCase();
  const f = fails().get(key);
  if (f && f.until > Date.now()) return { ok: false, error: "Too many wrong attempts. Try again in a few minutes." };

  const rec = ROSTER.find((r) => r.badge === key);
  // Same message for an unknown badge and a wrong PIN, so badge numbers cannot be probed.
  if (!rec || !pinMatches(rec.pin, pin.trim())) {
    const n = (f?.n ?? 0) + 1;
    fails().set(key, { n, until: n >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MS : 0 });
    return { ok: false, error: "Badge ID or PIN is not correct." };
  }
  fails().delete(key);
  const token = randomBytes(24).toString("hex");
  sessions().set(token, rec.badge);
  return { ok: true, token, officer: publicOf(rec) };
}

export function officerFromRequest(request: Request): Officer | null {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const badge = token ? sessions().get(token) : undefined;
  const rec = badge ? ROSTER.find((r) => r.badge === badge) : undefined;
  return rec ? publicOf(rec) : null;
}

export function logout(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  if (h.startsWith("Bearer ")) sessions().delete(h.slice(7));
}

export function getPosting(badge: string): Posting | null {
  const p = duty().get(badge);
  return p && p.date === today() ? p : null;
}

export function nearestSignals(lat: number, lng: number, withinM = 400, limit = 6) {
  const candidates = SIGNALS.map((s) => ({ lat: s.lat, lng: s.lng, distanceM: Math.round(haversine([lng, lat], [s.lng, s.lat])) }))
    .filter((c) => c.distanceM <= withinM)
    .sort((a, b) => a.distanceM - b.distanceM);
  const out: typeof candidates = [];
  for (const c of candidates) {
    // Several signal nodes make up one junction, so keep only the closest one per ~60 m.
    if (out.some((o) => haversine([o.lng, o.lat], [c.lng, c.lat]) < 60)) continue;
    out.push(c);
  }
  return out.slice(0, limit);
}

export function setPosting(badge: string, p: { lat: number; lng: number; label: string }): { ok: boolean; error?: string } {
  const near = SIGNALS.some((s) => haversine([p.lng, p.lat], [s.lng, s.lat]) <= POSTING_RADIUS_M);
  if (!near) return { ok: false, error: "There is no traffic signal at this spot. Pick one of the listed signals." };
  duty().set(badge, { lat: p.lat, lng: p.lng, label: p.label.slice(0, 120), since: Date.now(), date: today() });
  return { ok: true };
}

export function endDuty(badge: string) {
  duty().delete(badge);
}

/** The officer on duty at (or within 100 m of) this signal today, if any. */
export function officerNear(lat: number, lng: number): { name: string; badge: string } | undefined {
  for (const [badge, p] of duty()) {
    if (p.date !== today()) continue;
    if (haversine([lng, lat], [p.lng, p.lat]) <= POSTING_RADIUS_M) {
      const rec = ROSTER.find((r) => r.badge === badge);
      if (rec) return { name: rec.name, badge };
    }
  }
  return undefined;
}

export function covers(badge: string, lat: number, lng: number): boolean {
  const p = getPosting(badge);
  return !!p && haversine([lng, lat], [p.lng, p.lat]) <= POSTING_RADIUS_M;
}
