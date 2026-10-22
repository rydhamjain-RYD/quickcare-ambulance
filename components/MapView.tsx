"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { LatLngBoundsExpression } from "leaflet";

export type MapRoute = { id: string; coords: [number, number][]; color: string; selected: boolean };
export type MapSignal = { id: string; lat: number; lng: number; label: string; color: string };

function Fit({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    // The container can still be sizing itself on first render, so re-measure before and after fitting.
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [30, 30] });
    };
    fit();
    const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
  }, [map, bounds]);
  return null;
}

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
  height?: number;
}) {
  const pts: [number, number][] = [];
  routes.forEach((r) => r.coords.forEach((c) => pts.push([c[1], c[0]])));
  if (hospital) pts.push([hospital.lat, hospital.lng]);
  if (start) pts.push([start.lat, start.lng]);
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const bounds: LatLngBoundsExpression | null = pts.length
    ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
    : null;
  const boundsKey = bounds ? JSON.stringify(bounds) : "none";

  return (
    <MapContainer center={[12.9716, 77.5946]} zoom={12} style={{ height, width: "100%", borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit key={boundsKey} bounds={bounds} />
      {routes
        .slice()
        .sort((a, b) => Number(a.selected) - Number(b.selected))
        .map((r) => (
          <Polyline
            key={r.id}
            positions={r.coords.map((c) => [c[1], c[0]] as [number, number])}
            pathOptions={{ color: r.color, weight: r.selected ? 6 : 4, opacity: r.selected ? 0.95 : 0.5 }}
          />
        ))}
      {signals.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={9} pathOptions={{ color: "#fff", weight: 2, fillColor: s.color, fillOpacity: 1 }}>
          <Tooltip permanent direction="center" className="sig-tip">{s.label}</Tooltip>
        </CircleMarker>
      ))}
      {start && (
        <CircleMarker center={[start.lat, start.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }}>
          <Tooltip>Patient pickup</Tooltip>
        </CircleMarker>
      )}
      {hospital && (
        <CircleMarker center={[hospital.lat, hospital.lng]} radius={9} pathOptions={{ color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }}>
          <Tooltip>{hospital.name}</Tooltip>
        </CircleMarker>
      )}
      {ambulance && (
        <CircleMarker center={[ambulance.lat, ambulance.lng]} radius={11} pathOptions={{ color: "#111", weight: 3, fillColor: "#facc15", fillOpacity: 1 }}>
          <Tooltip>Ambulance</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
