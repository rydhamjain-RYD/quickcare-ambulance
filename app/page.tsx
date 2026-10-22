"use client";
import { useState } from "react";
import Map from "@/components/Map";
import Lens from "@/components/Lens";
import SearchBox from "@/components/SearchBox";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";
import { REASON_LABEL, STATUS } from "@/lib/status";
import type { RouteOption } from "@/lib/routing";
import type { AlertStatus, TripView, ViewAlert } from "@/lib/trip";

type Place = { id: string; name: string; lat: number; lng: number; source: string };
type Pickup = { name: string; lat: number; lng: number };
type RerouteState = { loading: boolean; options: RouteOption[] | null; blocked: boolean; error: string | null };

// Signal data and routing in this demo cover Bengaluru only.
const inBengaluru = (lat: number, lng: number) => lat >= 12.83 && lat <= 13.1 && lng >= 77.45 && lng <= 77.75;

const ROUTE_COLORS = ["#1456f0", "#f06a1a"];

// Demo trip: an example pickup in Jayanagar to Manipal Hospital on Old Airport Road (about 12 km, 18 signals).
const DEMO_PICKUP: Pickup = { name: "Jayanagar 4th Block (demo pickup)", lat: 12.9265737, lng: 77.5835041 };
const DEMO_HOSPITAL: Place = { id: "manipal-old-airport", name: "Manipal Hospital, Old Airport Road (demo drop)", lat: 12.959846, lng: 77.649214, source: "saved" };

const BANNER_CLASS: Record<AlertStatus, string> = {
  waiting: "gray", alerted: "amber", cleared: "green", heavy: "orange", cannot: "red", unanswered: "violet",
};

/**
 * What the crew should do, from what the officer at the signal has said.
 * With no reply, or no officer posted, the ambulance simply stays on its route. Only a heavy-traffic report changes it.
 */
function advice(a: ViewAlert): string {
  if (a.status === "cleared") return "Officer says the route is clear. Proceed.";
  if (a.status === "heavy") return `Heavy traffic${a.reason ? `: ${REASON_LABEL[a.reason].toLowerCase()}` : ""}. Expect a delay and slow down.`;
  if (a.status === "cannot") return "Officer can't clear this signal. Take extra care.";
  if (!a.onDuty) return "No officer is posted here. Stay on this route and drive with caution.";
  if (a.status === "unanswered") return "No reply from the officer. Stay on this route and drive with caution.";
  if (a.status === "alerted") return "Officer alerted, waiting for a reply. Keep your siren on.";
  return "The officer will be alerted at 800 m.";
}

