import { replaceRoute, resetTrip, setSpeed, SPEEDS, startTrip, view, type Trip } from "@/lib/trip";
import { planRoutes, RoutingError, type RouteOption } from "@/lib/routing";
import { summarizeNote } from "@/lib/summarize";
import { ensureHospitalAccount } from "@/lib/hospitalStaff";

/** The trip as drivers and officers may see it. The patient note is private to the hospital, so it is left out. */
async function publicView() {
  const v = await view();
  if (!v) return null;
  const { note: _note, ...rest } = v; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

const fail = (e: unknown) => Response.json({ error: (e as Error).message }, { status: 500 });

export async function GET() {
  try {
    return Response.json({ trip: await publicView() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    hospital?: Trip["hospital"];
    start?: Trip["start"];
    route?: RouteOption;
    note?: Trip["note"];
    speed?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      if (!body.hospital?.name || !body.start || !body.route?.coords?.length) {
        return Response.json({ error: "A hospital, a start point and a chosen route are needed to start." }, { status: 400 });
      }
      const raw = body.note?.raw?.trim();
      const note = raw ? await summarizeNote(raw.slice(0, 500)) : undefined;
      await startTrip({ hospital: body.hospital, start: body.start, route: body.route, note });
      await ensureHospitalAccount(body.hospital); // test mode: whichever hospital is chosen can be logged in to
      return Response.json({ trip: await publicView() });
    }
    if (body.action === "speed") {
      if (!SPEEDS.includes(body.speed as (typeof SPEEDS)[number])) {
        return Response.json({ error: `Speed must be one of ${SPEEDS.join(", ")}.` }, { status: 400 });
      }
      await setSpeed(body.speed as number);
      return Response.json({ trip: await publicView() });
    }
    if (body.action === "reroute-options") {
      // Plan new routes from where the ambulance is now, steering clear of signals the officer reported.
      const trip = await view();
      if (!trip || trip.status !== "enroute") return Response.json({ error: "No trip is in progress." }, { status: 409 });
      const avoid = trip.alerts
        .filter((a) => (a.status === "heavy" || a.status === "cannot") && a.alongM > trip.progressM)
        .map((a) => ({ lat: a.lat, lng: a.lng }));
      try {
        const result = await planRoutes({ lat: trip.position[1], lng: trip.position[0] }, trip.hospital, { avoid });
        return Response.json({ options: result.options, blocked: !!result.blocked, avoided: avoid.length });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: e instanceof RoutingError ? 502 : 500 });
      }
    }
    if (body.action === "switch-route") {
      if (!body.route?.coords?.length) return Response.json({ error: "No route was chosen." }, { status: 400 });
      if (!(await replaceRoute(body.route))) return Response.json({ error: "No trip is in progress." }, { status: 409 });
      return Response.json({ trip: await publicView() });
    }
    if (body.action === "reset") {
      await resetTrip();
      return Response.json({ trip: null });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
