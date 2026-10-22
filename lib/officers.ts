import { randomBytes, timingSafeEqual } from "node:crypto";
import roster from "@/data/officers.json";
import signalsData from "@/data/signals.json";
import { haversine } from "./geo";
import * as store from "./store";

/**
 * Officer identity and daily posting.
 *
 * The roster in data/officers.json is a SAMPLE stand-in for the police department's own records.
 * A real deployment must verify officers against the department (and use real credentials),
 * because this app cannot prove that someone is a police officer by itself.
 *
 * Sessions, postings and failed-login counts live in shared storage (see lib/store.ts), so they
 * work across servers.
 */

export const POSTING_RADIUS_M = 100; // an officer posted here covers signals within this distance
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 5 * 60_000;
const SESSION_TTL_S = 12 * 3600;
const DUTY_TTL_S = 24 * 3600;

export type Officer = { badge: string; name: string; rank: string; station: string };
export type Posting = { lat: number; lng: number; label: string; since: number; date: string };

type Rec = { badge: string; pin: string; name: string; rank: string; station: string };
const ROSTER = roster as Rec[];
const SIGNALS = signalsData as { id: number; lat: number; lng: number }[];

const today = () => new Date().toISOString().slice(0, 10);
const publicOf = (r: Rec): Officer => ({ badge: r.badge, name: r.name, rank: r.rank, station: r.station });
const bearer = (request: Request) => {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

function pinMatches(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function login(badge: string, pin: string): Promise<{ ok: true; token: string; officer: Officer } | { ok: false; error: string }> {
  const key = badge.trim().toUpperCase();
  const failKey = `fails:officer:${key}`;
  const f = (await store.get<{ n: number; until: number }>(failKey))?.value;
  if (f && f.until > Date.now()) return { ok: false, error: "Too many wrong attempts. Try again in a few minutes." };

  const rec = ROSTER.find((r) => r.badge === key);
  // Same message for an unknown badge and a wrong PIN, so badge numbers cannot be probed.
  if (!rec || !pinMatches(rec.pin, pin.trim())) {
    const n = (f?.n ?? 0) + 1;
    await store.put(failKey, { n, until: n >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MS : 0 }, { ttlSec: 3600 });
    return { ok: false, error: "Badge ID or PIN is not correct." };
  }
  await store.del(failKey);
  const token = randomBytes(24).toString("hex");
  await store.put(`session:officer:${token}`, rec.badge, { ttlSec: SESSION_TTL_S });
  return { ok: true, token, officer: publicOf(rec) };
}

export async function officerFromRequest(request: Request): Promise<Officer | null> {
  const token = bearer(request);
  if (!token) return null;
  const badge = (await store.get<string>(`session:officer:${token}`))?.value;
  const rec = badge ? ROSTER.find((r) => r.badge === badge) : undefined;
  return rec ? publicOf(rec) : null;
}

export async function logout(request: Request) {
  const token = bearer(request);
  if (token) await store.del(`session:officer:${token}`);
}

export async function getPosting(badge: string): Promise<Posting | null> {
  const p = (await store.get<Posting>(`duty:${badge}`))?.value;
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

export async function setPosting(badge: string, p: { lat: number; lng: number; label: string }): Promise<{ ok: boolean; error?: string }> {
  const near = SIGNALS.some((s) => haversine([p.lng, p.lat], [s.lng, s.lat]) <= POSTING_RADIUS_M);
  if (!near) return { ok: false, error: "There is no traffic signal at this spot. Pick one of the listed signals." };
  const posting: Posting = { lat: p.lat, lng: p.lng, label: p.label.slice(0, 120), since: Date.now(), date: today() };
  await store.put(`duty:${badge}`, posting, { ttlSec: DUTY_TTL_S });
  return { ok: true };
}

export async function endDuty(badge: string) {
  await store.del(`duty:${badge}`);
}

/** Everyone posted today, read once so many signals can be checked without more storage calls. */
export async function officerLookup(): Promise<(lat: number, lng: number) => { name: string; badge: string } | undefined> {
  const rows = await store.list<Posting>("duty:");
  const posted = rows
    .map((r) => ({ badge: r.key.slice("duty:".length), p: r.value }))
    .filter((r) => r.p.date === today())
    .flatMap((r) => {
      const rec = ROSTER.find((x) => x.badge === r.badge);
      return rec ? [{ name: rec.name, badge: rec.badge, lat: r.p.lat, lng: r.p.lng }] : [];
    });
  return (lat, lng) => {
    const hit = posted.find((o) => haversine([lng, lat], [o.lng, o.lat]) <= POSTING_RADIUS_M);
    return hit ? { name: hit.name, badge: hit.badge } : undefined;
  };
}

export async function covers(badge: string, lat: number, lng: number): Promise<boolean> {
  const p = await getPosting(badge);
  return !!p && haversine([lng, lat], [p.lng, p.lat]) <= POSTING_RADIUS_M;
}
