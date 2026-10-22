import { resetTrip, setSpeed, SPEEDS, startTrip, view, type Trip } from "@/lib/trip";
import type { RouteOption } from "@/lib/routing";

export async function GET() {
  return Response.json({ trip: view() });
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

  if (body.action === "start") {
    if (!body.hospital?.name || !body.start || !body.route?.coords?.length) {
      return Response.json({ error: "A hospital, a start point and a chosen route are needed to start." }, { status: 400 });
    }
    startTrip({ hospital: body.hospital, start: body.start, route: body.route, note: body.note });
    return Response.json({ trip: view() });
  }
  if (body.action === "speed") {
    if (!SPEEDS.includes(body.speed as (typeof SPEEDS)[number])) {
      return Response.json({ error: `Speed must be one of ${SPEEDS.join(", ")}.` }, { status: 400 });
    }
    setSpeed(body.speed as number);
    return Response.json({ trip: view() });
  }
  if (body.action === "reset") {
    resetTrip();
    return Response.json({ trip: null });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
