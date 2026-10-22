import { respond, view } from "@/lib/trip";

export async function POST(request: Request) {
  let body: { signalId?: string; answer?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  if (!body.signalId || (body.answer !== "clear" && body.answer !== "heavy" && body.answer !== "cannot")) {
    return Response.json({ error: "signalId and answer ('clear', 'heavy' or 'cannot') are required." }, { status: 400 });
  }
  const r = respond(body.signalId, body.answer);
  if (!r.ok) return Response.json({ error: r.error }, { status: 409 });
  return Response.json({ trip: view() });
}
