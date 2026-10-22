"use client";
import { useEffect, useRef, useState } from "react";

export type SearchPlace = { id: string; name: string; lat: number; lng: number; source: string };

// Answers already fetched in this browser, so retyping or backspacing is instant.
const memo = new Map<string, { results: SearchPlace[]; searchFailed: boolean }>();

/**
 * Search box that suggests places as you type. Waits a moment after you stop typing, cancels
 * outdated requests, and works with the keyboard (arrows, Enter, Escape).
 */
export default function SearchBox({
  kind,
  placeholder,
  disabled,
  onPick,
}: {
  kind: "place" | "hospital";
  placeholder: string;
  disabled?: boolean;
  onPick: (p: SearchPlace) => void;
}) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const picked = useRef(false); // true right after choosing, so the chosen name does not trigger a new search

  useEffect(() => {
    if (picked.current) { picked.current = false; return; }
    const q = value.trim();
    setActive(-1);
    if (q.length < 2) { setResults([]); setMessage(null); setLoading(false); return; }

    const key = `${kind}:${q.toLowerCase()}`;
    const cached = memo.get(key);
    if (cached) {
      setResults(cached.results);
      setMessage(cached.results.length === 0 ? `Nothing found for "${q}". Try the area or a nearby landmark.` : cached.searchFailed ? "Search is unavailable right now." : null);
      setLoading(false);
      setOpen(true);
      return;
    }

    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?kind=${kind}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        if (!data.searchFailed) memo.set(key, data);
        setResults(data.results);
        setMessage(
          data.results.length === 0
            ? data.searchFailed ? "Search is unavailable right now. Check your connection and try again." : `Nothing found for "${q}". Try the area or a nearby landmark.`
            : null,
        );
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMessage((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value, kind]);

  function pick(p: SearchPlace) {
    picked.current = true;
    setValue(p.name);
    setResults([]);
    setMessage(null);
    setOpen(false);
    onPick(p);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { const p = results[active >= 0 ? active : 0]; if (p) { e.preventDefault(); pick(p); } }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
      />
      {loading && <p className="muted" style={{ margin: "6px 2px 0" }}>Searching…</p>}
      {open && !loading && message && <p className="muted" style={{ margin: "6px 2px 0" }}>{message}</p>}
      {open && results.length > 0 && (
        <ul className="places" role="listbox">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button className={i === active ? "place on" : "place"} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                {p.name} {p.source === "saved" && <em>saved</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
