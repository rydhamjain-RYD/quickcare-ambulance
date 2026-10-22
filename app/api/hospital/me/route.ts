import { hospitalFromRequest, logoutHospital } from "@/lib/hospitalStaff";

export async function GET(request: Request) {
  try {
    const account = await hospitalFromRequest(request);
    if (!account) return Response.json({ error: "Please log in again." }, { status: 401 });
    return Response.json({ account });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Log out. */
export async function DELETE(request: Request) {
  try {
    await logoutHospital(request);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
