"use client";
import { useState } from "react";
import Map from "@/components/Map";
import BackLink from "@/components/BackLink";
import Lens from "@/components/Lens";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";
import { REASON_LABEL, STATUS } from "@/lib/status";
import type { RouteOption } from "@/lib/routing";
import type { AlertStatus, TripView, ViewAlert } from "@/lib/trip";

type Place = { id: string; name: string; lat: number; lng: number; source: string };
type Pickup = { name: string; lat: number; lng: number };
type RerouteState = { loading: boolean; options: RouteOption[] | null; blocked: boolean; error: string | null };

// Signal data and routing in this demo cover Bengaluru only.
const inBengaluru = (lat: number, lng: number) => lat >= 12.83 && lat <= 13.1 && lng >= 77.45 && lng <= 77.75;

const ROUTE_COLORS = ["#1b3a8c", "#f26b1d"];

// Demo trip: an example pickup in Jayanagar to Manipal Hospital on Old Airport Road (about 12 km, 18 signals).
const DEMO_PICKUP: Pickup = { name: "Jayanagar 4th Block (demo pickup)", lat: 12.9265737, lng: 77.5835041 };
const DEMO_HOSPITAL: Place = { id: "manipal-old-airport", name: "Manipal Hospital, Old Airport Road (demo drop)", lat: 12.959846, lng: 77.649214, source: "saved" };

const BANNER_CLASS: Record<AlertStatus, string> = {
  waiting: "gray", alerted: "amber", cleared: "green", heavy: "orange", cannot: "red", unanswered: "violet",
};

/** What the crew should do, from what the officer at the signal has said. */
function advice(a: ViewAlert): string {
  if (a.status === "cleared") return "Officer says the route is clear. Proceed.";
  if (a.status === "heavy") return `Heavy traffic${a.reason ? `: ${REASON_LABEL[a.reason].toLowerCase()}` : ""}. Expect a delay and slow down.`;
  if (a.status === "cannot") return "Officer can't clear this signal. Take extra care.";
  if (!a.onDuty) return a.status === "waiting" ? "No officer is posted here today. Drive with caution." : "No officer is posted here. Drive with caution.";
  if (a.status === "unanswered") return "No reply from the officer. Drive with caution.";
  if (a.status === "alerted") return "Officer alerted, waiting for a reply. Keep your siren on.";
  return "The officer will be alerted at 800 m.";
}

