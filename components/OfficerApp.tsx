"use client";
import { useCallback, useEffect, useState } from "react";
import Map from "./Map";
import BackLink from "./BackLink";
import Lens from "./Lens";
import SearchBox from "./SearchBox";
import { fmtKm, fmtMin } from "@/lib/useTrip";
import { HEAVY_REASONS, REASON_LABEL, STATUS, type HeavyReason } from "@/lib/status";
import type { OfficerAnswer, ViewAlert } from "@/lib/trip";
import { TEST_MODE, TEST_OFFICERS } from "@/lib/testMode";

type Officer = { badge: string; name: string; rank: string; station: string };
type Posting = { lat: number; lng: number; label: string; since: number; date: string };
type AlertsData = {
  trip: { status: string; hospital: string; progressM: number; baseSpeedMps: number; notice: { text: string; at: number } | null } | null;
  alerts: ViewAlert[];
};
type Spot = { lat: number; lng: number; distanceM: number };

const TOKEN_KEY = "qc_officer_token";
// sessionStorage keeps the login per browser tab, so several people can act as different officers in different tabs.
const store = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};
const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function OfficerApp() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [posting, setPosting] = useState<Posting | null>(null);
  const [changing, setChanging] = useState(false);

  const signOut = useCallback(() => {
    store.clear();
    setToken(null);
    setOfficer(null);
    setPosting(null);
    setChanging(false);
  }, []);

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
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
    fetch("/api/officer/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (ok) { setToken(t); setOfficer(data.officer); setPosting(data.posting); }
        else store.clear();
      })
      .catch(() => { /* server unreachable: show login */ })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <main className="page narrow"><p>Loading…</p></main>;

  if (!token || !officer) {
    return (
      <LoginScreen
        onLogin={(t, o, p) => { store.set(t); setToken(t); setOfficer(o); setPosting(p); }}
      />
    );
  }

  if (!posting || changing) {
    return (
      <PostingScreen
        officer={officer}
        call={call}
        canCancel={!!posting}
        onCancel={() => setChanging(false)}
        onPosted={(p) => { setPosting(p); setChanging(false); }}
        onSignOut={async () => { await call("/api/officer/me", { method: "DELETE" }); signOut(); }}
      />
    );
  }

  return (
    <Dashboard
      officer={officer}
      posting={posting}
      call={call}
      onChange={() => setChanging(true)}
      onEndDuty={async () => { await call("/api/officer/posting", { method: "POST", body: JSON.stringify({ end: true }) }); setPosting(null); }}
      onSignOut={async () => { await call("/api/officer/me", { method: "DELETE" }); signOut(); }}
    />
  );
}

type Call = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

