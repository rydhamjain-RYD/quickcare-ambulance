import { getPosting, logout, officerFromRequest } from "@/lib/officers";

export async function GET(request: Request) {
  try {
    const officer = await officerFromRequest(request);
    if (!officer) return Response.json({ error: "Please log in again." }, { status: 401 });
    return Response.json({ officer, posting: await getPosting(officer.badge) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Log out. */
export async function DELETE(request: Request) {
  try {
    await logout(request);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
