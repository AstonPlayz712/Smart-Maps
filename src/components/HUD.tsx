import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type {
  NavigationRoute,
  NavigationState
} from '../services/NavigationService';

interface Props {
  engine?: SmartMapsEngine;
  ready: boolean;
}

export default function HUD({ engine, ready }: Props) {
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [navState, setNavState] = useState<NavigationState>('idle');

  useEffect(() => {
    if (!engine) return;
    const service = engine.navigationService;
    const offRoute = service.onRouteUpdate((r) => setRoute(r), 'ui');
    const offState = service.onNavigationStateChange((s) => setNavState(s), 'ui');
    return () => {
      offRoute();
      offState();
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
        <button
          title="Clear route"
          onClick={() => engine.navigationService.stopNavigation()}
        >
          ✕
        </button>
      </div>
      {route && (
        <div className="route-info" role="status">
          <strong>{(route.distanceMeters / 1000).toFixed(2)} km</strong>{' '}
          · ~{Math.max(1, Math.round(route.durationSec / 60))} min walk
          {navState === 'arrived' && <span className="route-arrived"> · arrived</span>}
        </div>
      )}
    </>
  );
}
