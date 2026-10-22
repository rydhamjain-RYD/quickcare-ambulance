import { endDuty, getPosting, nearestSignals, officerFromRequest, setPosting } from "@/lib/officers";

const inBengaluru = (lat: number, lng: number) => lat >= 12.83 && lat <= 13.1 && lng >= 77.45 && lng <= 77.75;
const fail = (e: unknown) => Response.json({ error: (e as Error).message }, { status: 500 });

/** Signals near a point, so the officer can pick the junction they are posted at today. */
export async function GET(request: Request) {
  try {
    if (!(await officerFromRequest(request))) return Response.json({ error: "Please log in first." }, { status: 401 });
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBengaluru(lat, lng)) {
      return Response.json({ error: "Postings are for junctions in Bengaluru city only." }, { status: 400 });
    }
    return Response.json({ signals: nearestSignals(lat, lng) });
  } catch (e) {
    return fail(e);
  }
}

/** Set today's posting, or end duty with { end: true }. */
export async function POST(request: Request) {
  try {
    const officer = await officerFromRequest(request);
    if (!officer) return Response.json({ error: "Please log in first." }, { status: 401 });

    let body: { lat?: number; lng?: number; label?: string; end?: boolean };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Send JSON." }, { status: 400 });
    }
    if (body.end) {
      await endDuty(officer.badge);
      return Response.json({ posting: null });
    }
    if (typeof body.lat !== "number" || typeof body.lng !== "number" || !body.label?.trim()) {
      return Response.json({ error: "Choose a junction first." }, { status: 400 });
    }
    if (!inBengaluru(body.lat, body.lng)) {
      return Response.json({ error: "Postings are for junctions in Bengaluru city only." }, { status: 400 });
    }
    const r = await setPosting(officer.badge, { lat: body.lat, lng: body.lng, label: body.label.trim() });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ posting: await getPosting(officer.badge) });
  } catch (e) {
    return fail(e);
  }
}
