import type { NavigationService } from '../../services/NavigationService';
import type { AutoExLocationProvider } from '../../services/location-providers/providers/AutoExLocationProvider';
import { BluetoothLETransport } from './transports/BluetoothLETransport';
import { LocalWebSocketTransport } from './transports/LocalWebSocketTransport';
import { WiFiDirectTransport } from './transports/WiFiDirectTransport';
import type {
  Transport,
  TransportId,
  TransportStatus,
  Unsubscribe
} from './transports/Transport';

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface BridgePacket {
  event: string;
  payload: unknown;
  at: number;
}

export interface BridgeStatusSnapshot {
  status: BridgeStatus;
  transport: TransportId | null;
  transportName: string | null;
  lastSent: BridgePacket | null;
  lastReceived: BridgePacket | null;
  candidates: { id: TransportId; name: string; status: TransportStatus; available: boolean }[];
}

type Handler = (payload: unknown) => void;
type StatusListener = (snap: BridgeStatusSnapshot) => void;

/**
 * AutoExBridge — the external transport layer for Smart Maps OS.
 *
 * Picks the first available transport in priority order:
 *   1. Wi-Fi Direct  (stubbed, preferred — high bandwidth p2p)
 *   2. Bluetooth LE  (Web Bluetooth, AutoEx service UUID)
 *   3. Local WebSocket  (dev fallback, ws://localhost:8765)
 *
 * Outgoing: NavigationService events ('navigation:state', 'navigation:route',
 * 'navigation:location') are forwarded to the active transport.
 *
 * Incoming: 'location:fix' packets are routed to AutoExLocationProvider, which
 * pushes them into the LocationProviders facade.
 *
 * The name "AutoLink" is reserved for the AI router that will live inside
 * AutoOSM — not this codebase. This is the external bridge.
 */
export class AutoExBridge {
  private transports: Transport[];
  private active: Transport | null = null;
  private status: BridgeStatus = 'disconnected';

  private handlers = new Map<string, Set<Handler>>();
  private statusListeners = new Set<StatusListener>();

  private lastSent: BridgePacket | null = null;
  private lastReceived: BridgePacket | null = null;

  private activeMessageUnsub: Unsubscribe | null = null;
  private navUnsubs: Unsubscribe[] = [];
  private providerUnsubs: Unsubscribe[] = [];

  constructor(transports?: Transport[]) {
    this.transports = transports ?? [
      new WiFiDirectTransport(),
      new BluetoothLETransport(),
      new LocalWebSocketTransport()
    ];
  }

  // ─── public API ───────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.setStatus('connecting');

    for (const t of this.transports) {
      let available = false;
      try {
        available = await t.isAvailable();
      } catch {
        available = false;
      }
      if (!available) continue;

      try {
        await t.connect();
        this.active = t;
        this.activeMessageUnsub = t.onMessage((msg) => this.handleIncoming(msg));
        this.setStatus('connected');
        return;
      } catch (err) {
        console.warn(`[AutoExBridge] ${t.id} failed, trying next`, err);
      }
    }

    this.active = null;
    this.setStatus('failed');
  }

  async disconnect(): Promise<void> {
    this.activeMessageUnsub?.();
    this.activeMessageUnsub = null;
    if (this.active) {
      try {
        await this.active.disconnect();
      } catch {
        /* swallow — best-effort */
      }
    }
    this.active = null;
    this.setStatus('disconnected');
  }

  send(event: string, payload: unknown): void {
    if (!this.active || this.status !== 'connected') return;
    this.active.send(event, payload);
    this.lastSent = { event, payload, at: Date.now() };
    this.notifyStatus();
  }

  on(event: string, cb: Handler): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(cb);
    this.handlers.set(event, set);
    return () => {
      set.delete(cb);
    };
  }

  getStatus(): BridgeStatusSnapshot {
    return {
      status: this.status,
      transport: this.active?.id ?? null,
      transportName: this.active?.name ?? null,
      lastSent: this.lastSent,
      lastReceived: this.lastReceived,
      candidates: this.transports.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.getStatus(),
        available: !!t.isAvailable()
      }))
    };
  }

  onStatusChange(cb: StatusListener): Unsubscribe {
    this.statusListeners.add(cb);
    try {
      cb(this.getStatus());
    } catch (err) {
      console.error('[AutoExBridge] status subscriber', err);
    }
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  // ─── integrations ─────────────────────────────────────────────────────────

  /**
   * Subscribe to NavigationService and forward state / route / location events
   * out over the active transport.
   */
  attachNavigationService(service: NavigationService): void {
    this.detachNavigationService();
    this.navUnsubs.push(
      service.onLocationUpdate((loc) => {
        this.send('navigation:location', { lat: loc.lat, lon: loc.lng });
      }, 'autoex'),
      service.onRouteUpdate((route) => {
        if (!route) {
          this.send('navigation:route', null);
          return;
        }
        this.send('navigation:route', {
          origin: { lat: route.origin.lat, lon: route.origin.lng },
          destination: { lat: route.destination.lat, lon: route.destination.lng },
          distanceMeters: route.distanceMeters,
          durationSec: route.durationSec,
          startedAt: route.startedAt
        });
      }, 'autoex'),
      service.onNavigationStateChange((state) => {
        this.send('navigation:state', { state });
      }, 'autoex')
    );
  }

  detachNavigationService(): void {
    this.navUnsubs.forEach((fn) => fn());
    this.navUnsubs = [];
  }

  /**
   * Pipe inbound `location:fix` packets from the wire into the AutoEx location
   * provider, which in turn surfaces them through LocationProviders.
   */
  attachLocationProvider(provider: AutoExLocationProvider): void {
    this.detachLocationProvider();
    this.providerUnsubs.push(
      this.on('location:fix', (raw) => {
        const payload = raw as {
          lat?: number;
          lon?: number;
          lng?: number;
          accuracy?: number;
          heading?: number | null;
          speed?: number | null;
        };
        const lat = payload?.lat;
        const lng = payload?.lon ?? payload?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        provider.pushFix({
          lat,
          lng,
          accuracy: payload.accuracy,
          heading: payload.heading,
          speed: payload.speed
        });
      })
    );
  }

  detachLocationProvider(): void {
    this.providerUnsubs.forEach((fn) => fn());
    this.providerUnsubs = [];
  }

  destroy(): void {
    this.detachNavigationService();
    this.detachLocationProvider();
    this.handlers.clear();
    this.statusListeners.clear();
    void this.disconnect();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private handleIncoming(msg: { event: string; payload: unknown }): void {
    this.lastReceived = { event: msg.event, payload: msg.payload, at: Date.now() };
    this.handlers.get(msg.event)?.forEach((cb) => {
      try {
        cb(msg.payload);
      } catch (err) {
        console.error('[AutoExBridge] handler error', err);
      }
    });
    this.handlers.get('*')?.forEach((cb) => {
      try {
        cb({ event: msg.event, payload: msg.payload });
      } catch (err) {
        console.error('[AutoExBridge] wildcard handler', err);
      }
    });
    this.notifyStatus();
  }

  private setStatus(next: BridgeStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.notifyStatus();
  }

  private notifyStatus(): void {
    const snap = this.getStatus();
    this.statusListeners.forEach((cb) => {
      try {
        cb(snap);
      } catch (err) {
        console.error('[AutoExBridge] status subscriber', err);
      }
    });
  }
}
