import { randomBytes, timingSafeEqual } from "node:crypto";
import staff from "@/data/hospital-staff.json";
import hospitals from "@/data/hospitals.json";
import { haversine } from "./geo";

/**
 * Hospital staff identity.
 *
 * The roster in data/hospital-staff.json is a DEMO stand-in. A real deployment must verify each
 * hospital (registration number, authorised staff) against official records, because this app
 * cannot prove on its own that someone speaks for a hospital.
 */

export const MATCH_RADIUS_M = 300; // a trip whose drop-off is this close to the hospital is "heading here"
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 5 * 60_000;
const ONLINE_WITHIN_MS = 15_000;

export type HospitalAccount = {
  id: string;
  hospitalName: string;
  address: string;
  registration: string;
  emergencyDesk: string;
  staffName: string;
  staffRole: string;
  lat: number;
  lng: number;
};

type Rec = {
  id: string; pin: string; hospitalId: string; registration: string; address: string;
  emergencyDesk: string; staffName: string; staffRole: string;
};
const RECS = staff as Rec[];

function accountOf(r: Rec): HospitalAccount | null {
  const h = hospitals.find((x) => x.id === r.hospitalId);
  if (!h) return null;
  return {
    id: r.id, hospitalName: h.name, address: r.address, registration: r.registration,
    emergencyDesk: r.emergencyDesk, staffName: r.staffName, staffRole: r.staffRole, lat: h.lat, lng: h.lng,
  };
}

const g = globalThis as unknown as {
  __qcHSessions?: Map<string, string>; // token -> account id
  __qcHFails?: Map<string, { n: number; until: number }>;
  __qcHSeen?: Map<string, number>; // account id -> last time its dashboard polled
};
const sessions = () => (g.__qcHSessions ??= new Map());
const fails = () => (g.__qcHFails ??= new Map());
const seen = () => (g.__qcHSeen ??= new Map());

function pinMatches(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function loginHospital(id: string, pin: string): { ok: true; token: string; account: HospitalAccount } | { ok: false; error: string } {
  const key = id.trim().toUpperCase();
  const f = fails().get(key);
  if (f && f.until > Date.now()) return { ok: false, error: "Too many wrong attempts. Try again in a few minutes." };

  const rec = RECS.find((r) => r.id === key);
  const account = rec ? accountOf(rec) : null;
  // Same message for an unknown ID and a wrong PIN, so IDs cannot be probed.
  if (!rec || !account || !pinMatches(rec.pin, pin.trim())) {
    const n = (f?.n ?? 0) + 1;
    fails().set(key, { n, until: n >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MS : 0 });
    return { ok: false, error: "Hospital ID or PIN is not correct." };
  }
  fails().delete(key);
  const token = randomBytes(24).toString("hex");
  sessions().set(token, rec.id);
  return { ok: true, token, account };
}

export function hospitalFromRequest(request: Request): HospitalAccount | null {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const id = token ? sessions().get(token) : undefined;
  const rec = id ? RECS.find((r) => r.id === id) : undefined;
  return rec ? accountOf(rec) : null;
}

export function logoutHospital(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  if (h.startsWith("Bearer ")) sessions().delete(h.slice(7));
}

/** Called each time a hospital dashboard polls, so drivers can see the desk is watching. */
export function touchHospital(id: string) {
  seen().set(id, Date.now());
}

export function hospitalCovers(a: HospitalAccount, lat: number, lng: number): boolean {
  return haversine([lng, lat], [a.lng, a.lat]) <= MATCH_RADIUS_M;
}

/** True when staff are logged in at the hospital at this location and their dashboard is open. */
export function hospitalDeskOnline(lat: number, lng: number): boolean {
  const now = Date.now();
  return RECS.some((r) => {
    const a = accountOf(r);
    const last = seen().get(r.id);
    return !!a && !!last && now - last < ONLINE_WITHIN_MS && hospitalCovers(a, lat, lng);
  });
}
