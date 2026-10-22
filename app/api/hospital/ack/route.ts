import { hospitalCovers, hospitalFromRequest } from "@/lib/hospitalStaff";
import { getTripRaw, setHospitalAck } from "@/lib/trip";

/** The hospital confirms its emergency team is ready for the incoming ambulance. */
export async function POST(request: Request) {
  try {
    const account = await hospitalFromRequest(request);
    if (!account) return Response.json({ error: "Please log in first." }, { status: 401 });

    const t = await getTripRaw();
    if (!t) return Response.json({ error: "No ambulance is on the way." }, { status: 409 });
    if (!hospitalCovers(account, t.hospital.lat, t.hospital.lng)) {
      return Response.json({ error: "This ambulance is not heading to your hospital." }, { status: 403 });
    }
    await setHospitalAck(`${account.staffName}, ${account.hospitalName}`, account.staffRole);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
