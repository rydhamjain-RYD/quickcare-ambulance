"use client";
import { useState } from "react";
import BackLink from "./BackLink";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";
import { STATUS } from "@/lib/status";

export default function OfficerView({ signalId }: { signalId: string }) {
  const { trip, loaded, error, setTrip } = useTrip();
  const [msg, setMsg] = useState<string | null>(null);

  async function answer(a: "clear" | "cannot") {
    setMsg(null);
    try {
      const res = await fetch("/api/alerts/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, answer: a }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send your answer");
      setTrip(data.trip);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const alert = trip?.alerts.find((a) => a.signalId === signalId);
  const awayM = alert && trip ? alert.alongM - trip.progressM : 0;
  const passed = !!alert && awayM <= 0;
  const eta = alert && trip ? Math.max(0, awayM) / trip.baseSpeedMps : 0;

  return (
    <main className="page narrow">
      <BackLink href="/officer" label="All junctions" />
      <h1>Traffic officer</h1>
      <p className="muted">Junction {signalId}</p>
      {error && <p className="warn">{error}</p>}
      {!loaded && !error && <p>Loading…</p>}
      {loaded && !trip && <div className="panel">No ambulance is on the way right now.</div>}
      {trip && !alert && <div className="panel">An ambulance is on the way, but not through this junction.</div>}
      {trip && alert && (
        <div className="panel" style={{ borderColor: STATUS[alert.status].color }}>
          {alert.status === "waiting" && (
            <>
              <h2>Ambulance approaching later</h2>
              <p>It is {fmtKm(awayM)} away. You will be alerted at 800 m.</p>
            </>
          )}
          {(alert.status === "alerted" || alert.status === "unanswered") && passed && (
            <>
              <h2>The ambulance has passed your junction</h2>
              <p className="muted">
                {alert.status === "unanswered"
                  ? "No reply was received before it passed. The control room was told."
                  : "No reply was received."}
              </p>
            </>
          )}
          {(alert.status === "alerted" || alert.status === "unanswered") && !passed && (
            <>
              <h2 className="alertTitle">AMBULANCE COMING</h2>
              <p className="big">Ambulance heading <b>{alert.direction}</b> through your junction</p>
              <p className="big">Arrives in about <b>{fmtMin(eta)}</b> ({fmtKm(awayM)} away)</p>
              <p className="muted">Going to {trip.hospital.name}</p>
              {alert.status === "unanswered" && <p className="warn">No answer was received, so the control room has been told. You can still reply.</p>}
              <div className="row">
                <button className="btn big good" onClick={() => answer("clear")}>I will clear it</button>
                <button className="btn big danger" onClick={() => answer("cannot")}>Can&apos;t</button>
              </div>
            </>
          )}
          {alert.status === "cleared" && <h2 style={{ color: STATUS.cleared.color }}>You confirmed: will clear. Thank you.</h2>}
          {alert.status === "cannot" && <h2 style={{ color: STATUS.cannot.color }}>You replied: can&apos;t clear. The crew has been told.</h2>}
          {msg && <p className="warn">{msg}</p>}
        </div>
      )}
    </main>
  );
}
