import { BaseLocationProvider } from '../BaseLocationProvider';
import type { ProviderId } from '../types';

/**
 * Manual fallback. The user (or any debug surface) sets a fixed position and
 * the provider publishes it as a fix. Always available, never refuses — this
 * is the floor that keeps the system functional when every other provider
 * has failed, gone offline, or been denied permission.
 */
export class ManualProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'manual';
  readonly name = 'Manual Fallback';

  isAvailable(): boolean {
    return true;
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  setPosition(lat: number, lng: number, accuracy = 100): void {
    if (!this.active) return;
    this.publish({
      lat,
      lng,
      accuracy,
      source: this.id,
      timestamp: Date.now()
    });
  }
}
