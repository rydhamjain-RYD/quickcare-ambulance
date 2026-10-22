"use client";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so it must only load in the browser.
const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

export default Map;
