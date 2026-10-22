"use client";
import { useState } from "react";
import BackLink from "./BackLink";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";
import { STATUS } from "@/lib/status";
import type { AlertStatus, OfficerAnswer } from "@/lib/trip";

const ANSWERS: { answer: OfficerAnswer; label: string; status: AlertStatus; cls: string }[] = [
  { answer: "clear", label: "Route is clear", status: "cleared", cls: "good" },
  { answer: "heavy", label: "Heavy traffic", status: "heavy", cls: "warnbtn" },
  { answer: "cannot", label: "Can't clear", status: "cannot", cls: "danger" },
];

export default function OfficerView({ signalId }: { signalId: string }) {
  const { trip, loaded, error, setTrip } = useTrip();
  const [msg, setMsg] = useState<string | null>(null);

  async function answer(a: OfficerAnswer) {
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
  const answered = alert && ["cleared", "heavy", "cannot"].includes(alert.status);

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

          {alert.status !== "waiting" && passed && (
            <>
              <h2>The ambulance has passed your junction</h2>
              <p className="muted">
                {answered
                  ? `Your reply was: ${STATUS[alert.status].label}.`
                  : "No reply was received before it passed. The control room was told."}
              </p>
            </>
          )}

          {alert.status !== "waiting" && !passed && (
            <>
              <h2 className="alertTitle">AMBULANCE COMING</h2>
              <p className="big">Ambulance heading <b>{alert.direction}</b> through your junction</p>
              <p className="big">Arrives in about <b>{fmtMin(eta)}</b> ({fmtKm(awayM)} away)</p>
              <p className="muted">Going to {trip.hospital.name}</p>
              {alert.status === "unanswered" && <p className="warn">No answer was received, so the control room has been told. You can still reply.</p>}
              {answered && (
                <p className="current" style={{ borderColor: STATUS[alert.status].color, color: STATUS[alert.status].color }}>
                  Your reply: <b>{STATUS[alert.status].label}</b>. The ambulance crew can see this. You can change it if traffic changes.
                </p>
              )}
              <div className="row">
                {ANSWERS.map((o) => (
                  <button key={o.answer} className={`btn big ${o.cls}${alert.status === o.status ? " picked" : ""}`} onClick={() => answer(o.answer)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {msg && <p className="warn">{msg}</p>}
        </div>
      )}
    </main>
  );
}
