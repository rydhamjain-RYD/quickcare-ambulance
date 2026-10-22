import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import staff from "@/data/hospital-staff.json";
import hospitals from "@/data/hospitals.json";
import { haversine } from "./geo";
import * as store from "./store";
import { TEST_MODE } from "./testMode";

/**
 * Hospital staff identity.
 *
 * The roster in data/hospital-staff.json is a SAMPLE stand-in. A real deployment must verify each
 * hospital (registration number, authorised staff) against official records, because this app
 * cannot prove on its own that someone speaks for a hospital.
 *
 * In test mode only, a hospital that a driver picks as the drop-off but that has no account yet gets
 * a sample account on the spot, so every destination can be checked from the hospital side.
 *
 * Sessions, failed-login counts, online presence and test accounts live in shared storage
 * (see lib/store.ts), so they work across servers.
 */

export const MATCH_RADIUS_M = 300; // a trip whose drop-off is this close to the hospital is "heading here"
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 5 * 60_000;
const ONLINE_WITHIN_MS = 15_000;
const SESSION_TTL_S = 12 * 3600;
const AUTO_KEY = "hauto"; // test-mode accounts created on the fly

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
  id: string; pin: string; registration: string; address: string; emergencyDesk: string; staffName: string; staffRole: string;
  hospitalId?: string; // a hospital from data/hospitals.json
  name?: string; lat?: number; lng?: number; // or a hospital described directly (test-mode accounts)
};
const RECS = staff as Rec[];

const bearer = (request: Request) => {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

async function autoRecs(): Promise<Rec[]> {
  return (await store.get<Rec[]>(AUTO_KEY))?.value ?? [];
}
async function allRecs(): Promise<Rec[]> {
  return [...RECS, ...(await autoRecs())];
}

function accountOf(r: Rec): HospitalAccount | null {
  let name = r.name, lat = r.lat, lng = r.lng;
  if (r.hospitalId) {
    const h = hospitals.find((x) => x.id === r.hospitalId);
    if (!h) return null;
    name = h.name; lat = h.lat; lng = h.lng;
  }
  if (!name || lat == null || lng == null) return null;
  return {
    id: r.id, hospitalName: name, address: r.address, registration: r.registration,
    emergencyDesk: r.emergencyDesk, staffName: r.staffName, staffRole: r.staffRole, lat, lng,
  };
}

function pinMatches(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function loginHospital(id: string, pin: string): Promise<{ ok: true; token: string; account: HospitalAccount } | { ok: false; error: string }> {
  const key = id.trim().toUpperCase();
  const failKey = `fails:hospital:${key}`;
  const f = (await store.get<{ n: number; until: number }>(failKey))?.value;
  if (f && f.until > Date.now()) return { ok: false, error: "Too many wrong attempts. Try again in a few minutes." };

  const rec = (await allRecs()).find((r) => r.id === key);
  const account = rec ? accountOf(rec) : null;
  // Same message for an unknown ID and a wrong PIN, so IDs cannot be probed.
  if (!rec || !account || !pinMatches(rec.pin, pin.trim())) {
    const n = (f?.n ?? 0) + 1;
    await store.put(failKey, { n, until: n >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MS : 0 }, { ttlSec: 3600 });
    return { ok: false, error: "Hospital ID or PIN is not correct." };
  }
  await store.del(failKey);
  const token = randomBytes(24).toString("hex");
  await store.put(`session:hospital:${token}`, rec.id, { ttlSec: SESSION_TTL_S });
  return { ok: true, token, account };
}

export async function hospitalFromRequest(request: Request): Promise<HospitalAccount | null> {
  const token = bearer(request);
  if (!token) return null;
  const id = (await store.get<string>(`session:hospital:${token}`))?.value;
  if (!id) return null;
  const rec = (await allRecs()).find((r) => r.id === id);
  return rec ? accountOf(rec) : null;
}

export async function logoutHospital(request: Request) {
  const token = bearer(request);
  if (token) await store.del(`session:hospital:${token}`);
}

// A dashboard polls every 1.5 s. Saving "seen" that often is wasteful, so each server saves it at most every 5 s.
const lastTouch = new Map<string, number>();

/** Called each time a hospital dashboard polls, so drivers can see the desk is watching. */
export async function touchHospital(id: string) {
  const now = Date.now();
  if (now - (lastTouch.get(id) ?? 0) < 5000) return;
  lastTouch.set(id, now);
  await store.put(`seen:hospital:${id}`, now, { ttlSec: 30 });
}

export function hospitalCovers(a: HospitalAccount, lat: number, lng: number): boolean {
  return haversine([lng, lat], [a.lng, a.lat]) <= MATCH_RADIUS_M;
}

/** Who is online right now, read once so any hospital location can be checked without more storage calls. */
export async function hospitalPresence(): Promise<(lat: number, lng: number) => boolean> {
  const [seenRows, auto] = await Promise.all([store.list<number>("seen:hospital:"), autoRecs()]);
  const now = Date.now();
  const online = new Set(seenRows.filter((r) => now - r.value < ONLINE_WITHIN_MS).map((r) => r.key.slice("seen:hospital:".length)));
  const accounts = [...RECS, ...auto].filter((r) => online.has(r.id)).flatMap((r) => { const a = accountOf(r); return a ? [a] : []; });
  return (lat, lng) => accounts.some((a) => hospitalCovers(a, lat, lng));
}

/**
 * Test mode only: make sure the hospital a driver just chose has an account to log in with.
 * Does nothing outside test mode, so a real deployment never invents accounts.
 */
export async function ensureHospitalAccount(h: { name: string; lat: number; lng: number }) {
  if (!TEST_MODE) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await store.get<Rec[]>(AUTO_KEY);
    const auto = row?.value ?? [];
    const exists = [...RECS, ...auto].some((r) => {
      const a = accountOf(r);
      return !!a && hospitalCovers(a, h.lat, h.lng);
    });
    if (exists) return;
    const n = auto.length + 1;
    const rec: Rec = {
      id: `HOSP-T${String(n).padStart(2, "0")}`,
      pin: String(randomInt(1000, 10000)),
      registration: `SAMPLE-KPME-T${String(n).padStart(2, "0")}`,
      address: "Bengaluru",
      emergencyDesk: "Emergency desk",
      staffName: "Duty Doctor",
      staffRole: "Emergency Medical Officer",
      name: h.name.replace(/\s*\((demo )?(drop|pickup)\)\s*$/i, ""),
      lat: h.lat,
      lng: h.lng,
    };
    if (!row) { await store.put(AUTO_KEY, [rec], { ttlSec: 24 * 3600 }); return; }
    if (await store.cas(AUTO_KEY, row.version, [...auto, rec])) return;
  }
}

/** Test mode only: every account a tester can log in as, with the one for the running trip marked. */
export async function testAccounts(tripHospital?: { lat: number; lng: number } | null) {
  if (!TEST_MODE) return [];
  return (await allRecs()).flatMap((r) => {
    const a = accountOf(r);
    if (!a) return [];
    return [{ id: r.id, pin: r.pin, name: a.hospitalName, current: !!tripHospital && hospitalCovers(a, tripHospital.lat, tripHospital.lng) }];
  });
}