function LoginScreen({ onLogin }: { onLogin: (t: string, o: Officer, p: Posting | null) => void }) {
  // In test mode the form opens already filled in with a sample officer.
  const [badge, setBadge] = useState(TEST_MODE ? TEST_OFFICERS[0].badge : "");
  const [pin, setPin] = useState(TEST_MODE ? TEST_OFFICERS[0].pin : "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    if (!badge.trim() || !pin.trim()) { setErr("Enter your badge ID and PIN."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/officer/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badge, pin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not log in");
      onLogin(data.token, data.officer, data.posting);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <BackLink />
      <h1>Traffic officer login</h1>
      <p className="sub">Log in with your police badge ID and PIN. Only verified officers can reply to ambulance alerts.</p>
      <div className="panel">
        <label className="field">
          Badge ID
          <input value={badge} autoComplete="username" placeholder="e.g. BLR-TP-1001" onChange={(e) => setBadge(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <label className="field">
          PIN
          <input value={pin} type="password" inputMode="numeric" autoComplete="current-password" placeholder="4-digit PIN" onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {err && <p className="errbox">{err}</p>}
        <button className="btn on big" onClick={submit} disabled={busy} style={{ width: "100%" }}>{busy ? "Checking…" : "Log in"}</button>
      </div>
      {TEST_MODE && (
        <div className="testbox">
          <b>Test mode.</b> The form is filled in for you. Pick another sample officer to fill it with theirs. Each browser tab keeps its own login.
          <select
            aria-label="Sample officer"
            value={badge}
            onChange={(e) => {
              const o = TEST_OFFICERS.find((x) => x.badge === e.target.value);
              if (o) { setBadge(o.badge); setPin(o.pin); }
            }}
          >
            {TEST_OFFICERS.map((o) => <option key={o.badge} value={o.badge}>{o.name} · {o.badge}</option>)}
          </select>
        </div>
      )}
    </main>
  );
}

function PostingScreen({
  officer, call, canCancel, onCancel, onPosted, onSignOut,
}: {
  officer: Officer; call: Call; canCancel: boolean; onCancel: () => void; onPosted: (p: Posting) => void; onSignOut: () => void;
}) {
  const [area, setArea] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testJunctions, setTestJunctions] = useState<{ index: number; lat: number; lng: number; alongM: number; taken?: string }[]>([]);

  // Test mode only: junctions on the ambulance route that is running right now, and who already holds each one.
  useEffect(() => {
    if (!TEST_MODE) return;
    let alive = true;
    const load = () =>
      fetch("/api/trip", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setTestJunctions(d.trip ? d.trip.alerts.map((a: ViewAlert) => ({ index: a.index, lat: a.lat, lng: a.lng, alongM: a.alongM, taken: a.onDuty?.name })) : []);
        })
        .catch(() => { if (alive) setTestJunctions([]); });
    load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function loadSpots(a: { name: string; lat: number; lng: number }) {
    setArea(a); setMsg(null); setSpots([]); setBusy(true);
    const r = await call(`/api/officer/posting?lat=${a.lat}&lng=${a.lng}`);
    setBusy(false);
    if (!r.ok) { setSpots([]); setMsg(r.data.error ?? "Could not find signals here."); return; }
    setSpots(r.data.signals);
    if (r.data.signals.length === 0) setMsg("No traffic signals within 400 m of this place. Search a nearby junction.");
  }

  function useGps() {
    setMsg(null);
    if (!navigator.geolocation) { setMsg("This browser cannot share your location. Search for the junction instead."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); loadSpots({ name: "My current location", lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => { setBusy(false); setMsg(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Search for the junction instead." : "Could not get your location. Search for the junction instead."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function post(lat: number, lng: number, label: string) {
    setBusy(true); setMsg(null);
    const r = await call("/api/officer/posting", { method: "POST", body: JSON.stringify({ lat, lng, label }) });
    setBusy(false);
    if (!r.ok) { setMsg(r.data.error ?? "Could not set your posting."); return; }
    onPosted(r.data.posting);
  }

  return (
    <main className="page narrow">
      <BackLink />
      <IdCard officer={officer} />
      <h1>Where are you posted today?</h1>
      <p className="sub">Choose your junction anywhere in Bengaluru. Change it any time your shift moves to another post.</p>

      <div className="field">
        Junction or area
        <SearchBox kind="place" placeholder="Start typing, e.g. Silk Board Junction" onPick={(p) => loadSpots({ name: p.name.split(",")[0], lat: p.lat, lng: p.lng })} />
      </div>
      <button className="btn sm" onClick={useGps} disabled={busy}>Use my location</button>
      {msg && <p className="warn">{msg}</p>}

      {area && spots.length > 0 && (
        <>
          <h2>Signals near {area.name}</h2>
          <Map
            signals={spots.map((s, i) => ({ id: `${s.lat},${s.lng}`, lat: s.lat, lng: s.lng, label: String(i + 1), color: "#2563eb" }))}
            start={{ lat: area.lat, lng: area.lng }}
            height={260}
          />
          <ul className="places" style={{ marginTop: 12 }}>
            {spots.map((s, i) => (
              <li key={`${s.lat},${s.lng}`}>
                <button className="place" disabled={busy} onClick={() => post(s.lat, s.lng, `Signal ${i + 1}, ${s.distanceM} m from ${area.name}`)}>
                  Signal {i + 1}: {s.distanceM} m from {area.name}. Post me here
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {TEST_MODE && testJunctions.length > 0 && (
        <div className="testbox">
          <b>Test mode.</b> An ambulance trip is running. Pick a junction on its route to receive its alert.
          Junctions that already have an officer are greyed out, so spread out and cover different ones.
          <div className="reasons">
            {testJunctions.map((j) => (
              <button key={j.index} className="chip" style={j.taken ? { borderColor: "var(--line)", color: "var(--muted)", background: "var(--bg)" } : { borderColor: "var(--primary)", color: "var(--ink)" }} disabled={busy}
                onClick={() => post(j.lat, j.lng, `Junction ${j.index} on the route`)}>
                Junction {j.index} ({fmtKm(j.alongM)}){j.taken ? ` · ${j.taken.split(" ")[0]}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        {canCancel && <button className="btn" onClick={onCancel}>Keep my current posting</button>}
        <button className="btn ghost" onClick={onSignOut}>Log out</button>
      </div>
    </main>
  );
}

function IdCard({ officer }: { officer: Officer }) {
  return (
    <div className="idcard">
      <span className="avatar" aria-hidden>{initials(officer.name)}</span>
      <span>
        <b>{officer.name}</b>
        <small>{officer.rank} · {officer.station}</small>
        <small>Badge {officer.badge}</small>
        <span className="verified">✓ Verified officer</span>
      </span>
    </div>
  );
}

function Dashboard({
  officer, posting, call, onChange, onEndDuty, onSignOut,
}: {
  officer: Officer; posting: Posting; call: Call; onChange: () => void; onEndDuty: () => void; onSignOut: () => void;
}) {
  const [data, setData] = useState<AlertsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [askReason, setAskReason] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await call("/api/officer/alerts");
      if (!alive) return;
      if (r.ok) { setData(r.data); setErr(null); }
      else if (r.status !== 401) setErr(r.data.error ?? "Could not load alerts. Retrying…");
    };
    load();
    const id = setInterval(load, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [call]);

  async function answer(a: OfficerAnswer, signalId: string, reason?: HeavyReason) {
    setErr(null);
    const r = await call("/api/alerts/ack", { method: "POST", body: JSON.stringify({ signalId, answer: a, reason }) });
    if (!r.ok) { setErr(r.data.error ?? "Could not send your reply."); return; }
    setAskReason(false);
  }

  const trip = data?.trip ?? null;
  const alerts = data?.alerts ?? [];
  const distOf = (a: ViewAlert) => (trip ? a.alongM - trip.progressM : 0);
  const live = alerts.filter((a) => a.status !== "waiting" && distOf(a) > 0).sort((x, y) => distOf(x) - distOf(y))[0];
  const upcoming = alerts.filter((a) => a.status === "waiting" && distOf(a) > 0).sort((x, y) => distOf(x) - distOf(y))[0];
  const passed = alerts.filter((a) => distOf(a) <= 0).sort((x, y) => distOf(y) - distOf(x))[0];
  const answered = live && ["cleared", "heavy", "cannot"].includes(live.status);

  return (
    <main className="page narrow">
      <BackLink />
      <IdCard officer={officer} />
      <div className="post">
        <span>
          <small className="muted">Today&apos;s posting</small>
          <br />
          <b>{posting.label}</b>
        </span>
        <span className="row" style={{ margin: 0 }}>
          <button className="btn" onClick={onChange}>Change posting</button>
          <button className="btn" onClick={onEndDuty}>End duty</button>
        </span>
      </div>
      {err && <p className="errbox">{err}</p>}

      {!trip && <div className="panel"><b>No ambulance is on the way.</b><p className="muted">Keep this page open. An alert appears here when an ambulance is heading through your junction.</p></div>}
      {trip && alerts.length === 0 && trip.notice && trip.notice.text.includes(officer.name) && (
        <div className="banner green" role="status">
          <Lens color="#fff" />
          <span><b>Your report was received.</b> The ambulance was rerouted around your junction, so it will not come through here. Thank you.</span>
        </div>
      )}
      {trip && alerts.length === 0 && !(trip.notice && trip.notice.text.includes(officer.name)) && <div className="panel"><b>An ambulance is on the way, but not through your junction.</b></div>}

      {live && trip && (
        <div className="alertbox" style={{ borderColor: STATUS[live.status].color }}>
          <h2>Ambulance coming</h2>
          <p className="big">Heading <b>{live.direction}</b> through your junction{live.name ? <> (<b>{live.name}</b>)</> : ""}. Arrives in about <b>{fmtMin(distOf(live) / trip.baseSpeedMps)}</b> ({fmtKm(distOf(live))} away).</p>
          <p className="muted">Taking a patient to {trip.hospital}.</p>
          {answered && (
            <p className="current" style={{ borderColor: STATUS[live.status].color, color: STATUS[live.status].color }}>
              <Lens color={STATUS[live.status].color} small /> Your reply: <b>{STATUS[live.status].label}</b>
              {live.status === "heavy" && live.reason ? ` (${REASON_LABEL[live.reason]})` : ""}. The crew can see it. Change it if traffic changes.
            </p>
          )}
          {!askReason ? (
            <div className="row">
              <button className={`btn big good${live.status === "cleared" ? " picked" : ""}`} onClick={() => answer("clear", live.signalId)}>Route is clear</button>
              <button className={`btn big warnbtn${live.status === "heavy" ? " picked" : ""}`} onClick={() => setAskReason(true)}>Heavy traffic</button>
              <button className={`btn big danger${live.status === "cannot" ? " picked" : ""}`} onClick={() => answer("cannot", live.signalId)}>Can&apos;t clear</button>
            </div>
          ) : (
            <>
              <p><b>What is causing it?</b></p>
              <div className="reasons">
                {HEAVY_REASONS.map((r) => (
                  <button key={r} className="chip" onClick={() => answer("heavy", live.signalId, r)}>{REASON_LABEL[r]}</button>
                ))}
              </div>
              <button className="btn ghost" onClick={() => setAskReason(false)}>Back</button>
            </>
          )}
        </div>
      )}

      {!live && upcoming && trip && (
        <div className="panel">
          <b>Ambulance approaching later.</b>
          <p className="muted">It is {fmtKm(distOf(upcoming))} from your junction. You will be alerted at 800 m.</p>
        </div>
      )}
      {!live && !upcoming && passed && (
        <div className="panel">
          <b>The ambulance has passed your junction.</b>
          <p className="muted">{passed.answeredBy ? `Your reply was: ${STATUS[passed.status].label}.` : "No reply was recorded."}</p>
        </div>
      )}

      <div className="row"><button className="btn ghost" onClick={onSignOut}>Log out</button></div>
    </main>
  );
}
