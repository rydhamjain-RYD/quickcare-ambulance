import type { NextRequest } from "next/server";
import hospitals from "@/data/hospitals.json";

type Place = { id: string; name: string; lat: number; lng: number; source: "saved" | "search" };

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({ error: "Type at least 2 letters of the hospital name." }, { status: 400 });
  }
  const needle = q.toLowerCase();

  const saved: Place[] = hospitals
    .filter((h) => h.name.toLowerCase().includes(needle) || h.aliases.some((a) => a.includes(needle) || needle.includes(a)))
    .map((h) => ({ id: h.id, name: h.name, lat: h.lat, lng: h.lng, source: "saved" as const }));

  let found: Place[] = [];
  let searchFailed = false;
  try {
    // Bounded to Bengaluru so "Manipal" does not resolve to Manipal town.
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&bounded=1&viewbox=77.45,13.10,77.75,12.83&q=" +
      encodeURIComponent(q.toLowerCase().includes("hospital") ? q : `${q} hospital`);
    const res = await fetch(url, {
      headers: { "User-Agent": "QuickCareHackathon/0.1 (student project)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const rows: { place_id: number; display_name: string; lat: string; lon: string }[] = await res.json();
    found = rows.map((r) => ({
      id: `osm-${r.place_id}`,
      name: r.display_name.split(",").slice(0, 3).join(","),
      lat: Number(r.lat),
      lng: Number(r.lon),
      source: "search" as const,
    }));
  } catch {
    searchFailed = true;
  }

  const seen = new Set<string>();
  const results = [...saved, ...found].filter((p) => {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Response.json({ results, searchFailed });
}
