import { hospitalCovers, hospitalFromRequest, touchHospital } from "@/lib/hospitalStaff";
import { view } from "@/lib/trip";

/** The ambulance heading to the logged-in hospital, if any. Only that hospital can see the patient note. */
export async function GET(request: Request) {
  const account = hospitalFromRequest(request);
  if (!account) return Response.json({ error: "Please log in again." }, { status: 401 });
  touchHospital(account.id);

  const t = view();
  if (!t || !hospitalCovers(account, t.hospital.lat, t.hospital.lng)) return Response.json({ account, trip: null });

  return Response.json({
    account,
    trip: {
      id: t.id,
      status: t.status,
      etaS: t.etaS,
      remainingM: t.remainingM,
      position: t.position,
      start: t.start,
      hospital: t.hospital,
      route: { id: t.route.id, coords: t.route.coords },
      note: t.note ?? null,
      reroutes: t.reroutes,
      hospitalAck: t.hospitalAck ?? null,
    },
  });
}
