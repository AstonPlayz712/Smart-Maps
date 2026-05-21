import { useEffect, useState } from 'react';
import type {
  AutoExBridge,
  BridgeStatusSnapshot
} from '../modules/autolink/AutoExBridge';

interface Props {
  bridge: AutoExBridge | null;
}

const TRANSPORT_LABEL: Record<string, string> = {
  'wifi-direct': 'Wi-Fi Direct',
  'bluetooth-le': 'Bluetooth LE',
  websocket: 'WebSocket'
};

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 1) return 'now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function preview(payload: unknown): string {
  if (payload === null || payload === undefined) return 'null';
  try {
    const json = JSON.stringify(payload);
    return json.length > 64 ? json.slice(0, 61) + '…' : json;
  } catch {
    return String(payload);
  }
}

/**
 * Dev-only diagnostics for AutoExBridge — shows the active transport, link
 * status, and the most recent inbound / outbound packet. Mount only when
 * `import.meta.env.DEV` is true.
 */
export default function AutoExDebugOverlay({ bridge }: Props) {
  const [snap, setSnap] = useState<BridgeStatusSnapshot | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    const off = bridge.onStatusChange((s) => setSnap(s));
    const id = window.setInterval(() => setSnap(bridge.getStatus()), 1000);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [bridge]);

  if (!bridge || !snap) return null;

  const handleConnect = async () => {
    setBusy(true);
    try {
      await bridge.connect();
    } catch (err) {
      console.warn('[AutoExDebug] connect failed', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await bridge.disconnect();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`autoex-debug ${open ? 'open' : 'collapsed'}`}>
      <button
        type="button"
        className="autoex-debug-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="AutoEx bridge"
      >
        <span className={`autoex-dot ${snap.status}`} aria-hidden />
        <span className="autoex-toggle-label">AutoEx</span>
      </button>
      {open && (
        <div className="autoex-debug-body">
          <div className="autoex-row">
            <span>Transport</span>
            <strong>
              {snap.transport ? TRANSPORT_LABEL[snap.transport] ?? snap.transport : '—'}
            </strong>
          </div>
          <div className="autoex-row">
            <span>Status</span>
            <strong className={`autoex-status ${snap.status}`}>{snap.status}</strong>
          </div>
          <div className="autoex-row column">
            <span>Last sent</span>
            <code>
              {snap.lastSent
                ? `${snap.lastSent.event}  ${preview(snap.lastSent.payload)}  · ${ago(snap.lastSent.at)}`
                : '—'}
            </code>
          </div>
          <div className="autoex-row column">
            <span>Last received</span>
            <code>
              {snap.lastReceived
                ? `${snap.lastReceived.event}  ${preview(snap.lastReceived.payload)}  · ${ago(snap.lastReceived.at)}`
                : '—'}
            </code>
          </div>
          <div className="autoex-candidates">
            {snap.candidates.map((c) => (
              <span
                key={c.id}
                className={`autoex-tag ${c.id === snap.transport ? 'on' : c.available ? 'avail' : 'off'}`}
                title={`${c.name} · ${c.status}`}
              >
                {TRANSPORT_LABEL[c.id] ?? c.id}
              </span>
            ))}
          </div>
          <div className="autoex-actions">
            {snap.status === 'connected' ? (
              <button type="button" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </button>
            ) : (
              <button type="button" onClick={handleConnect} disabled={busy}>
                {snap.status === 'failed' ? 'Retry' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
