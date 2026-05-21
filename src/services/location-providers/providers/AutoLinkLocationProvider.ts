import { BaseLocationProvider } from '../BaseLocationProvider';
import type { LocationFix, ProviderId } from '../types';

/**
 * AutoLink location stream. The AutoLink companion device (in-car HUD, watch,
 * glasses) pushes fixes here over the AutoLink transport. The provider is
 * purely a receiver — `start` flips a gate, `pushFix` is how upstream code
 * drops new positions in.
 *
 * This makes Smart Maps OS work on devices with no GPS and no SIM: the
 * companion does the locating, the headless host displays it.
 */
export class AutoLinkLocationProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'autolink';
  readonly name = 'AutoLink Stream';

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