export default function RoutePlannerPage() {
  const { trip, loaded, error, setTrip } = useTrip();
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [pMsg, setPMsg] = useState<string | null>(null);
  const [hospital, setHospital] = useState<Place | null>(null);
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reroute, setReroute] = useState<RerouteState | null>(null);

  const start = pickup;

  function choosePickup(p: Pickup) {
    setPickup(p);
    setPMsg(null);
    setOptions(null);
    // If a hospital is already chosen, plan the new route straight away.
    if (hospital) findRoutes(hospital, p);
  }

  function useCurrentLocation() {
    setPMsg(null);
    if (!navigator.geolocation) {
      setPMsg("This browser cannot share your location. Type the pickup address instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!inBengaluru(lat, lng)) {
          setPMsg("Your location is outside Bengaluru, where this demo has signal data. Type a Bengaluru address instead.");
          return;
        }
        choosePickup({ name: "My current location", lat, lng });
      },
      (err) => {
        setBusy(false);
        setPMsg(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in the browser, or type the pickup address."
            : "Could not get your location. Type the pickup address instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function findRoutes(h: Place, from: Pickup | null = start) {
    setHospital(h);
    setMsg(null);
    setOptions(null);
    if (!from) {
      setMsg("Set the pickup location first, above.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: { lat: from.lat, lng: from.lng }, to: { lat: h.lat, lng: h.lng } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Routing failed");
      setOptions(data.options);
      setChosen(data.options[0].id);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startTrip() {
    const route = options?.find((o) => o.id === chosen);
    if (!route || !hospital || !start) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          hospital: { name: hospital.name, lat: hospital.lat, lng: hospital.lng },
          start: { lat: start.lat, lng: start.lng },
          route,
          note: note.trim() ? { raw: note.trim(), aiOk: false } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the trip");
      setDismissed([]);
      setTrip(data.trip);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function post(body: object) {
    const res = await fetch("/api/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setTrip(data.trip);
  }

  async function findAnotherRoute() {
    setReroute({ loading: true, options: null, blocked: false, error: null });
    try {
      const res = await fetch("/api/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reroute-options" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not find another route");
      setReroute({ loading: false, options: data.options, blocked: data.blocked, error: null });
    } catch (e) {
      setReroute({ loading: false, options: null, blocked: false, error: (e as Error).message });
    }
  }

  async function takeRoute(route: RouteOption) {
    const res = await fetch("/api/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch-route", route }) });
    const data = await res.json();
    if (res.ok) {
      setTrip(data.trip);
      setReroute(null);
    } else {
      setReroute((r) => (r ? { ...r, error: data.error ?? "Could not switch route" } : r));
    }
  }

  if (!loaded && !error) return <main className="page"><p>Loading…</p></main>;

  // ---------- Trip in progress ----------
  if (trip) return <TripScreen trip={trip} error={error} dismissed={dismissed} setDismissed={setDismissed} reroute={reroute} setReroute={setReroute} findAnotherRoute={findAnotherRoute} takeRoute={takeRoute} post={post} />;

  // ---------- Planning ----------
  const sel = options?.find((o) => o.id === chosen);
  const hospitalLocked = !!hospital && (!!options || !!msg);
  return (
    <div className="stage">
      <div className="stage-map">
        <Map
          routes={(options ?? []).map((o, i) => ({ id: o.id, coords: o.coords, color: ROUTE_COLORS[i % 2], selected: o.id === chosen }))}
          signals={(sel?.signals ?? []).map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: String(i + 1), color: STATUS.waiting.color }))}
          hospital={hospital ?? undefined}
          start={start ?? undefined}
          height="100%"
        />
      </div>

      <div className="sheet">
        <h1>Where to?</h1>
        <p className="sub">
          Enter the pickup and the hospital to get the route and every signal on it.{" "}
          <button
            className="btn link"
            disabled={busy}
            onClick={() => {
              setPickup(DEMO_PICKUP);
              setPMsg(null);
              findRoutes(DEMO_HOSPITAL, DEMO_PICKUP);
            }}
          >
            Try a demo trip
          </button>
        </p>
        {error && <p className="errbox">{error}</p>}

        {pickup ? (
          <div className="chosen">
            <span><small>Pickup</small>{pickup.name}</span>
            <button className="btn sm" onClick={() => { setPickup(null); setOptions(null); }}>Change</button>
          </div>
        ) : (
          <>
            <div className="field">
              Patient pickup location
              <SearchBox kind="place" placeholder="Start typing an address or landmark" onPick={(p) => choosePickup({ name: p.name, lat: p.lat, lng: p.lng })} />
            </div>
            <button className="btn sm" onClick={useCurrentLocation} disabled={busy}>Use my current location</button>
            {pMsg && <p className="warn">{pMsg}</p>}
          </>
        )}

        {hospitalLocked && hospital ? (
          <div className="chosen">
            <span><small>Hospital</small>{hospital.name}</span>
            <button className="btn sm" onClick={() => { setHospital(null); setOptions(null); setMsg(null); }}>Change</button>
          </div>
        ) : (
          <div className="field">
            Hospital the family chose
            <SearchBox kind="hospital" placeholder="Start typing, e.g. Manipal, Mahaveer, Rangadore" onPick={(p) => findRoutes(p)} />
          </div>
        )}
        {busy && <p className="muted">Working…</p>}
        {msg && <p className="warn">{msg}</p>}

        {options && hospital && (
          <>
            <h2>Choose a route</h2>
            <div className="cards">
              {options.map((o) => (
                <button key={o.id} className={chosen === o.id ? "card on" : "card"} onClick={() => setChosen(o.id)}>
                  <b>{o.labels.map((l) => (l === "quickest" ? "Quickest" : "Fewest signals")).join(" and ")}</b>
                  <span className="time">{fmtMin(o.durationS)}</span>
                  <span>{fmtKm(o.distanceM)} · {o.signals.length} signals</span>
                </button>
              ))}
            </div>
            {options.length === 1 && <p className="muted">The quickest route is also the one with the fewest signals.</p>}
            <p className="muted">Times use normal road speeds, not live traffic.</p>
            <label className="field">
              Note about the patient (optional, any language)
              <textarea rows={2} value={note} placeholder="e.g. bike se gir gaya, sir se khoon, hosh nahi" onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn go big block" onClick={startTrip} disabled={busy}>Start trip and alert officers</button>
          </>
        )}
      </div>
    </div>
  );
}

