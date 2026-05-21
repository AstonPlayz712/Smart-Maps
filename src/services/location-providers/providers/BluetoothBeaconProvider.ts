import { BaseLocationProvider } from '../BaseLocationProvider';
import type { ProviderId } from '../types';

export interface KnownBeacon {
  id: string;
  lat: number;
  lng: number;
  /** Human-readable label for diagnostics. */
  label?: string;
}

interface Detection {
  rssi: number;
  at: number;
}

const DETECTION_TTL_MS = 8000;

/**
 * Bluetooth beacon positioning. Web Bluetooth can't currently passive-scan for
 * iBeacon/Eddystone advertisements from a regular page, so we expose an
 * ingestion API instead:
 *
 *   • `registerBeacon` — declare a known beacon's position
 *   • `feedDetection`  — push a (beaconId, rssi) reading from a native shim,
 *                        an AutoEx companion device, or a synthetic source
 *
 * The provider trilaterates with an RSSI-weighted centroid across whatever
 * detections are still within their TTL window. Good-enough for indoor
 * positioning when GPS / Wi-Fi are unavailable.
 */
export class BluetoothBeaconProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'bluetooth';
  readonly name = 'Bluetooth Beacons';

  private beacons = new Map<string, KnownBeacon>();
  private detections = new Map<string, Detection>();
  private expiryTimer: number | null = null;

  isAvailable(): boolean {
    // The provider itself is always usable (it's push-driven). Web Bluetooth is
    // only required for live scanning, which would be a future enhancement.
    return true;
  }

  registerBeacon(beacon: KnownBeacon): void {
    this.beacons.set(beacon.id, beacon);
  }

  registerBeacons(beacons: KnownBeacon[]): void {
    beacons.forEach((b) => this.registerBeacon(b));
  }

  feedDetection(beaconId: string, rssi: number): void {
    if (!this.active) return;
    this.detections.set(beaconId, { rssi, at: Date.now() });
    this.recompute();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.expiryTimer = window.setInterval(() => this.expire(), 2000);
  }

  stop(): void {
    if (this.expiryTimer !== null) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
    this.detections.clear();
    this.active = false;
  }

  private expire(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, d] of this.detections) {
      if (now - d.at > DETECTION_TTL_MS) {
        this.detections.delete(id);
        changed = true;
      }
    }
    if (changed) this.recompute();
  }

  private recompute(): void {
    const valid = Array.from(this.detections.entries())
      .map(([id, d]) => ({ beacon: this.beacons.get(id), rssi: d.rssi }))
      .filter((v): v is { beacon: KnownBeacon; rssi: number } => !!v.beacon);
    if (valid.length === 0) return;

    let sumW = 0;
    let sumLat = 0;
    let sumLng = 0;
    for (const v of valid) {
      // Convert RSSI (negative, closer to 0 = stronger) into a positive weight.
      const w = 1 / (Math.abs(v.rssi) + 1);
      sumW += w;
      sumLat += v.beacon.lat * w;
      sumLng += v.beacon.lng * w;
    }

    this.publish({
      lng: sumLng / sumW,
      lat: sumLat / sumW,
      accuracy: Math.max(5, 30 - valid.length * 3),
      source: this.id,
      timestamp: Date.now()
    });
  }
}
