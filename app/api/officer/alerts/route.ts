import { getPosting, officerFromRequest, covers } from "@/lib/officers";
import { view } from "@/lib/trip";

/** What the logged-in officer should see: only alerts for the junction they are posted at today. */
export async function GET(request: Request) {
  const officer = officerFromRequest(request);
  if (!officer) return Response.json({ error: "Please log in again." }, { status: 401 });
  const posting = getPosting(officer.badge);
  if (!posting) return Response.json({ officer, posting: null, alerts: [] });

  const trip = view();
  if (!trip) return Response.json({ officer, posting, trip: null, alerts: [] });
  const alerts = trip.alerts.filter((a) => covers(officer.badge, a.lat, a.lng));
  return Response.json({
    officer,
    posting,
    trip: {
      status: trip.status,
      hospital: trip.hospital.name,
      progressM: trip.progressM,
      baseSpeedMps: trip.baseSpeedMps,
      notice: trip.notice ?? null, // lets the officer see that their report led to a reroute
    },
    alerts,
  });
}
