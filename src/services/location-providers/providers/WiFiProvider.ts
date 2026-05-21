import { BaseLocationProvider } from '../BaseLocationProvider';
import type { ProviderId } from '../types';

/**
 * Wi-Fi positioning. Browsers don't expose raw RSSI / SSID, so we delegate
 * to the OS via `navigator.geolocation` which under the hood uses Wi-Fi
 * (and cell, when on a cellular device) for non-GPS fixes. This means the
 * provider works on phones with no GPS *and* on laptops with no SIM —
 * exactly the scenarios LocationProviders exists to cover.
 *
 * We deliberately request `enableHighAccuracy: false` so the OS prefers the
 * Wi-Fi / IP path over the GPS chip.
 */
export class WiFiProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'wifi';
  readonly name = 'Wi-Fi Positioning';

  private watchId: number | null = null;

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  start(): void {
    if (this.active || !this.isAvailable()) return;
    this.active = true;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.publish({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy ?? undefined,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          source: this.id,
          timestamp: pos.timestamp
        });
      },
      (err) => {
        console.warn('[wifi] geolocation error', err.message);
      },
      { enableHighAccuracy: false, maximumAge: 10000, timeout: 12000 }
    );
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.active = false;
  }
}
