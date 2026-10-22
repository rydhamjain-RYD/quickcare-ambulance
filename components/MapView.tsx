"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { LatLngBoundsExpression } from "leaflet";

export type MapRoute = { id: string; coords: [number, number][]; color: string; selected: boolean };
export type MapSignal = { id: string; lat: number; lng: number; label: string; color: string };

function Fit({ bounds, single, framed }: { bounds: LatLngBoundsExpression | null; single: [number, number] | null; framed: boolean }) {
  const map = useMap();
  useEffect(() => {
    // The container can still be sizing itself on first render, so re-measure before and after fitting.
    const fit = () => {
      map.invalidateSize();
      if (single) map.setView(single, 14);
      else if (bounds) {
        if (framed) {
          // Full-screen map with a panel on top: keep the route inside the part of the map still visible.
          const narrow = window.innerWidth < 900;
          map.fitBounds(bounds, narrow
            ? { paddingTopLeft: [40, 40], paddingBottomRight: [40, Math.round(map.getSize().y * 0.6)] }
            : { paddingTopLeft: [450, 40], paddingBottomRight: [40, 40] });
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    };
    if (!bounds && !single) return;
    fit();
    const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
  }, [map, bounds, single]);
  return null;
}

const dot = (html: string, size: number, cls: string) => L.divIcon({ className: "", html: `<div class="mk ${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

const ICONS = {
  start: dot("", 18, "mk-start"),
  hospital: dot("H", 32, "mk-hospital"),
  ambulance: dot('<svg width="18" height="18" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="1.5" fill="#e5383b"/><rect x="3" y="9" width="18" height="6" rx="1.5" fill="#e5383b"/></svg>', 38, "mk-ambulance"),
};
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
  const pts: [number, number][] = [];
  routes.forEach((r) => r.coords.forEach((c) => pts.push([c[1], c[0]])));
  // When there is no route to frame (e.g. the officer picking a junction), frame the signals instead.
  if (routes.length === 0) signals.forEach((s) => pts.push([s.lat, s.lng]));
  if (hospital) pts.push([hospital.lat, hospital.lng]);
  if (start) pts.push([start.lat, start.lng]);
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const single = pts.length === 1 ? pts[0] : null;
  const bounds: LatLngBoundsExpression | null =
    pts.length > 1 ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : null;
  const boundsKey = bounds ? JSON.stringify(bounds) : single ? single.join(",") : "none";

  return (
    <MapContainer center={[12.9716, 77.5946]} zoom={12} zoomControl={false} style={{ height, width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ZoomControl position="topright" />
      <Fit key={boundsKey} bounds={bounds} single={single} framed={height === "100%"} />
      {routes
        .slice()
        .sort((a, b) => Number(a.selected) - Number(b.selected))
        .map((r) => {
          const line = r.coords.map((c) => [c[1], c[0]] as [number, number]);
          return (
            <span key={r.id}>
              {r.selected && <Polyline positions={line} pathOptions={{ color: "#fff", weight: 11, opacity: 1, lineCap: "round", lineJoin: "round" }} />}
              <Polyline positions={line} pathOptions={{ color: r.color, weight: r.selected ? 6 : 5, opacity: r.selected ? 1 : 0.55, lineCap: "round", lineJoin: "round" }} />
            </span>
          );
        })}
      {signals.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={signalIcon(s.label, s.color)} />
      ))}
      {start && (
        <Marker position={[start.lat, start.lng]} icon={ICONS.start}>
          <Tooltip direction="top" offset={[0, -8]}>Patient pickup</Tooltip>
        </Marker>
      )}
      {hospital && (
        <Marker position={[hospital.lat, hospital.lng]} icon={ICONS.hospital}>
          <Tooltip direction="top" offset={[0, -14]}>{hospital.name}</Tooltip>
        </Marker>
      )}
      {ambulance && (
        <Marker position={[ambulance.lat, ambulance.lng]} icon={ICONS.ambulance} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -18]}>Ambulance</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
