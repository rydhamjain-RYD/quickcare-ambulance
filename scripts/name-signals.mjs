// One-off: names each traffic signal after the roads that meet there (from OpenStreetMap) and saves it in data/signals.json.
import fs from "node:fs";
const file = "data/signals.json";
const sigs = JSON.parse(fs.readFileSync(file, "utf8"));
const names = new Map(); // signal id -> Set of road names
const refs = (t) => t.name || t.ref || null;
for (let i = 0; i < sigs.length; i += 250) {
  const ids = sigs.slice(i, i + 250).map((s) => s.id).join(",");
  const q = `[out:json][timeout:60];node(id:${ids})->.s;way(bn.s)[highway][name];out body;`;
  let data;
  for (let a = 0; a < 4 && !data; a++) {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) data = await r.json(); else await new Promise((r2) => setTimeout(r2, 5000));
    } catch { await new Promise((r2) => setTimeout(r2, 5000)); }
  }
  if (!data) { console.log("chunk failed", i); continue; }
  const want = new Set(sigs.slice(i, i + 250).map((s) => s.id));
  for (const w of data.elements) for (const n of w.nodes) if (want.has(n)) { if (!names.has(n)) names.set(n, new Set()); names.get(n).add(refs(w.tags)); }
  console.log("chunk", i, data.elements.length);
}
let named = 0;
for (const s of sigs) {
  const set = names.get(s.id);
  if (set && set.size) { s.name = [...set].slice(0, 2).join(" / "); named++; }
}
fs.writeFileSync(file, JSON.stringify(sigs));
console.log("named", named, "of", sigs.length);
