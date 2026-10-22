import type { NextRequest } from "next/server";
import hospitals from "@/data/hospitals.json";

type Place = { id: string; name: string; lat: number; lng: number; source: "saved" | "search" };

const UA = "QuickCareHackathon/0.1 (student project)";
const BBOX = "77.45,12.83,77.75,13.10"; // Bengaluru: west,south,east,north
const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; value: { results: Place[]; searchFailed: boolean } }>();

/** Edit distance, to forgive small typos such as "manipel". */
function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function matchSaved(needle: string): Place[] {
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 3);
  return hospitals
    .filter((h) => {
      const hay = [h.name.toLowerCase(), ...h.aliases];
      if (hay.some((x) => x.includes(needle) || (needle.includes(x) && x.length >= 4))) return true;
      if (needle.length < 4) return false;
      const tol = needle.length > 6 ? 2 : 1;
      return [...words(h.name), ...h.aliases.flatMap(words)].some((w) => lev(needle, w.slice(0, needle.length)) <= tol);
    })
    .map((h) => ({ id: h.id, name: h.name, lat: h.lat, lng: h.lng, source: "saved" as const }));
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; district?: string; city?: string; osm_id?: number; osm_type?: string };
};

async function photon(q: string, hospitalOnly: boolean): Promise<Place[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=12.9716&lon=77.5946&limit=7&lang=en&bbox=${BBOX}` +
    (hospitalOnly ? "&osm_tag=amenity:hospital" : "");
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const data: { features: PhotonFeature[] } = await res.json();
  return data.features.flatMap((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const parts = [p.name, p.housenumber ? `${p.housenumber} ${p.street ?? ""}`.trim() : p.street, p.district ?? p.city].filter(Boolean) as string[];
    const name = parts.filter((x, i) => parts.indexOf(x) === i).join(", ");
    if (!name) return [];
    return [{ id: `osm-${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lng}`}`, name, lat, lng, source: "search" as const }];
  });
}

/** Fallback if Photon is down. Nominatim is slower and not meant for as-you-type use, so it is only a fallback. */
async function nominatim(q: string, hospitalOnly: boolean): Promise<Place[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=5&bounded=1&viewbox=77.45,13.10,77.75,12.83&q=" +
    encodeURIComponent(hospitalOnly && !q.toLowerCase().includes("hospital") ? `${q} hospital` : q);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const rows: { place_id: number; display_name: string; lat: string; lon: string }[] = await res.json();
  return rows.map((r) => ({
    id: `osm-${r.place_id}`,
    name: r.display_name.split(",").slice(0, 3).join(","),
    lat: Number(r.lat),
    lng: Number(r.lon),
    source: "search" as const,
  }));
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ error: "Type at least 2 letters." }, { status: 400 });
  const kind = request.nextUrl.searchParams.get("kind") === "place" ? "place" : "hospital";
  const needle = q.toLowerCase();

  const key = `${kind}:${needle}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.value);

  const saved = kind === "hospital" ? matchSaved(needle) : [];

  let found: Place[] = [];
  let searchFailed = false;
  try {
    found = await photon(q, kind === "hospital");
  } catch {
    try {
      found = await nominatim(q, kind === "hospital");
    } catch {
      searchFailed = true;
    }
  }

  const seen = new Set<string>();
  const results = [...saved, ...found]
    .filter((p) => {
      const k = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);

  const value = { results, searchFailed };
  if (!searchFailed) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
  }
  return Response.json(value);
}
