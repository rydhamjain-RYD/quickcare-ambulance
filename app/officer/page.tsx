"use client";
import Link from "next/link";
import { fmtKm, useTrip } from "@/lib/useTrip";
import { STATUS } from "@/lib/status";

/** Demo helper: in real use each officer would get a link to only their own junction. */
export default function OfficerIndex() {
  const { trip, loaded, error } = useTrip();
  return (
    <main className="page narrow">
      <h1>Officer pages</h1>
      <p className="muted">Demo only. Each junction on the active route has its own page. In real use each officer would receive only their own link.</p>
      {error && <p className="warn">{error}</p>}
      {loaded && !trip && <div className="panel">No trip is active. Start one from the driver page.</div>}
      {trip && (
        <ol className="signals">
          {trip.alerts.map((a) => (
            <li key={a.signalId}>
              <span className="dot" style={{ background: STATUS[a.status].color }}>{a.index}</span>
              <Link href={`/officer/${a.signalId}`}>Junction {a.index} ({fmtKm(a.alongM)} from start)</Link>
              <b style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</b>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
