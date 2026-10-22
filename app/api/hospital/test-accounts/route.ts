import { testAccounts } from "@/lib/hospitalStaff";
import { getTripRaw } from "@/lib/trip";

/** Test mode only: sample hospital logins, with the hospital of the running trip marked. Returns 404 when test mode is off. */
export async function GET() {
  try {
    const list = await testAccounts((await getTripRaw())?.hospital ?? null);
    if (list.length === 0) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ accounts: list });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
