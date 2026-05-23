import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { NavigationState } from '../services/NavigationService';
import LiquidGlass from './LiquidGlass';

interface Props {
  engine?: SmartMapsEngine;
  onOpenSearch: () => void;
}

function distanceLabel(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '—';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function etaLabel(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—';
  const d = new Date(Date.now() + sec * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Bottom control deck — wide LG panel near the bottom.
 *
 *   left   "Where to?" field (tap → opens SearchSheet)
 *   center context button — Start / Stop / End — driven by NavigationState
 *   right  ETA + remaining distance
 */
export default function BottomDeck({ engine, onOpenSearch }: Props) {
  const [state, setState] = useState<NavigationState>('idle');
  const [distance, setDistance] = useState('—');
  const [eta, setEta] = useState('—');

  useEffect(() => {
    if (!engine) return;
    const recompute = () => {
      setState(engine.navigationService.getState());
      setDistance(distanceLabel(engine.navigationService.getRemainingMeters()));
      setEta(etaLabel(engine.navigationService.getEtaSec()));
    };
    recompute();
    const offState = engine.navigationService.onNavigationStateChange(recompute, 'ui');
    const offLoc = engine.navigationService.onLocationUpdate(recompute, 'ui');
    const tick = window.setInterval(recompute, 1000);
    return () => {
      offState();
      offLoc();
      window.clearInterval(tick);
    };
  }, [engine]);

  const active = state === 'navigating' || state === 'starting';
  const arrived = state === 'arrived';

  const actionLabel = arrived ? 'End' : active ? 'Stop' : 'Find';
  const actionDisabled = !engine || (!active && !arrived ? false : false); // never disabled
  const onAction = () => {
    if (!engine) return;
    if (active || arrived) {
      engine.navigationService.stopNavigation();
    } else {
      onOpenSearch();
    }
  };

  return (
    <div className="bottom-deck-wrap">
      <LiquidGlass className="bottom-deck" thickness="medium" glow="subtle">
        <button
          type="button"
          className="deck-search"
          onClick={onOpenSearch}
          aria-label="Where to?"
        >
          <span className="search-icon" aria-hidden>◎</span>
          <span className="search-placeholder">Where to?</span>
        </button>
        <button
          type="button"
          className={`deck-action ${active || arrived ? 'stop' : 'start'}`}
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
        <div className="deck-eta" aria-label="Trip metrics">
          <div className="eta-distance">{distance}</div>
          <div className="eta-arrival">{eta}</div>
        </div>
      </LiquidGlass>
    </div>
  );
}
