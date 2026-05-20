import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';

interface Props {
  engine?: SmartMapsEngine;
  ready: boolean;
}

export default function HUD({ engine, ready }: Props) {
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; durationSec: number } | null>(null);

  useEffect(() => {
    if (!engine) return;
    const offDone = engine.bus.on('route:done', (info) => setRouteInfo(info));
    const offClear = engine.bus.on('route:clear', () => setRouteInfo(null));
    return () => {
      offDone();
      offClear();
    };
  }, [engine]);

  if (!engine || !ready) return null;

  return (
    <>
      <div className="hud" aria-label="Camera controls">
        <button title="Reset camera (north up)" onClick={() => engine.askMaps.run('reset')}>⌂</button>
        <button title="Flat top-down" onClick={() => engine.askMaps.run('flat')}>▭</button>
        <button title="Cinematic tilt" onClick={() => engine.askMaps.run('cinematic')}>◭</button>
        <button title="Cinematic tour" onClick={() => engine.askMaps.run('cinematic tour')}>▶</button>
        <button title="Stop motion" onClick={() => engine.askMaps.run('stop')}>■</button>
        <button title="Clear route" onClick={() => engine.askMaps.run('clear route')}>✕</button>
      </div>
      {routeInfo && (
        <div className="route-info" role="status">
          <strong>{(routeInfo.distanceMeters / 1000).toFixed(2)} km</strong>{' '}
          · ~{Math.max(1, Math.round(routeInfo.durationSec / 60))} min walk
        </div>
      )}
    </>
  );
}
