import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { NavigationState } from '../services/NavigationService';

interface Props {
  engine?: SmartMapsEngine;
  ready: boolean;
}

/**
 * Small, flat camera control cluster. Sits in the right margin, gets out of
 * the way during navigation. No rounded bubbles, no shadows — engineered.
 */
export default function CameraControls({ engine, ready }: Props) {
  const [navState, setNavState] = useState<NavigationState>('idle');

  useEffect(() => {
    if (!engine) return;
    return engine.navigationService.onNavigationStateChange((s) => setNavState(s), 'ui');
  }, [engine]);

  if (!engine || !ready) return null;
  const navigating = navState === 'navigating' || navState === 'starting';

  return (
    <div className="in-camctrl" aria-label="Camera controls">
      <button onClick={() => engine.askMaps.run('reset')} title="Reset bearing">⌂</button>
      <button onClick={() => engine.askMaps.run('flat')} title="Top-down">▭</button>
      <button onClick={() => engine.askMaps.run('cinematic')} title="Cinematic tilt">◭</button>
      {!navigating && (
        <>
          <button onClick={() => engine.askMaps.run('cinematic tour')} title="Cinematic tour">▶</button>
          <button onClick={() => engine.askMaps.run('stop')} title="Stop motion">■</button>
        </>
      )}
      {navigating && (
        <button
          onClick={() => engine.navigationService.stopNavigation()}
          title="End navigation"
          className="danger"
        >
          ✕
        </button>
      )}
    </div>
  );
}
