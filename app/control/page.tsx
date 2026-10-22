"use client";
import { fmtKm, useTrip } from "@/lib/useTrip";
import BackLink from "@/components/BackLink";

export default function ControlPage() {
  const { trip, loaded, error } = useTrip();
  const flagged = trip?.alerts.filter((a) => a.status === "unanswered" || a.status === "cannot" || a.status === "heavy") ?? [];
  return (
    <main className="page narrow">
      <BackLink />
      <h1>Control room</h1>
      <p className="muted">Shows junctions where the officer did not answer in time, reported heavy traffic, or replied that they can&apos;t clear.</p>
      {error && <p className="warn">{error}</p>}
      {loaded && !trip && <div className="panel">No ambulance trip is active.</div>}
      {trip && flagged.length === 0 && <div className="panel">All alerts so far are answered or still within the time limit.</div>}
      {flagged.map((a) => (
        <div key={a.signalId} className="panel" style={{ borderColor: a.status === "cannot" ? "#dc2626" : a.status === "heavy" ? "#ea580c" : "#7c3aed" }}>
          <h2>Junction {a.index}: {a.status === "cannot" ? "officer can't clear" : a.status === "heavy" ? "HEAVY TRAFFIC reported" : "NO ANSWER"}</h2>
          <p>Ambulance heading {a.direction}, {trip && fmtKm(Math.max(0, a.alongM - trip.progressM))} {trip && a.alongM < trip.progressM ? "(already passed)" : "away"}.</p>
          <p className="muted">Going to {trip?.hospital.name}. Send another unit or call the junction.</p>
        </div>
      ))}
    </main>
  );
}
