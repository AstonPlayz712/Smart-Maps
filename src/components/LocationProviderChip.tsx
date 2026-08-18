import { useEffect, useState } from 'react';
import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { ProviderId, ProviderInfo } from '../services/location-providers/types';

interface Props {
  engine?: SmartMapsEngine;
}

const ICON: Record<ProviderId, string> = {
  devshell: '⧉',
  wifi: '⌖',
  bluetooth: 'ᛒ',
  autoex: '⌬',
  'sensor-fusion': '◉',
  manual: '✎'
};

/**
 * Small status chip showing the current primary location provider, with a
 * popover for switching between sources. Talks ONLY to engine.locationProviders.
 */
export default function LocationProviderChip({ engine }: Props) {
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState<ProviderId>('wifi');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    if (!engine) return;
    const refresh = () => {
      setPrimary(engine.locationProviders.getPrimary());
      setProviders(engine.locationProviders.listProviders());
    };
    refresh();
    // Refresh the snapshot whenever a fix lands so "active" / "lastAt" stay current.
    const off = engine.locationProviders.onLocationUpdate(() => refresh());
    const id = window.setInterval(refresh, 4000);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [engine]);

  if (!engine) return null;

  const select = (id: ProviderId) => {
    engine.locationProviders.setPrimaryProvider(id);
    setPrimary(id);
    setOpen(false);
  };

  const active = providers.find((p) => p.id === primary);

  return (
    <div className="provider-chip-wrap">
      <button
        className="provider-chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Location provider: ${active?.name ?? primary}`}
      >
        <span className="provider-icon" aria-hidden>
          {ICON[primary]}
        </span>
        <span className="provider-label">{active?.name ?? primary}</span>
        <span className="provider-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="provider-menu" role="listbox" aria-label="Location providers">
          {providers.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.primary}
              className={p.primary ? 'primary' : ''}
            >
              <button onClick={() => select(p.id)} disabled={!p.available}>
                <span className="provider-icon" aria-hidden>{ICON[p.id]}</span>
                <span className="provider-name">{p.name}</span>
                <span className="provider-meta">
                  {!p.available
                    ? 'unavailable'
                    : p.primary
                      ? 'primary'
                      : p.active
                        ? 'standby'
                        : 'idle'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
