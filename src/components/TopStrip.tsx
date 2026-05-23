import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { NavigationState } from '../services/NavigationService';

interface Props {
  engine?: SmartMapsEngine;
  onSettings: () => void;
  onMedia: () => void;
}

const MODE_LABELS: Record<NavigationState, string> = {
  idle: 'IN · Auto',
  starting: 'Starting',
  navigating: 'Navigating',
  arrived: 'Arrived',
  stopped: 'Idle'
};

function formatTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Top system strip — very thin bar across the top, not an LG panel.
 *
 *   left   logo + brand + mode label
 *   center status line (time · GPS · network)
 *   right  small icons (media, settings)
 */
export default function TopStrip({ engine, onSettings, onMedia }: Props) {
  const [time, setTime] = useState(formatTime());
  const [navState, setNavState] = useState<NavigationState>('idle');
  const [gpsOk, setGpsOk] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const t = window.setInterval(() => setTime(formatTime()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!engine) return;
    const offState = engine.navigationService.onNavigationStateChange(
      (s) => setNavState(s),
      'ui'
    );
    const offLoc = engine.locationProviders.onLocationUpdate(() => setGpsOk(true));
    const onlineHandler = () => setOnline(navigator.onLine);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', onlineHandler);
    return () => {
      offState();
      offLoc();
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', onlineHandler);
    };
  }, [engine]);

  return (
    <div className="top-strip" role="banner">
      <div className="top-strip-left">
        <span className="brand-mark" aria-hidden>◈</span>
        <span className="brand-name">Smart Maps</span>
        <span className="brand-divider" aria-hidden />
        <span className="mode-label">{MODE_LABELS[navState]}</span>
      </div>
      <div className="top-strip-center">
        <span className="status-time">{time}</span>
        <span className={`status-pill ${gpsOk ? 'ok' : 'pending'}`} title="Location source">
          <span className="status-dot" aria-hidden /> GPS
        </span>
        <span className={`status-pill ${online ? 'ok' : 'off'}`} title="Network status">
          <span className="status-dot" aria-hidden /> NET
        </span>
      </div>
      <div className="top-strip-right">
        <button type="button" className="strip-icon" onClick={onMedia} title="Media">
          ♫
        </button>
        <button type="button" className="strip-icon" onClick={onSettings} title="Settings">
          ⚙
        </button>
      </div>
    </div>
  );
}