function TripScreen({
  trip, error, dismissed, setDismissed, reroute, setReroute, findAnotherRoute, takeRoute, post,
}: {
  trip: TripView;
  error: string | null;
  dismissed: string[];
  setDismissed: (f: (d: string[]) => string[]) => void;
  reroute: RerouteState | null;
  setReroute: (r: RerouteState | null) => void;
  findAnotherRoute: () => void;
  takeRoute: (r: RouteOption) => void;
  post: (b: object) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const done = trip.status === "arrived";
  const nextAlert = trip.alerts.find((a) => a.alongM > trip.progressM);

  // The nearest signal ahead that an officer reported as heavy or blocked, if the crew has not dismissed it yet.
  const keyOf = (a: ViewAlert) => `${trip.id}|${trip.reroutes}|${a.signalId}|${a.status}|${a.reason ?? ""}`;
  // Not while the server is already choosing a new route automatically.
  const popup = trip.rerouting
    ? undefined
    : trip.alerts.find((a) => (a.status === "heavy" || a.status === "cannot") && a.alongM > trip.progressM && !dismissed.includes(keyOf(a)));
  const showNotice = !!trip.notice && Date.now() - trip.notice.at < 120_000;

  return (
    <div className="stage">
      <div className="stage-map">
        <Map
          routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#1456f0", selected: true }]}
          signals={trip.alerts.map((a) => ({ id: a.signalId, lat: a.lat, lng: a.lng, label: String(a.index), color: STATUS[a.status].color }))}
          ambulance={{ lat: trip.position[1], lng: trip.position[0] }}
          hospital={trip.hospital}
          start={trip.start}
          height="100%"
        />
      </div>

      <div className={`sheet${collapsed ? " collapsed" : ""}`}>
        <button className="grab" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Show details" : "Hide details"} />
        {error && <p className="errbox">{error}</p>}
        <p className="dest">Heading to {trip.hospital.name}</p>

        <div className="eta">
          <span>
            <b>{done ? "Arrived" : fmtMin(trip.etaS)}</b>
            <span>{done ? "at the hospital" : "to the hospital"}</span>
          </span>
          <span className="right">
            <b>{fmtKm(trip.remainingM)}</b>
            <span>remaining</span>
          </span>
        </div>

        {nextAlert && (
          <div className={`banner ${BANNER_CLASS[nextAlert.status]}`} role="status">
            <Lens color="#fff" />
            <span>
              <b>Signal #{nextAlert.index}, {fmtKm(nextAlert.alongM - trip.progressM)} ahead.</b> {advice(nextAlert)}
              {nextAlert.answeredBy && <> Reply from {nextAlert.answeredBy.name}.</>}
            </span>
          </div>
        )}

        {showNotice && trip.notice && (
          <div className="banner orange" role="status">
            <Lens color="#fff" />
            <span><b>Route update.</b> {trip.notice.text}</span>
          </div>
        )}

        <div className="pills">
          <span className="pill">
            <Lens color={trip.hospitalDesk.online ? "#12a150" : "#64748b"} small />
            {trip.hospitalDesk.online ? "Hospital desk online" : "Hospital desk not logged in"}
          </span>
          {trip.hospitalAck && (
            <span className="pill" style={{ color: "#0a5c2e" }}>
              <Lens color="#12a150" small />
              Team ready · {trip.hospitalAck.by.split(",")[0]}
            </span>
          )}
          {trip.reroutes > 0 && <span className="pill">Rerouted {trip.reroutes}×</span>}
        </div>

        <div className="row">
          <button className="btn on sm" onClick={findAnotherRoute} disabled={done}>Find another route</button>
          <button className="btn danger sm" onClick={() => post({ action: "reset" })}>End trip</button>
        </div>
        <div className="row" style={{ marginTop: 0 }}>
          <span className="muted">Demo speed</span>
          {[1, 4, 8, 16].map((s) => (
            <button key={s} className={trip.speed === s ? "btn on sm" : "btn sm"} onClick={() => post({ action: "speed", speed: s })}>{s}x</button>
          ))}
        </div>

        <details className="fold" open>
          <summary>Signals on this route ({trip.alerts.length})</summary>
          {trip.alerts.length === 0 && <p>No traffic signals found on this route.</p>}
          <ol className="signals">
            {trip.alerts.map((a) => (
              <li key={a.signalId}>
                <Lens color={STATUS[a.status].color}>{a.index}</Lens>
                <span className="what">
                  <b>{fmtKm(Math.max(0, a.alongM - trip.progressM))} {a.alongM <= trip.progressM ? "(passed)" : "ahead"} · heading {a.direction}</b>
                  <small>
                    {a.onDuty ? <>Officer: {a.onDuty.name} ({a.onDuty.badge})</> : "No officer posted"}
                    {a.status === "heavy" && a.reason ? ` · ${REASON_LABEL[a.reason]}` : ""}
                  </small>
                </span>
                <span className="pill" style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</span>
              </li>
            ))}
          </ol>
        </details>
        {trip.route.narrowLaneWarning && <p className="warn">This route may use a narrow lane. Use your own judgement.</p>}
      </div>

      {(popup || reroute) && (
        <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
          <div className="modal">
            {reroute ? (
              <>
                <header className="orange"><Lens color="#fff" /><h2 id="dlg-title">Another route</h2></header>
                <div className="body">
                  {reroute.loading && <p>Finding routes that avoid the blocked signal…</p>}
                  {reroute.error && <p className="errbox">{reroute.error}</p>}
                  {reroute.blocked && <p className="warn">No route avoids this signal. Stay on your current route and take extra care.</p>}
                  {reroute.options?.map((o) => {
                    const diffMin = Math.round((o.durationS - trip.etaS) / 60);
                    return (
                      <div className="alt" key={o.id}>
                        <span>
                          <b>{fmtMin(o.durationS)}</b>{" "}
                          <span className="muted">{diffMin === 0 ? "same as now" : diffMin > 0 ? `${diffMin} min longer` : `${-diffMin} min shorter`}</span>
                          <br />
                          <span className="muted">{fmtKm(o.distanceM)} · {o.signals.length} signals</span>
                        </span>
                        <button className="btn on" onClick={() => takeRoute(o)}>Take this route</button>
                      </div>
                    );
                  })}
                  <div className="actions">
                    <button className="btn" onClick={() => { if (popup) setDismissed((d) => [...d, keyOf(popup)]); setReroute(null); }}>Stay on current route</button>
                  </div>
                </div>
              </>
            ) : popup ? (
              <>
                <header className={popup.status === "cannot" ? "red" : "orange"}>
                  <Lens color="#fff" />
                  <h2 id="dlg-title">{popup.status === "cannot" ? "Signal can't be cleared" : "Traffic ahead"}</h2>
                </header>
                <div className="body">
                  <p><b>Signal #{popup.index}, {fmtKm(popup.alongM - trip.progressM)} ahead.</b></p>
                  {popup.status === "heavy" && <p>Reason: <b>{popup.reason ? REASON_LABEL[popup.reason] : "Heavy traffic"}</b>. Expect a delay.</p>}
                  {popup.status === "cannot" && <p>The officer cannot clear this signal for you.</p>}
                  {popup.answeredBy && <p className="muted">Reported by {popup.answeredBy.name} ({popup.answeredBy.badge}).</p>}
                  <div className="actions">
                    <button className="btn on big" onClick={findAnotherRoute}>Find another route</button>
                    <button className="btn big" onClick={() => setDismissed((d) => [...d, keyOf(popup)])}>Continue on this route</button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
