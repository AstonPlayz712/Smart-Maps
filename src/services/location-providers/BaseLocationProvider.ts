import type {
  LocationFix,
  LocationListener,
  LocationProvider,
  ProviderId,
  Unsubscribe
} from './types';

/**
 * Shared base for location providers. Handles subscriber bookkeeping and the
 * last-known-fix cache so concrete providers only need to implement their
 * source-specific scanning/ingestion logic.
 */
export abstract class BaseLocationProvider implements LocationProvider {
  abstract readonly id: ProviderId;
  abstract readonly name: string;

  protected lastFix: LocationFix | null = null;
  protected active = false;

  private subs = new Set<LocationListener>();

  abstract start(): Promise<void> | void;
  abstract stop(): void;
  abstract isAvailable(): boolean;

  isActive(): boolean {
    return this.active;
  }

  getLast(): LocationFix | null {
    return this.lastFix;
  }

  onUpdate(cb: LocationListener): Unsubscribe {
    this.subs.add(cb);
    if (this.lastFix) {
      try {
        cb(this.lastFix);
      } catch (err) {
        console.error(`[${this.id}] subscriber error`, err);
      }
    }
    return () => {
      this.subs.delete(cb);
    };
  }

  protected publish(fix: LocationFix): void {
    this.lastFix = fix;
    this.subs.forEach((cb) => {
      try {
        cb(fix);
      } catch (err) {
        console.error(`[${this.id}] subscriber error`, err);
      }
    });
  }
}
