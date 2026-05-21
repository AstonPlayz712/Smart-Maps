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

interface Metrics {
  speedKmh: number;
  remainingM: number | null;
  etaSec: number | null;
}

function formatDistance(m: number | null): string {
  if (m === null) return '—';
  if (m < 950) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatEta(etaSec: number | null): string {
  if (etaSec === null || !Number.isFinite(etaSec)) return '—';
  const d = new Date(Date.now() + etaSec * 1000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatSpeed(kmh: number): string {
  if (kmh < 1) return '0';
  return Math.round(kmh).toString();
}

function nextTurnLabel(state: NavigationState, remainingM: number | null): string {
  if (state === 'arrived') return 'Arrived';
  if (state === 'starting') return 'Computing route';
  if (remainingM === null) return '—';
  if (remainingM < 60) return `Arrive ${Math.round(remainingM)} m`;
  return `Continue ${formatDistance(remainingM)}`;
}

/**
 * Tesla-inspired HUD — flat 4-cell grid, system font, no shadows, no gradients,
 * no rounded bubbles. Only essential data: speed · ETA · distance · next turn.
 *
 * Visible only when navigation is active (state ≠ 'idle').
 */
export default function HUD({ engine, ready }: Props) {
  const [navState, setNavState] = useState<NavigationState>('idle');
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    speedKmh: 0,
    remainingM: null,
    etaSec: null
  });

  useEffect(() => {
    if (!engine) return;
    const service = engine.navigationService;

    const offState = service.onNavigationStateChange((s) => setNavState(s), 'ui');
    const offRoute = service.onRouteUpdate((r) => setRoute(r), 'ui');
    const offLoc = service.onLocationUpdate(() => {
      setMetrics({
        speedKmh: service.getSpeedKmh(),
        remainingM: service.getRemainingMeters(),
        etaSec: service.getEtaSec()
      });
    }, 'ui');

    // Tick at 1 Hz so ETA refreshes even when no fix has arrived.
    const tick = window.setInterval(() => {
      setMetrics({
        speedKmh: service.getSpeedKmh(),
        remainingM: service.getRemainingMeters(),
        etaSec: service.getEtaSec()
      });
    }, 1000);

    return () => {
      offState();
      offRoute();
      offLoc();
      window.clearInterval(tick);
    };
  }, [engine]);

  if (!engine || !ready) return null;
  if (navState === 'idle') return null;

  return (
    <div className="in-hud" role="status" aria-label="Navigation HUD">
      <div className="in-hud-cell">
        <div className="in-hud-value">{formatSpeed(metrics.speedKmh)}</div>
        <div className="in-hud-label">km/h</div>
      </div>
      <div className="in-hud-cell">
        <div className="in-hud-value">{formatEta(metrics.etaSec)}</div>
        <div className="in-hud-label">ETA</div>
      </div>
      <div className="in-hud-cell">
        <div className="in-hud-value">
          {formatDistance(metrics.remainingM ?? route?.distanceMeters ?? null)}
        </div>
        <div className="in-hud-label">Distance</div>
      </div>
      <div className="in-hud-cell wide">
        <div className="in-hud-value">{nextTurnLabel(navState, metrics.remainingM)}</div>
        <div className="in-hud-label">Next Turn</div>
      </div>
    </div>
  );
}
