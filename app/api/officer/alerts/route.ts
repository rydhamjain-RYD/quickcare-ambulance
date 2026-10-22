import { getPosting, officerFromRequest, POSTING_RADIUS_M } from "@/lib/officers";
import { haversine } from "@/lib/geo";
import { view } from "@/lib/trip";

/** What the logged-in officer should see: only alerts for the junction they are posted at today. */
export async function GET(request: Request) {
  try {
    const officer = await officerFromRequest(request);
    if (!officer) return Response.json({ error: "Please log in again." }, { status: 401 });
    const posting = await getPosting(officer.badge);
    if (!posting) return Response.json({ officer, posting: null, alerts: [] });

    const trip = await view();
    if (!trip) return Response.json({ officer, posting, trip: null, alerts: [] });
    // The posting is already loaded, so compare distances here instead of looking it up once per signal.
    const alerts = trip.alerts.filter((a) => haversine([a.lng, a.lat], [posting.lng, posting.lat]) <= POSTING_RADIUS_M);
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
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
