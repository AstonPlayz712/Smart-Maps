import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { NavigationState } from '../services/NavigationService';
import LiquidGlass from './LiquidGlass';

interface Props {
  engine?: SmartMapsEngine;
}

interface NavSnapshot {
  visible: boolean;
  arrow: string;
  distance: string;
  street: string;
  lanes: Array<{ active: boolean }>;
  state: NavigationState;
}

function distanceLabel(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return '—';
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Floating LG navigation banner.
 *
 * Centered above the map, only visible during 'starting' / 'navigating' /
 * 'arrived'. Shows a 3D-styled turn arrow, the distance + destination
 * name, and lane hints as thin glass bars under the text. Lanes come from
 * SmModules.laneEngine (stub-empty in proto) so the bar set is honestly
 * blank until the Auto-class lane engine lands.
 */
export default function NavBanner({ engine }: Props) {
  const [snap, setSnap] = useState<NavSnapshot>({
    visible: false,
    arrow: '↑',
    distance: '',
    street: '',
    lanes: [],
    state: 'idle'
  });

  useEffect(() => {
    if (!engine) return;

    const recompute = () => {
      const state = engine.navigationService.getState();
      const remaining = engine.navigationService.getRemainingMeters();
      const dest = engine.navigationService.getDestination();
      const destPoi = dest
        ? engine.sm.spatialGraph.findNearest(dest.lat, dest.lng)
        : null;
      const visible =
        state === 'navigating' || state === 'starting' || state === 'arrived';
      setSnap({
        visible,
        arrow: state === 'arrived' ? '◆' : '↑',
        distance: state === 'arrived' ? 'Arrived' : distanceLabel(remaining),
        street: destPoi?.name ?? 'Destination',
        lanes: [], // LaneEngine stub returns []; Auto-class build will populate.
        state
      });
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

  return (
    <div className={`nav-banner-wrap ${snap.visible ? 'visible' : 'hidden'}`}>
      <LiquidGlass className="nav-banner" thickness="medium" glow="strong">
        <div className="nav-arrow" aria-hidden>{snap.arrow}</div>
        <div className="nav-text">
          <div className="nav-distance">{snap.distance}</div>
          <div className="nav-street">{snap.street}</div>
        </div>
        {snap.lanes.length > 0 && (
          <div className="nav-lanes" aria-label="Lane guidance">
            {snap.lanes.map((l, i) => (
              <span key={i} className={`nav-lane ${l.active ? 'active' : ''}`} />
            ))}
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}
