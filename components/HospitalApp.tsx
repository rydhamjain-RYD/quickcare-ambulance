"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import BackLink from "./BackLink";
import Lens from "./Lens";
import { TEST_MODE } from "@/lib/testMode";

type Account = {
  id: string; hospitalName: string; address: string; registration: string;
  emergencyDesk: string; staffName: string; staffRole: string;
};
// A hospital is told the time until arrival and nothing that would let it follow the ambulance.
type Incoming = {
  id: string; status: "enroute" | "arrived"; etaMinutes: number;
  note: { raw: string; severity?: string; summary?: string; aiOk: boolean } | null;
  hospitalAck: { by: string; role: string; at: number } | null;
};
type TestAccount = { id: string; pin: string; name: string; current: boolean };
type Call = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOKEN_KEY = "qc_hospital_token";
// sessionStorage keeps the login per browser tab, like the officer login.
const store = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
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

  // Restore a previous login in this tab.
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
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const touched = useRef(false); // true once the tester picks a hospital by hand

  // Test mode only: list every hospital login, and keep the one the ambulance is heading to at the top.
  // The form fills itself in with that hospital unless the tester has already chosen another.
  useEffect(() => {
    if (!TEST_MODE) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/hospital/test-accounts", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const list: TestAccount[] = (await r.json()).accounts;
        setAccounts(list);
        if (!touched.current) {
          const pick = list.find((a) => a.current) ?? list[0];
          if (pick) { setId(pick.id); setPin(pick.pin); }
        }
      } catch { /* leave the form as it is */ }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

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

  const ordered = [...accounts].sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <main className="page narrow">
      <BackLink />
      <h1>Hospital emergency desk login</h1>
      <p className="sub">Log in with your hospital ID and PIN. You are told when an ambulance is heading to your hospital and how long it will take, and you can confirm that your team is ready.</p>
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
      {TEST_MODE && ordered.length > 0 && (
        <div className="testbox">
          <b>Test mode.</b> Every hospital has a login. The hospital the ambulance is heading to is listed first and filled in for you. Pick another to fill the form with theirs.
          <select
            aria-label="Hospital to log in as"
            value={id}
            onChange={(e) => {
              const h = ordered.find((x) => x.id === e.target.value);
              if (h) { touched.current = true; setId(h.id); setPin(h.pin); }
            }}
          >
            {ordered.map((h) => <option key={h.id} value={h.id}>{h.current ? "Ambulance heading here: " : ""}{h.name}</option>)}
          </select>
        </div>
      )}
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
          <p className="muted">Keep this page open. You get an alert and a sound as soon as a driver starts a trip here, with the time until it arrives.</p>
        </div>
      )}

      {trip && (
        <>
          <div className={`banner ${arrived ? "green" : "red"}`} role="alert">
            <Lens color="#fff" pulse={!arrived} />
            <span>
              <b>{arrived ? "The ambulance has arrived." : "An ambulance is on its way to you."}</b>
              {!arrived && <> Prepare your emergency team.</>}
            </span>
          </div>

          <div className="eta">
            <span>
              <b>{arrived ? "Here" : `Within ${trip.etaMinutes} min`}</b>
              <span>{arrived ? "at your door" : "until the ambulance arrives"}</span>
            </span>
          </div>
          <p className="muted">An estimate that includes assumed traffic for this time of day, not live traffic. You are told the time only, not where the ambulance is.</p>

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
        </>
      )}

      <div className="row"><button className="btn ghost" onClick={onSignOut}>Log out</button></div>
    </main>
  );
}
