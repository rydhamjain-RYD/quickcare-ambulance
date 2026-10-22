"use client";
import { useState } from "react";

// The demo trip: Jayanagar 4th Block to Manipal Hospital, Old Airport Road (about 12 km, 18 signals).
const FROM = { lat: 12.9265737, lng: 77.5835041 };
const HOSPITAL = { name: "Manipal Hospital, Old Airport Road (demo drop)", lat: 12.959846, lng: 77.649214 };
const NOTE = "bike se gir gaya, sir se khoon, hosh nahi";

async function post(path: string, body: object) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function DemoPage() {
  const [runId, setRunId] = useState(0);
  const [state, setState] = useState<"idle" | "starting" | "running">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraOfficers, setExtraOfficers] = useState(0);

  async function start() {
    setState("starting");
    setError(null);
    try {
      await post("/api/trip", { action: "reset" });
      const routes = await post("/api/routes", { from: FROM, to: HOSPITAL });
      await post("/api/trip", { action: "start", hospital: HOSPITAL, start: FROM, route: routes.options[0], note: { raw: NOTE } });
      await post("/api/trip", { action: "speed", speed: 4 });
      setExtraOfficers(0);
      setRunId((n) => n + 1); // reload the three screens so they join the new trip
      setState("running");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  async function end() {
    await post("/api/trip", { action: "reset" }).catch(() => {});
    setRunId((n) => n + 1);
    setState("idle");
  }

  // Another officer in a separate tab: officer 2, 3, ... at junction 6, 9, ...
  function openAnotherOfficer() {
    const n = extraOfficers + 2;
    window.open(`/officer?demo=${n}&junction=${n * 3}`, "_blank");
    setExtraOfficers((x) => x + 1);
  }

  const running = state === "running";
  return (
    <main className="page wide">
      <h1>Live demo</h1>
      <p className="sub">
        One ambulance trip, shown on all three screens at once. The officer and the hospital sign in by themselves with sample
        accounts. Reply as the officer and watch the driver and the hospital react.
      </p>

      <div className="row">
        <button className="btn go big" onClick={start} disabled={state === "starting"}>
          {state === "starting" ? "Starting…" : running ? "Restart the demo" : "Start the demo"}
        </button>
        {running && <button className="btn" onClick={end}>End the demo</button>}
        {running && <button className="btn" onClick={openAnotherOfficer} disabled={extraOfficers >= 8}>Add another officer in a new tab</button>}
      </div>
      {error && <p className="errbox">{error}</p>}
      {running && (
        <p className="muted">
          Tip: set the demo speed on the driver screen. In the officer screen, tap Heavy traffic at your junction to see the driver
          rerouted and the hospital&apos;s arrival time change.
        </p>
      )}

      <div className="demo-grid">
        <section className="demo-col">
          <h2>Driver <small>route and signals</small></h2>
          {running ? <iframe key={`d${runId}`} className="demo-frame" title="Driver screen" src="/?embed=1" /> : <Empty text="Press Start the demo. The ambulance leaves Jayanagar for Manipal Hospital." />}
        </section>
        <section className="demo-col">
          <h2>Traffic officer <small>Ravi Kumar, junction 3</small></h2>
          {running ? <iframe key={`o${runId}`} className="demo-frame" title="Traffic officer screen" src="/officer?embed=1&demo=1&junction=3" /> : <Empty text="The officer signs in and takes a post at junction 3 on the route." />}
        </section>
        <section className="demo-col">
          <h2>Hospital <small>Manipal emergency desk</small></h2>
          {running ? <iframe key={`h${runId}`} className="demo-frame" title="Hospital screen" src="/hospital?embed=1&demo=1" /> : <Empty text="The hospital desk signs in and sees the ambulance coming." />}
        </section>
      </div>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="demo-empty"><p>{text}</p></div>;
}
