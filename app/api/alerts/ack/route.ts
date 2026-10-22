import { covers, officerFromRequest } from "@/lib/officers";
import { HEAVY_REASONS, REASON_LABEL } from "@/lib/status";
import { autoReroute } from "@/lib/reroute";
import { getTripRaw, respond, type HeavyReason } from "@/lib/trip";

export async function POST(request: Request) {
  try {
    const officer = await officerFromRequest(request);
    if (!officer) return Response.json({ error: "Please log in first." }, { status: 401 });

    let body: { signalId?: string; answer?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Send JSON." }, { status: 400 });
    }
    if (!body.signalId || (body.answer !== "clear" && body.answer !== "heavy" && body.answer !== "cannot")) {
      return Response.json({ error: "signalId and answer ('clear', 'heavy' or 'cannot') are required." }, { status: 400 });
    }
    const reason = HEAVY_REASONS.includes(body.reason as HeavyReason) ? (body.reason as HeavyReason) : undefined;

    // Only the officer posted at this junction today can answer for it.
    const alert = (await getTripRaw())?.alerts.find((a) => a.signalId === body.signalId);
    if (alert && !(await covers(officer.badge, alert.lat, alert.lng))) {
      return Response.json({ error: "This junction is not your posting today." }, { status: 403 });
    }

    const r = await respond(body.signalId, body.answer, { name: officer.name, badge: officer.badge }, reason);
    if (!r.ok) return Response.json({ error: r.error }, { status: 409 });

    // Heavy traffic: switch the ambulance to the best alternative route straight away.
    if (body.answer === "heavy") {
      await autoReroute(REASON_LABEL[reason ?? "congestion"], officer.name);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
