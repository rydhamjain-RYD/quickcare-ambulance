import Link from "next/link";
import Lens from "@/components/Lens";
import { STATUS } from "@/lib/status";

const LEGEND = (["cleared", "heavy", "cannot", "unanswered", "waiting"] as const).map((k) => STATUS[k]);

const Icon = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <h1>Clear roads for ambulances, signal by signal.</h1>
        <p>
          The driver picks a route. Traffic officers at each signal get an alert 800 m ahead and reply. The hospital sees the
          ambulance coming.
        </p>
        <div className="row">
          <Link href="/driver" className="btn on big" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Start as the driver
          </Link>
        </div>
        <div className="legend" aria-label="What the signal colours mean">
          {LEGEND.map((s) => (
            <span key={s.label}>
              <Lens color={s.color} small />
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <div className="roles">
        <Link className="role feature" href="/driver" style={{ color: "#fff" }}>
          <span className="ico" style={{ color: "#fff" }}><Icon d="M3 13l2-6h11l3 4h2v5h-2M7 18a2 2 0 100-4 2 2 0 000 4zm9 0a2 2 0 100-4 2 2 0 000 4zM10 9v3m-1.5-1.5h3" /></span>
          <span>
            <b style={{ color: "#fff" }}>Driver</b>
            <br />
            Set the pickup and hospital, compare the quickest and fewest-signal routes, and see what each officer says.
          </span>
        </Link>
        <Link className="role" href="/officer">
          <span className="ico" style={{ color: "var(--blue)" }}><Icon d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4" /></span>
          <b>Traffic officer</b>
          <span>Log in with your badge, choose today&apos;s junction, and reply when an ambulance is coming.</span>
        </Link>
        <Link className="role" href="/hospital">
          <span className="ico" style={{ color: "var(--blue)" }}><Icon d="M5 21V8l7-5 7 5v13M9 21v-6h6v6M12 8v4m-2-2h4" /></span>
          <b>Hospital</b>
          <span>See the incoming ambulance, its arrival time and the crew&apos;s note about the patient.</span>
        </Link>
      </div>
    </main>
  );
}
