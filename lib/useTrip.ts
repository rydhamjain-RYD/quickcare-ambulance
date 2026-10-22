"use client";
import { useEffect, useState } from "react";
import type { TripView } from "./trip";

/** Polls the shared trip state every 1.5 s. `error` is set if the server cannot be reached. */
export function useTrip() {
  const [trip, setTrip] = useState<TripView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/trip", { cache: "no-store" });
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const data = await res.json();
        if (alive) {
          setTrip(data.trip);
          setError(null);
          setLoaded(true);
        }
      } catch (e) {
        if (alive) setError(`Cannot reach the server (${(e as Error).message}). Retrying...`);
      }
    };
    load();
    const id = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { trip, loaded, error, setTrip };
}

export const fmtMin = (s: number) => (s < 90 ? `${Math.max(0, Math.round(s))} sec` : `${Math.round(s / 60)} min`);
export const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
