import { hospitalFromRequest, logoutHospital } from "@/lib/hospitalStaff";

export async function GET(request: Request) {
  const account = hospitalFromRequest(request);
  if (!account) return Response.json({ error: "Please log in again." }, { status: 401 });
  return Response.json({ account });
}

/** Log out. */
export async function DELETE(request: Request) {
  logoutHospital(request);
  return Response.json({ ok: true });
}
