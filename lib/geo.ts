export type LngLat = [number, number];

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cumulative distance in metres at each vertex of the line. */
export function cumulative(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return cum;
}

/** Distance from a point to a segment (metres) and how far along the segment it projects (metres). */
function toSegment(p: LngLat, a: LngLat, b: LngLat): { dist: number; along: number } {
  const lat0 = toRad(p[1]);
  const kx = R * Math.cos(lat0);
  const ky = R;
  const ax = toRad(a[0]) * kx, ay = toRad(a[1]) * ky;
  const bx = toRad(b[0]) * kx, by = toRad(b[1]) * ky;
  const px = toRad(p[0]) * kx, py = toRad(p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), along: t * Math.sqrt(len2) };
}

/** Closest approach of a point to the route, with distance along the route in metres. */
export function locateOnRoute(
  p: LngLat,
  coords: LngLat[],
  cum: number[],
): { dist: number; alongM: number } {
  let best = { dist: Infinity, alongM: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const s = toSegment(p, coords[i], coords[i + 1]);
    if (s.dist < best.dist) best = { dist: s.dist, alongM: cum[i] + s.along };
  }
  return best;
}

export function pointAtDistance(coords: LngLat[], cum: number[], d: number): LngLat {
  if (d <= 0) return coords[0];
  const total = cum[cum.length - 1];
  if (d >= total) return coords[coords.length - 1];
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  const a = coords[i - 1], b = coords[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Compass direction of travel at a point along the route, e.g. "north-east". */
export function headingAt(coords: LngLat[], cum: number[], d: number): string {
  const a = pointAtDistance(coords, cum, Math.max(0, d - 30));
  const b = pointAtDistance(coords, cum, d + 30);
  const dy = b[1] - a[1];
  const dx = (b[0] - a[0]) * Math.cos(toRad(a[1]));
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round(((deg + 360) % 360) / 45) % 8];
}

export function pointInPolygon(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
