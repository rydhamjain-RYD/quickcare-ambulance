import { loginHospital } from "@/lib/hospitalStaff";

export async function POST(request: Request) {
  let body: { id?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  if (!body.id?.trim() || !body.pin?.trim()) {
    return Response.json({ error: "Enter your hospital ID and PIN." }, { status: 400 });
  }
  try {
    const r = await loginHospital(body.id, body.pin);
    if (!r.ok) return Response.json({ error: r.error }, { status: 401 });
    return Response.json({ token: r.token, account: r.account });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
