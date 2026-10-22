import { hospitalCovers, hospitalFromRequest } from "@/lib/hospitalStaff";
import { getTripRaw, setHospitalAck, view } from "@/lib/trip";

/** The hospital confirms its emergency team is ready for the incoming ambulance. */
export async function POST(request: Request) {
  const account = hospitalFromRequest(request);
  if (!account) return Response.json({ error: "Please log in first." }, { status: 401 });

  const t = getTripRaw();
  if (!t) return Response.json({ error: "No ambulance is on the way." }, { status: 409 });
  if (!hospitalCovers(account, t.hospital.lat, t.hospital.lng)) {
    return Response.json({ error: "This ambulance is not heading to your hospital." }, { status: 403 });
  }
  setHospitalAck(`${account.staffName}, ${account.hospitalName}`, account.staffRole);
  return Response.json({ hospitalAck: view()?.hospitalAck ?? null });
}
