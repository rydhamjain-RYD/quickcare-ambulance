import { getPosting, login } from "@/lib/officers";

export async function POST(request: Request) {
  let body: { badge?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  if (!body.badge?.trim() || !body.pin?.trim()) {
    return Response.json({ error: "Enter your badge ID and PIN." }, { status: 400 });
  }
  try {
    const r = await login(body.badge, body.pin);
    if (!r.ok) return Response.json({ error: r.error }, { status: 401 });
    return Response.json({ token: r.token, officer: r.officer, posting: await getPosting(r.officer.badge) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
