import { hospitalCovers, hospitalFromRequest, touchHospital } from "@/lib/hospitalStaff";
import { view } from "@/lib/trip";

/**
 * The ambulance heading to the logged-in hospital, if any.
 *
 * A hospital is told how long until the ambulance arrives, in whole minutes, and nothing that would
 * let it follow the ambulance: no position, no route, no distance, no start point. Only the hospital
 * the ambulance is heading to can see the patient note.
 */
export async function GET(request: Request) {
  try {
    const account = await hospitalFromRequest(request);
    if (!account) return Response.json({ error: "Please log in again." }, { status: 401 });

    const [, t] = await Promise.all([touchHospital(account.id), view()]);
    if (!t || !hospitalCovers(account, t.hospital.lat, t.hospital.lng)) return Response.json({ account, trip: null });

    return Response.json({
      account,
      trip: {
        id: t.id,
        status: t.status,
        etaMinutes: Math.max(1, Math.ceil(t.etaS / 60)), // "within N minutes"
        note: t.note ?? null,
        hospitalAck: t.hospitalAck ?? null,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
