"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Map from "./Map";
import BackLink from "./BackLink";
import Lens from "./Lens";
import { fmtKm, fmtMin } from "@/lib/useTrip";

type Account = {
  id: string; hospitalName: string; address: string; registration: string;
  emergencyDesk: string; staffName: string; staffRole: string;
};
type Incoming = {
  id: string; status: "enroute" | "arrived"; etaS: number; remainingM: number;
  position: [number, number]; start: { lat: number; lng: number }; hospital: { name: string; lat: number; lng: number };
  route: { id: string; coords: [number, number][] };
  note: { raw: string; severity?: string; summary?: string; aiOk: boolean } | null;
  reroutes: number;
  hospitalAck: { by: string; role: string; at: number } | null;
};
type Call = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOKEN_KEY = "qc_hospital_token";
const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};
const SEVERITY_COLOR: Record<string, string> = { critical: "#e5383b", serious: "#f26b1d", stable: "#0e9f6e", unclear: "#64748b" };

/** Two short beeps so staff notice a new incoming ambulance. Best effort: browsers may block sound. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.3].forEach((delay) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.2);
    });
  } catch { /* sound unavailable */ }
}

export default function HospitalApp() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  const signOut = useCallback(() => { store.clear(); setToken(null); setAccount(null); }, []);

  const call: Call = useCallback(
    async (path, init = {}) => {
      const res = await fetch(path, {
        ...init,
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && token) signOut();
      return { ok: res.ok, status: res.status, data };
    },
    [token, signOut],
  );

  useEffect(() => {
    const t = store.get();
    if (!t) { setReady(true); return; }
    fetch("/api/hospital/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => { if (ok) { setToken(t); setAccount(data.account); } else store.clear(); })
      .catch(() => { /* server unreachable: show login */ })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <main className="page narrow"><p>Loading…</p></main>;
  if (!token || !account) return <LoginScreen onLogin={(t, a) => { store.set(t); setToken(t); setAccount(a); }} />;
  return <Dashboard account={account} call={call} onSignOut={async () => { await call("/api/hospital/me", { method: "DELETE" }); signOut(); }} />;
}

function LoginScreen({ onLogin }: { onLogin: (t: string, a: Account) => void }) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    if (!id.trim() || !pin.trim()) { setErr("Enter your hospital ID and PIN."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/hospital/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, pin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not log in");
      onLogin(data.token, data.account);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="page narrow">
      <BackLink />
      <h1>Hospital emergency desk login</h1>
      <p className="sub">Log in with your hospital ID and PIN. You will see ambulances heading to your hospital and can confirm that your team is ready.</p>
      <div className="panel">
        <label className="field">
          Hospital ID
          <input value={id} autoComplete="username" placeholder="e.g. HOSP-MAN-01" onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <label className="field">
          PIN
          <input value={pin} type="password" inputMode="numeric" autoComplete="current-password" placeholder="4-digit PIN" onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {err && <p className="errbox">{err}</p>}
        <button className="btn on big" onClick={submit} disabled={busy} style={{ width: "100%" }}>{busy ? "Checking…" : "Log in"}</button>
      </div>
      <div className="demo-hint">
        <b>Demo accounts.</b> Hospitals are checked against a sample list, not real registrations.
        <br />Manipal Hospital, Old Airport Road: <code>HOSP-MAN-01</code> with PIN <code>5190</code>.
        <br />Rangadore Memorial: <code>HOSP-RNG-01</code> with PIN <code>8264</code>. Bhagwan Mahaveer Jain: <code>HOSP-MJH-01</code> with PIN <code>3377</code>.
      </div>
    </main>
  );
}

function Dashboard({ account, call, onSignOut }: { account: Account; call: Call; onSignOut: () => void }) {
  const [trip, setTrip] = useState<Incoming | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastTrip = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await call("/api/hospital/incoming");
      if (!alive) return;
      if (r.ok) {
        setErr(null);
        const t: Incoming | null = r.data.trip;
        setTrip(t);
        if (t && t.id !== lastTrip.current) beep(); // a new ambulance is heading here
        lastTrip.current = t ? t.id : null;
      } else if (r.status !== 401) setErr(r.data.error ?? "Could not load incoming ambulances. Retrying…");
    };
    load();
    const id = setInterval(load, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [call]);

  // Tab title so staff notice an incoming ambulance from another tab.
  useEffect(() => {
    document.title = trip && trip.status === "enroute" ? "Ambulance incoming | QuickCare" : "QuickCare";
    return () => { document.title = "QuickCare"; };
  }, [trip]);

  async function confirmReady() {
    setBusy(true);
    const r = await call("/api/hospital/ack", { method: "POST" });
    setBusy(false);
    if (!r.ok) setErr(r.data.error ?? "Could not send the confirmation.");
  }

  const arrived = trip?.status === "arrived";
  const arrival = trip ? new Date(Date.now() + trip.etaS * 1000) : null;

  return (
    <main className="page narrow">
      <BackLink />
      <div className="idcard" style={{ alignItems: "flex-start" }}>
        <span className="avatar" aria-hidden>H</span>
        <span>
          <b style={{ fontSize: "1.25rem" }}>{account.hospitalName}</b>
          <small>{account.address}</small>
          <small>Registration {account.registration} · {account.emergencyDesk}</small>
          <small>Logged in: {account.staffName}, {account.staffRole}</small>
          <span className="verified">✓ Verified hospital</span>
        </span>
      </div>
      {err && <p className="errbox">{err}</p>}

      {!trip && (
        <div className="panel">
          <b>No ambulance is heading to your hospital right now.</b>
          <p className="muted">Keep this page open. You will get an alert and a sound as soon as a driver starts a trip here.</p>
        </div>
      )}

      {trip && (
        <>
          <div className={`banner ${arrived ? "green" : "red"}`} role="alert">
            <Lens color="#fff" pulse={!arrived} />
            <span>
              <b>{arrived ? "The ambulance has arrived." : "Ambulance on its way to you."}</b>
              {!arrived && arrival && <> About {arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Prepare your emergency team.</>}
            </span>
          </div>

          <div className="stats">
            <div className="stat"><b>{arrived ? "Here" : fmtMin(trip.etaS)}</b><span>{arrived ? "at your door" : "until arrival"}</span></div>
            <div className="stat"><b>{fmtKm(trip.remainingM)}</b><span>away</span></div>
            <div className="stat"><b>{trip.reroutes}</b><span>route change{trip.reroutes === 1 ? "" : "s"}</span></div>
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
                    <Lens color={SEVERITY_COLOR[trip.note.severity ?? "unclear"] ?? "#64748b"} small />{" "}
                    Severity: <b>{trip.note.severity}</b>. {trip.note.summary}
                  </p>
                ) : (
                  <p className="muted">No AI summary. Read the crew&apos;s note above as written.</p>
                )}
                <p className="muted">The AI summary can be wrong. Check it against the crew&apos;s own words.</p>
              </>
            ) : (
              <p className="muted">The crew did not add a note about the patient.</p>
            )}
          </div>

          {trip.hospitalAck ? (
            <div className="banner green" role="status">
              <Lens color="#fff" />
              <span><b>Your team is marked ready.</b> Confirmed by {trip.hospitalAck.by} at {new Date(trip.hospitalAck.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The driver can see this.</span>
            </div>
          ) : (
            <button className="btn good big" onClick={confirmReady} disabled={busy} style={{ width: "100%" }}>
              Emergency team is ready
            </button>
          )}

          <div style={{ marginTop: 14 }}>
            <Map
              routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#2563eb", selected: true }]}
              ambulance={{ lat: trip.position[1], lng: trip.position[0] }}
              hospital={trip.hospital}
              start={trip.start}
              height={300}
            />
          </div>
        </>
      )}

      <div className="row"><button className="btn ghost" onClick={onSignOut}>Log out</button></div>
    </main>
  );
}
