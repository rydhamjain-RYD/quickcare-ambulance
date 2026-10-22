"use client";
import { useState } from "react";
import Map from "@/components/Map";
import { fmtKm, fmtMin, useTrip } from "@/lib/useTrip";
import type { RouteOption } from "@/lib/routing";
import { STATUS } from "@/lib/status";

const STARTS = [
  { name: "Jayanagar", lat: 12.925, lng: 77.5938 },
  { name: "Koramangala", lat: 12.9352, lng: 77.6245 },
  { name: "Indiranagar", lat: 12.9784, lng: 77.6408 },
  { name: "Malleshwaram", lat: 13.0035, lng: 77.571 },
  { name: "Hebbal", lat: 13.0358, lng: 77.597 },
  { name: "Banashankari", lat: 12.9255, lng: 77.5468 },
  { name: "BTM Layout", lat: 12.9166, lng: 77.6101 },
  { name: "Rajajinagar", lat: 12.9916, lng: 77.552 },
];

type Place = { id: string; name: string; lat: number; lng: number; source: string };

const ROUTE_COLORS = ["#2563eb", "#ea580c"];

export default function DriverPage() {
  const { trip, loaded, error, setTrip } = useTrip();
  const [startIdx, setStartIdx] = useState(0);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [hospital, setHospital] = useState<Place | null>(null);
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const start = STARTS[startIdx];

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

  async function findRoutes(h: Place) {
    setHospital(h);
    setMsg(null);
    setOptions(null);
    setBusy(true);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: { lat: start.lat, lng: start.lng }, to: { lat: h.lat, lng: h.lng } }),
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
    if (!route || !hospital) return;
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

  if (!loaded && !error) return <main className="page"><p>Loading…</p></main>;

  // ---------- Trip in progress ----------
  if (trip) {
    const done = trip.status === "arrived";
    return (
      <main className="page">
        <h1>Driver: heading to {trip.hospital.name}</h1>
        {error && <p className="warn">{error}</p>}
        <div className="stats">
          <div><b>{done ? "Arrived" : fmtMin(trip.etaS)}</b><span>{done ? "at hospital" : "to hospital"}</span></div>
          <div><b>{fmtKm(trip.remainingM)}</b><span>remaining</span></div>
          <div><b>{trip.nextSignal ? `#${trip.nextSignal.index} in ${fmtKm(trip.nextSignal.distanceM)}` : "None"}</b><span>next signal</span></div>
        </div>
        <Map
          routes={[{ id: trip.route.id, coords: trip.route.coords, color: "#2563eb", selected: true }]}
          signals={trip.alerts.map((a) => ({ id: a.signalId, lat: a.lat, lng: a.lng, label: String(a.index), color: STATUS[a.status].color }))}
          ambulance={{ lat: trip.position[1], lng: trip.position[0] }}
          hospital={trip.hospital}
          start={trip.start}
        />
        <div className="row">
          <span>Demo speed:</span>
          {[1, 4, 8, 16].map((s) => (
            <button key={s} className={trip.speed === s ? "btn on" : "btn"} onClick={() => post({ action: "speed", speed: s })}>{s}x</button>
          ))}
          <button className="btn danger" onClick={() => post({ action: "reset" })}>Reset demo</button>
        </div>
        <h2>Signals on this route ({trip.alerts.length})</h2>
        {trip.alerts.length === 0 && <p>No traffic signals found on this route.</p>}
        <ol className="signals">
          {trip.alerts.map((a) => (
            <li key={a.signalId}>
              <span className="dot" style={{ background: STATUS[a.status].color }}>{a.index}</span>
              <span>{fmtKm(a.alongM)} from start, heading {a.direction}</span>
              <b style={{ color: STATUS[a.status].color }}>{STATUS[a.status].label}</b>
            </li>
          ))}
        </ol>
        {trip.route.narrowLaneWarning && <p className="warn">This route may use a narrow lane. Use your own judgement.</p>}
      </main>
    );
  }

  // ---------- Planning ----------
  const sel = options?.find((o) => o.id === chosen);
  return (
    <main className="page">
      <h1>Driver: plan the route</h1>
      {error && <p className="warn">{error}</p>}
      <label className="field">
        Patient pickup area
        <select value={startIdx} onChange={(e) => { setStartIdx(Number(e.target.value)); setOptions(null); }}>
          {STARTS.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
        </select>
      </label>
      <label className="field">
        Hospital the family chose
        <div className="row">
          <input value={query} placeholder="e.g. Manipal, Mahaveer, Rangadore" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn on" onClick={search} disabled={busy}>Search</button>
        </div>
      </label>
      {searchMsg && <p className="warn">{searchMsg}</p>}
      {places.length > 0 && (
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
      {busy && <p>Working…</p>}
      {msg && <p className="warn">{msg}</p>}

      {options && hospital && (
        <>
          <h2>Choose a route</h2>
          <div className="cards">
            {options.map((o, i) => (
              <button key={o.id} className={chosen === o.id ? "card on" : "card"} onClick={() => setChosen(o.id)} style={{ borderColor: ROUTE_COLORS[i % 2] }}>
                <b>{o.labels.map((l) => (l === "quickest" ? "Quickest" : "Fewest signals")).join(" + ")}</b>
                <span>{fmtMin(o.durationS)} · {fmtKm(o.distanceM)}</span>
                <span>{o.signals.length} traffic signals</span>
              </button>
            ))}
          </div>
          {options.length === 1 && <p className="muted">The quickest route is also the one with the fewest signals.</p>}
          <p className="muted">Times use normal road speeds, not live traffic.</p>
          <Map
            routes={options.map((o, i) => ({ id: o.id, coords: o.coords, color: ROUTE_COLORS[i % 2], selected: o.id === chosen }))}
            signals={(sel?.signals ?? []).map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: String(i + 1), color: STATUS.waiting.color }))}
            hospital={hospital}
            start={start}
          />
          <label className="field">
            Optional note about the patient (any language)
            <textarea rows={2} value={note} placeholder="e.g. bike se gir gaya, sir se khoon, hosh nahi" onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn big on" onClick={startTrip} disabled={busy}>Start trip and alert officers</button>
        </>
      )}
    </main>
  );
}
