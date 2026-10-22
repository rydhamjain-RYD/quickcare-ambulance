"use client";
import Map from "@/components/Map";
import BackLink from "@/components/BackLink";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";

export default function HospitalPage() {
  const { trip, loaded, error } = useTrip();
  const arrival = trip ? new Date(Date.now() + trip.etaS * 1000) : null;
  return (
    <main className="page narrow">
      <BackLink />
      <h1>Hospital: incoming ambulance</h1>
      {error && <p className="warn">{error}</p>}
      {loaded && !trip && <div className="panel">No ambulance is heading here right now.</div>}
      {trip && (
        <>
          <div className="panel" style={{ borderColor: trip.status === "arrived" ? "#16a34a" : "#dc2626" }}>
            <h2>{trip.status === "arrived" ? "AMBULANCE HAS ARRIVED" : "AMBULANCE EN ROUTE"} to {trip.hospital.name}</h2>
            {trip.status === "enroute" && arrival && (
              <p className="big">Arriving in <b>{fmtMin(trip.etaS)}</b> (about {arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}), {fmtKm(trip.remainingM)} away</p>
            )}
            <p className="muted">Arrival time uses normal road speeds, not live traffic.</p>
          </div>
          <div className="panel">
            <h2>Patient note from the crew</h2>
            {trip.note ? (
              <>
                <p><b>Crew wrote:</b> {trip.note.raw}</p>
                {trip.note.aiOk ? (
                  <p><span className="tag">AI</span> Severity: <b>{trip.note.severity}</b>. {trip.note.summary}</p>
                ) : (
                  <p className="muted">No AI summary. Read the crew&apos;s note above as written.</p>
                )}
              </>
            ) : (
              <p className="muted">The crew did not add a note about the patient.</p>
            )}
          </div>
          <Map
            routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#2563eb", selected: true }]}
            ambulance={{ lat: trip.position[1], lng: trip.position[0] }}
            hospital={trip.hospital}
            start={trip.start}
            height={320}
          />
        </>
      )}
    </main>
  );
}
