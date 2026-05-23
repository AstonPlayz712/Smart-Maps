import { useEffect, useRef, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { POI } from '../engine/types';
import LiquidGlass from './LiquidGlass';

interface Props {
  engine?: SmartMapsEngine;
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-up search sheet, LG-framed. Two modes share one input:
 *   • Typing matches POIs by substring (via SmModules.spatialGraph).
 *   • Pressing Enter dispatches the raw query through Ask Maps so
 *     natural-language commands ("fly to London Eye", "orbit Big Ben")
 *     also work.
 * Tapping a POI starts navigation via SmModules.routing.
 */
export default function SearchSheet({ engine, open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<POI[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!engine) {
      setResults([]);
      return;
    }
    const all = engine.sm.spatialGraph.all();
    if (!query.trim()) {
      setResults(all.slice(0, 8));
      return;
    }
    const q = query.toLowerCase();
    setResults(all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12));
  }, [query, engine]);

  if (!open || !engine) return null;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = query.trim();
    if (!text) return;
    void engine.askMaps.run(text);
    onClose();
  };

  const selectPoi = (poi: POI) => {
    engine.sm.routing.start({ lng: poi.center[0], lat: poi.center[1] });
    onClose();
  };

  return (
    <div className="search-sheet-wrap" onClick={onClose} role="dialog" aria-modal="true">
      <LiquidGlass
        className="search-sheet"
        thickness="thick"
        glow="strong"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="search-sheet-input" onSubmit={submit}>
          <span className="search-icon" aria-hidden>◎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where to? Try a place — or ask."
            spellCheck={false}
            autoComplete="off"
            aria-label="Search or ask"
          />
          <button
            type="button"
            className="search-close"
            onClick={onClose}
            aria-label="Close search"
          >
            ✕
          </button>
        </form>
        <ul className="search-results">
          {results.length === 0 && (
            <li className="search-empty">
              No matches. Press enter to send to Ask Maps.
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => selectPoi(p)}>
                <span className="result-name">{p.name}</span>
                <span className="result-meta">{p.category ?? 'POI'}</span>
              </button>
            </li>
          ))}
        </ul>
      </LiquidGlass>
    </div>
  );
}
