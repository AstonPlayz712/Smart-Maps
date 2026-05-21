import { BaseLocationProvider } from '../BaseLocationProvider';
import type { LocationFix, ProviderId } from '../types';

/**
 * AutoEx location stream. The companion device (AutoOSM HUD, watch, glasses,
 * roof-mounted GNSS, …) pushes fixes here over the AutoEx transport. The
 * provider is purely a receiver — `start` flips a gate, `pushFix` is how the
 * AutoExBridge drops new positions in after decoding `location:fix` packets.
 *
 * This makes Smart Maps OS work on devices with no GPS and no SIM: the
 * companion does the locating, the headless host displays it.
 */
export class AutoExLocationProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'autoex';
  readonly name = 'AutoEx Stream';

  isAvailable(): boolean {
    return true;
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  pushFix(fix: Omit<LocationFix, 'source' | 'timestamp'> & { timestamp?: number }): void {
    if (!this.active) return;
    this.publish({
      ...fix,
      source: this.id,
      timestamp: fix.timestamp ?? Date.now()
    });
  }
}
