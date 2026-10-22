import Link from "next/link";

export default function Home() {
  return (
    <main className="page narrow">
      <h1>QuickCare</h1>
      <p>Routing for ambulances that warns the traffic officer at each signal and the hospital before the ambulance arrives.</p>
      <p className="muted">Open each screen in its own browser tab or phone to see the demo.</p>
      <div className="cards stack">
        <Link className="card" href="/driver"><b>Driver</b><span>Enter the hospital, pick a route, start the trip</span></Link>
        <Link className="card" href="/officer"><b>Traffic officer</b><span>Receives the alert and taps &quot;I will clear it&quot; or &quot;Can&apos;t&quot;</span></Link>
        <Link className="card" href="/control"><b>Control room</b><span>Sees alerts nobody answered</span></Link>
        <Link className="card" href="/hospital"><b>Hospital</b><span>Sees the incoming ambulance and arrival time</span></Link>
      </div>
    </main>
  );
}
