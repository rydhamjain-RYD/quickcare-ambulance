/**
 * Shared storage for everything the three screens must agree on: the running trip, officer and
 * hospital logins, postings, and who is online.
 *
 * With SUPABASE_URL and SUPABASE_SECRET_KEY set, data lives in the `kv` table in Supabase, so any
 * server (for example any Vercel function, anywhere) sees the same state. Without them it lives in
 * this server's memory, which is fine for one local machine and is how local development works.
 *
 * The secret key is read only on the server. Never give it a NEXT_PUBLIC_ name.
 *
 * `cas` (compare and set) saves only if nobody else changed the row since it was read, so two
 * requests arriving together cannot overwrite each other's changes.
 */

export type Row<T> = { value: T; version: number };

const URL_ = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;
const useSupabase = !!URL_ && !!KEY && !KEY.startsWith("PASTE");

export const storageKind: "supabase" | "memory" = useSupabase ? "supabase" : "memory";

// ---------- memory backend ----------
type MemRow = { value: unknown; version: number; expires?: number };
const g = globalThis as unknown as { __qcKv?: Map<string, MemRow> };
const mem = () => (g.__qcKv ??= new Map());
const live = (r: MemRow | undefined): r is MemRow => !!r && (r.expires === undefined || r.expires > Date.now());

// ---------- supabase backend ----------
function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: KEY as string, "Content-Type": "application/json", ...extra };
  // Legacy keys are JWTs and are also sent as a bearer token. New sb_secret_ keys go in `apikey` only.
  if ((KEY as string).startsWith("eyJ")) h.Authorization = `Bearer ${KEY}`;
  return h;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${URL_}/rest/v1/kv${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Storage error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

const notExpired = () => `or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})`;
const eq = (key: string) => `key=eq.${encodeURIComponent(key)}`;
const expiry = (ttlSec?: number) => (ttlSec ? new Date(Date.now() + ttlSec * 1000).toISOString() : null);

export async function get<T>(key: string): Promise<Row<T> | null> {
  if (!useSupabase) {
    const r = mem().get(key);
    return live(r) ? { value: structuredClone(r.value) as T, version: r.version } : null;
  }
  const rows: Row<T>[] = await (await rest(`?select=value,version&${eq(key)}&${notExpired()}&limit=1`, { headers: headers() })).json();
  return rows[0] ?? null;
}

/** Save a value, replacing whatever was there. */
export async function put<T>(key: string, value: T, opts: { ttlSec?: number } = {}): Promise<void> {
  if (!useSupabase) {
    mem().set(key, { value: structuredClone(value), version: Date.now(), expires: opts.ttlSec ? Date.now() + opts.ttlSec * 1000 : undefined });
    return;
  }
  await rest(`?on_conflict=key`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ key, value, version: Date.now(), expires_at: expiry(opts.ttlSec), updated_at: new Date().toISOString() }),
  });
}

/** Save only if the row is still at `expectedVersion`. Returns false if someone else changed it first. */
export async function cas<T>(key: string, expectedVersion: number, value: T): Promise<boolean> {
  if (!useSupabase) {
    const r = mem().get(key);
    if (!live(r) || r.version !== expectedVersion) return false;
    mem().set(key, { value: structuredClone(value), version: expectedVersion + 1, expires: r.expires });
    return true;
  }
  const rows: unknown[] = await (
    await rest(`?${eq(key)}&version=eq.${expectedVersion}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify({ value, version: expectedVersion + 1, updated_at: new Date().toISOString() }),
    })
  ).json();
  return rows.length === 1;
}

export async function del(key: string): Promise<void> {
  if (!useSupabase) {
    mem().delete(key);
    return;
  }
  await rest(`?${eq(key)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
}

/** Every live row whose key starts with `prefix`. */
export async function list<T>(prefix: string): Promise<{ key: string; value: T }[]> {
  if (!useSupabase) {
    return [...mem().entries()].filter(([k, r]) => k.startsWith(prefix) && live(r)).map(([key, r]) => ({ key, value: structuredClone(r.value) as T }));
  }
  const rows: { key: string; value: T }[] = await (
    await rest(`?select=key,value&key=like.${encodeURIComponent(prefix)}*&${notExpired()}`, { headers: headers() })
  ).json();
  return rows;
}
