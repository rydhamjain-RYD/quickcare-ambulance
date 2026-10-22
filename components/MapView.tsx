"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

export type MapRoute = { id: string; coords: [number, number][]; color: string; selected: boolean };
export type MapSignal = { id: string; lat: number; lng: number; label: string; color: string };

/*
 * The map is built directly with Leaflet inside effects, not with a declarative wrapper.
 * Next.js keeps pages you have left alive in the background and shows them again later, which
 * re-runs effects but not ref callbacks. A map created in an effect is built fresh each time the
 * page appears and removed when it hides, so switching screens cannot leave a broken map behind.
 */

const icon = (html: string, size: number, cls: string) =>
  L.divIcon({ className: "", html: `<div class="mk ${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="1.5" fill="#e5383b"/><rect x="3" y="9" width="18" height="6" rx="1.5" fill="#e5383b"/></svg>';
const START_ICON = icon("", 18, "mk-start");
const HOSPITAL_ICON = icon("H", 32, "mk-hospital");
const AMBULANCE_ICON = icon(CROSS, 38, "mk-ambulance");
const signalIcon = (label: string, color: string) =>
  L.divIcon({ className: "", html: `<div class="mk mk-signal" style="background:${color}">${label}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

export default function MapView({
  routes = [],
  signals = [],
  ambulance,
  hospital,
  start,
  height = 420,
}: {
  routes?: MapRoute[];
  signals?: MapSignal[];
  ambulance?: { lat: number; lng: number };
  hospital?: { lat: number; lng: number; name: string };
  start?: { lat: number; lng: number };
  height?: number | string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const ambRef = useRef<L.Marker | null>(null);
  const [built, setBuilt] = useState(0); // bumps each time a fresh map is created
  const framed = height === "100%";

  // Points to frame: the route, or the signals when there is no route, plus the hospital and pickup.
  const pts: [number, number][] = [];
  routes.forEach((r) => r.coords.forEach((c) => pts.push([c[1], c[0]])));
  if (routes.length === 0) signals.forEach((s) => pts.push([s.lat, s.lng]));
  if (hospital) pts.push([hospital.lat, hospital.lng]);
  if (start) pts.push([start.lat, start.lng]);
  const fitKey = pts.length === 0 ? "none" : pts.length === 1 ? pts[0].join(",") : [pts.length, ...pts[0], ...pts[pts.length - 1]].join(",");

  // What is drawn on the map. The ambulance is handled separately so it can move without a full redraw.
  const drawKey = JSON.stringify([
    routes.map((r) => [r.id, r.selected, r.color, r.coords.length]),
    signals.map((s) => [s.id, s.label, s.color]),
    hospital ? [hospital.lat, hospital.lng] : null,
    start ? [start.lat, start.lng] : null,
  ]);

  // Create the map when the page appears; remove it when the page hides or unmounts.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, { center: [12.9716, 77.5946], zoom: 12, zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    setBuilt((n) => n + 1);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      ambRef.current = null;
    };
  }, []);

  // Draw routes, signals, pickup and hospital.
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();
    routes
      .slice()
      .sort((a, b) => Number(a.selected) - Number(b.selected))
      .forEach((r) => {
        const line = r.coords.map((c) => [c[1], c[0]] as [number, number]);
        if (r.selected) L.polyline(line, { color: "#fff", weight: 11, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(layers);
        L.polyline(line, { color: r.color, weight: r.selected ? 6 : 5, opacity: r.selected ? 1 : 0.55, lineCap: "round", lineJoin: "round" }).addTo(layers);
      });
    signals.forEach((s) => L.marker([s.lat, s.lng], { icon: signalIcon(s.label, s.color) }).addTo(layers));
    if (start) L.marker([start.lat, start.lng], { icon: START_ICON }).bindTooltip("Patient pickup", { direction: "top", offset: [0, -8] }).addTo(layers);
    if (hospital) L.marker([hospital.lat, hospital.lng], { icon: HOSPITAL_ICON }).bindTooltip(hospital.name, { direction: "top", offset: [0, -14] }).addTo(layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, drawKey]);

  // Move the ambulance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!ambulance) {
      ambRef.current?.remove();
      ambRef.current = null;
      return;
    }
    if (!ambRef.current) {
      ambRef.current = L.marker([ambulance.lat, ambulance.lng], { icon: AMBULANCE_ICON, zIndexOffset: 1000 }).bindTooltip("Ambulance", { direction: "top", offset: [0, -18] }).addTo(map);
    } else {
      ambRef.current.setLatLng([ambulance.lat, ambulance.lng]);
    }
  }, [built, ambulance?.lat, ambulance?.lng, !!ambulance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame what is drawn. When a panel covers part of the map, keep the route in the visible part.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pts.length === 0) return;
    const fit = () => {
      map.invalidateSize();
      if (pts.length === 1) {
        map.setView(pts[0], 14);
        return;
      }
      const lats = pts.map((p) => p[0]);
      const lngs = pts.map((p) => p[1]);
      const bounds = L.latLngBounds([Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]);
      if (framed) {
        const narrow = window.innerWidth < 900;
        map.fitBounds(bounds, narrow
          ? { paddingTopLeft: [40, 40], paddingBottomRight: [40, Math.round(map.getSize().y * 0.6)] }
          : { paddingTopLeft: [450, 40], paddingBottomRight: [40, 40] });
      } else {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    };
    fit();
    const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, fitKey, framed]);

  return <div ref={elRef} style={{ height, width: "100%" }} />;
}
