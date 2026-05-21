import { BaseTransport, type TransportId } from './Transport';

declare global {
  interface Navigator {
    // Hypothetical Wi-Fi Direct API. None of the major browsers ship this today;
    // this declaration lets the stub compile cleanly and gives us one obvious
    // surface to swap out when the real shim arrives (Capacitor / Tauri / native).
    wifi?: {
      connect: (opts: { ssid?: string; serviceId?: string }) => Promise<unknown>;
      disconnect?: () => Promise<void>;
    };
  }
}

const LOCAL_OVERRIDE_KEY = 'smartmaps.wifidirect';

/**
 * Wi-Fi Direct transport. Stubbed because no shipping browser exposes
 * peer-to-peer Wi-Fi APIs from a regular page; production will sit on top of a
 * native shim (Android NSD, iOS Multipeer, Tauri/Capacitor plugin, etc).
 *
 * For development you can opt in to the simulation by setting
 *   localStorage.setItem('smartmaps.wifidirect', 'enabled')
 *
 * When the simulation is enabled the transport pretends to be a stable
 * high-bandwidth link and loops sent packets back to onMessage handlers after
 * ~5 ms — useful for end-to-end testing of the bridge without real hardware.
 */
export class WiFiDirectTransport extends BaseTransport {
  readonly id: TransportId = 'wifi-direct';
  readonly name = 'Wi-Fi Direct';

  isAvailable(): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.wifi?.connect === 'function') {
      return true;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(LOCAL_OVERRIDE_KEY) === 'enabled';
      } catch {
        return false;
      }
    }
    return false;
  }

  async connect(): Promise<void> {
    if (this.status === 'connected') return;
    this.status = 'connecting';

    if (typeof navigator !== 'undefined' && navigator.wifi?.connect) {
      await navigator.wifi.connect({ serviceId: 'smart-maps-os' });
    } else {
      // Simulated link: 200 ms negotiation, then "stable".
      await new Promise((r) => window.setTimeout(r, 200));
    }
    this.status = 'connected';
  }

  async disconnect(): Promise<void> {
    if (this.status === 'disconnected') return;
    try {
      await navigator?.wifi?.disconnect?.();
    } catch {
      /* noop — stub */
    }
    this.status = 'disconnected';
  }

  send(event: string, payload: unknown): void {
    if (this.status !== 'connected') return;
    // Loopback so the bridge has something to react to during dev testing.
    const msg = { event, payload };
    window.setTimeout(() => this.dispatchMessage(msg), 5);
  }
}