export default function DriverPage() {
  const { trip, loaded, error, setTrip } = useTrip();
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [pQuery, setPQuery] = useState("");
  const [pPlaces, setPPlaces] = useState<Place[]>([]);
  const [pMsg, setPMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
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
    setPPlaces([]);
    setPMsg(null);
    setOptions(null);
    // If a hospital is already chosen, plan the new route straight away.
    if (hospital) findRoutes(hospital, p);
  }

  async function searchPickup() {
    setPMsg(null);
    setPPlaces([]);
    if (pQuery.trim().length < 2) {
      setPMsg("Type the pickup address or a landmark, at least 2 letters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?kind=place&q=${encodeURIComponent(pQuery.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPPlaces(data.results);
      if (data.results.length === 0) setPMsg(`No place found for "${pQuery}". Add the area or a nearby landmark, e.g. "5th Block Koramangala".`);
      else if (data.searchFailed) setPMsg("Address search is unavailable. Use your current location instead.");
    } catch (e) {
      setPMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
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

  async function search() {
    setMsg(null);
    setOptions(null);
    setHospital(null);
    setPlaces([]);
    if (query.trim().length < 2) {
      setSearchMsg("Type at least 2 letters of the hospital name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setPlaces(data.results);
      setSearchMsg(
        data.results.length === 0
          ? `No hospital found for "${query}". Check the spelling or try part of the name.`
          : data.searchFailed
            ? "Online search is unavailable. Showing saved hospitals only."
            : null,
      );
    } catch (e) {
      setSearchMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    <main className="page">
      <BackLink />
      <h1>Plan the route</h1>
      <p className="sub">Set where the patient is and which hospital the family chose. We will find the route and every signal on it.</p>
      {error && <p className="errbox">{error}</p>}

      <div className="panel">
        <b>Want to see how it works first?</b>
        <p className="muted">Load a ready-made trip from Jayanagar 4th Block to Manipal Hospital on Old Airport Road.</p>
        <button
          className="btn on"
          disabled={busy}
          onClick={() => {
            setPickup(DEMO_PICKUP);
            setPPlaces([]);
            setPMsg(null);
            setPlaces([]);
            setSearchMsg(null);
            findRoutes(DEMO_HOSPITAL, DEMO_PICKUP);
          }}
        >
          Load the demo trip
        </button>
      </div>

      {pickup ? (
        <div className="chosen">
          <span><small>Pickup</small>{pickup.name}</span>
          <button className="btn" onClick={() => { setPickup(null); setOptions(null); }}>Change</button>
        </div>
      ) : (
        <>
          <label className="field">
            Patient pickup location
            <div className="row">
              <input className="grow" value={pQuery} placeholder="Address or landmark, e.g. 5th Block Koramangala" onChange={(e) => setPQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPickup()} />
              <button className="btn on" onClick={searchPickup} disabled={busy}>Search</button>
              <button className="btn" onClick={useCurrentLocation} disabled={busy}>Use my current location</button>
            </div>
          </label>
          {pMsg && <p className="warn">{pMsg}</p>}
          {pPlaces.length > 0 && (
            <ul className="places">
              {pPlaces.map((p) => (
                <li key={p.id}>
                  <button className="place" onClick={() => choosePickup({ name: p.name, lat: p.lat, lng: p.lng })}>{p.name}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {hospitalLocked && hospital ? (
        <div className="chosen">
          <span><small>Hospital</small>{hospital.name}</span>
          <button className="btn" onClick={() => { setHospital(null); setOptions(null); setMsg(null); }}>Change</button>
        </div>
      ) : (
        <label className="field">
          Hospital the family chose
          <div className="row">
            <input className="grow" value={query} placeholder="e.g. Manipal, Mahaveer, Rangadore" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button className="btn on" onClick={search} disabled={busy}>Search</button>
          </div>
        </label>
      )}
      {searchMsg && <p className="warn">{searchMsg}</p>}
      {places.length > 0 && !hospitalLocked && (
        <ul className="places">
          {places.map((p) => (
            <li key={p.id}>
              <button className={hospital?.id === p.id ? "place on" : "place"} onClick={() => findRoutes(p)} disabled={busy}>
                {p.name} {p.source === "saved" && <em>saved</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {busy && <p className="muted">Working…</p>}
      {msg && <p className="warn">{msg}</p>}

      {options && hospital && (
        <>
          <h2>Choose a route</h2>
          <div className="cards">
            {options.map((o, i) => (
              <button key={o.id} className={chosen === o.id ? "card on" : "card"} onClick={() => setChosen(o.id)} style={{ borderColor: chosen === o.id ? undefined : ROUTE_COLORS[i % 2] }}>
                <b>{o.labels.map((l) => (l === "quickest" ? "Quickest" : "Fewest signals")).join(" and ")}</b>
                <span className="time" style={{ color: "var(--ink)" }}>{fmtMin(o.durationS)}</span>
                <span>{fmtKm(o.distanceM)} · {o.signals.length} traffic signals</span>
              </button>
            ))}
          </div>
          {options.length === 1 && <p className="muted">The quickest route is also the one with the fewest signals.</p>}
          <p className="muted">Times use normal road speeds, not live traffic.</p>
          <Map
            routes={options.map((o, i) => ({ id: o.id, coords: o.coords, color: ROUTE_COLORS[i % 2], selected: o.id === chosen }))}
            signals={(sel?.signals ?? []).map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: String(i + 1), color: STATUS.waiting.color }))}
            hospital={hospital}
            start={start ?? undefined}
          />
          <label className="field">
            Note about the patient (optional, any language)
            <textarea rows={2} value={note} placeholder="e.g. bike se gir gaya, sir se khoon, hosh nahi" onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn on big" onClick={startTrip} disabled={busy}>Start trip and alert officers</button>
        </>
      )}
    </main>
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
    <main className="page">
      <BackLink />
      <h1>Heading to {trip.hospital.name}</h1>
      {error && <p className="errbox">{error}</p>}

      <div className="stats">
        <div className="stat hero-stat"><b>{done ? "Arrived" : fmtMin(trip.etaS)}</b><span>{done ? "at the hospital" : "to the hospital"}</span></div>
        <div className="stat"><b>{fmtKm(trip.remainingM)}</b><span>remaining</span></div>
        <div className="stat"><b>{trip.nextSignal ? `#${trip.nextSignal.index} in ${fmtKm(trip.nextSignal.distanceM)}` : "None"}</b><span>next signal</span></div>
      </div>

      <div className="legend" style={{ margin: "4px 0 0" }}>
        <span>
          <Lens color={trip.hospitalDesk.online ? "#0e9f6e" : "#64748b"} small />
          {trip.hospitalDesk.online ? "Hospital emergency desk is online" : "Hospital emergency desk is not logged in"}
        </span>
        {trip.hospitalAck && (
          <span>
            <Lens color="#0e9f6e" small />
            <b>Team ready</b> · confirmed by {trip.hospitalAck.by}
          </span>
        )}
      </div>

      {showNotice && trip.notice && (
        <div className="banner orange" role="status">
          <Lens color="#fff" />
          <span><b>Route update.</b> {trip.notice.text}</span>
        </div>
      )}

      {nextAlert && (
        <div className={`banner ${BANNER_CLASS[nextAlert.status]}`} role="status">
          <Lens color="#fff" pulse={nextAlert.status === "alerted"} />
          <span>
            <b>Next signal #{nextAlert.index}, {fmtKm(nextAlert.alongM - trip.progressM)} ahead.</b> {advice(nextAlert)}
            {nextAlert.answeredBy && <> Reply from {nextAlert.answeredBy.name}.</>}
          </span>
        </div>
      )}

      <Map
        routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#1b3a8c", selected: true }]}
        signals={trip.alerts.map((a) => ({ id: a.signalId, lat: a.lat, lng: a.lng, label: String(a.index), color: STATUS[a.status].color }))}
        ambulance={{ lat: trip.position[1], lng: trip.position[0] }}
        hospital={trip.hospital}
        start={trip.start}
      />

      <div className="row">
        <button className="btn on" onClick={findAnotherRoute} disabled={done}>Find another route</button>
        <span className="muted">Demo speed:</span>
        {[1, 4, 8, 16].map((s) => (
          <button key={s} className={trip.speed === s ? "btn on" : "btn"} onClick={() => post({ action: "speed", speed: s })}>{s}x</button>
        ))}
        <button className="btn danger" onClick={() => post({ action: "reset" })}>End demo</button>
      </div>
      {trip.reroutes > 0 && <p className="muted">You have switched route {trip.reroutes} time{trip.reroutes > 1 ? "s" : ""}.</p>}

      <h2>Signals on this route ({trip.alerts.length})</h2>
      {trip.alerts.length === 0 && <p>No traffic signals found on this route.</p>}
      <ol className="signals">
        {trip.alerts.map((a) => (
          <li key={a.signalId}>
            <Lens color={STATUS[a.status].color} pulse={a.status === "alerted"}>{a.index}</Lens>
            <span className="what">
              <b>{fmtKm(Math.max(0, a.alongM - trip.progressM))} {a.alongM <= trip.progressM ? "(passed)" : "ahead"}, heading {a.direction}</b>
              <small>
                {a.onDuty ? <>Officer on duty: {a.onDuty.name} ({a.onDuty.badge})</> : "No officer posted here today"}
                {a.status === "heavy" && a.reason ? ` · ${REASON_LABEL[a.reason]}` : ""}
              </small>
            </span>
            <span className="state" style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</span>
          </li>
        ))}
      </ol>
      {trip.route.narrowLaneWarning && <p className="warn">This route may use a narrow lane. Use your own judgement.</p>}

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
    </main>
  );
}
