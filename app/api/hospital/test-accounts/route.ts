import { testAccounts } from "@/lib/hospitalStaff";
import { getTripRaw } from "@/lib/trip";

/** Test mode only: sample hospital logins, with the hospital of the running trip marked. Returns 404 when test mode is off. */
export async function GET() {
  const list = testAccounts(getTripRaw()?.hospital ?? null);
  if (list.length === 0) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ accounts: list });
}
