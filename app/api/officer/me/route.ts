import { getPosting, logout, officerFromRequest } from "@/lib/officers";

export async function GET(request: Request) {
  const officer = officerFromRequest(request);
  if (!officer) return Response.json({ error: "Please log in again." }, { status: 401 });
  return Response.json({ officer, posting: getPosting(officer.badge) });
}

/** Log out. */
export async function DELETE(request: Request) {
  logout(request);
  return Response.json({ ok: true });
}
