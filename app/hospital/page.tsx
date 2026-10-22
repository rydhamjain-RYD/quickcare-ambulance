"use client";
import Map from "@/components/Map";
import BackLink from "@/components/BackLink";
import Lens from "@/components/Lens";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";

const SEVERITY_COLOR: Record<string, string> = { critical: "#e5383b", serious: "#f26b1d", stable: "#0e9f6e", unclear: "#64748b" };

export default function HospitalPage() {
  const { trip, loaded, error } = useTrip();
  const arrived = trip?.status === "arrived";
  const arrival = trip ? new Date(Date.now() + trip.etaS * 1000) : null;

  return (
    <main className="page narrow">
      <BackLink />
      <h1>Incoming ambulance</h1>
      {error && <p className="errbox">{error}</p>}
      {!loaded && !error && <p>Loading…</p>}
      {loaded && !trip && (
        <div className="panel">
          <b>No ambulance is heading here right now.</b>
          <p className="muted">When a driver starts a trip to this hospital, it appears here with the arrival time and the crew&apos;s note.</p>
        </div>
      )}

      {trip && (
        <>
          <div className="banner" style={{ background: arrived ? "var(--green)" : "var(--ink)" }}>
            <Lens color={arrived ? "#fff" : "#ff6b6e"} pulse={!arrived} />
            <span>
              <b>{arrived ? "The ambulance has arrived" : "Ambulance on the way"}</b> to {trip.hospital.name}.
              {!arrived && arrival && (
                <>
                  {" "}Arriving in <b>{fmtMin(trip.etaS)}</b> (about {arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}), {fmtKm(trip.remainingM)} away.
                </>
              )}
            </span>
          </div>
          <p className="muted">Arrival time uses normal road speeds, not live traffic.</p>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Note from the crew</h2>
            {trip.note ? (
              <>
                <p><b>Crew wrote:</b> {trip.note.raw}</p>
                {trip.note.aiOk ? (
                  <p>
                    <span className="tag">AI</span>
                    <span className="lens sm" style={{ ["--c" as string]: SEVERITY_COLOR[trip.note.severity ?? "unclear"] ?? "#64748b", marginRight: 6, verticalAlign: "middle" }} />
                    Severity: <b>{trip.note.severity}</b>. {trip.note.summary}
                  </p>
                ) : (
                  <p className="muted">No AI summary. Read the crew&apos;s note above as written.</p>
                )}
              </>
            ) : (
              <p className="muted">The crew did not add a note about the patient.</p>
            )}
          </div>

          <Map
            routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#1b3a8c", selected: true }]}
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
