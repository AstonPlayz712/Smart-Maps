import type {
  LocationFix,
  LocationListener,
  LocationProvider,
  ProviderId,
  ProviderInfo,
  Unsubscribe
} from './types';
import { SensorFusionProvider } from './providers/SensorFusionProvider';

const STALE_FIX_MS = 8000;

/**
 * LocationProviders — single fan-in for every positioning source in Smart Maps OS.
 *
 * Holds one instance of each registered `LocationProvider`. The "primary" provider's
 * fixes are always accepted. Other providers' fixes only commit if the primary has
 * gone quiet for `STALE_FIX_MS`, so the facade falls back gracefully on devices
 * without GPS, without SIM, indoors, or with the screen reader off.
 *
 * Absolute fixes from any provider re-seed the SensorFusionProvider so dead
 * reckoning stays anchored.
 *
 * Public surface mirrors what every other module wants from "location":
 *
 *   getLocation()                       — latest committed fix
 *   onLocationUpdate(cb)                — subscribe to committed fixes
 *   setPrimaryProvider(providerId)      — switch the authoritative source
 */
export class LocationProviders {
  private providers = new Map<ProviderId, LocationProvider>();
  private providerOrder: ProviderId[] = [];
  private primaryId: ProviderId;
  private currentFix: LocationFix | null = null;
  private subs = new Set<LocationListener>();
  private providerUnsubs = new Map<ProviderId, Unsubscribe>();
  private started = false;

  constructor(providers: LocationProvider[], primaryId: ProviderId) {
    for (const p of providers) {
      this.providers.set(p.id, p);
      this.providerOrder.push(p.id);
    }
    if (!this.providers.has(primaryId)) {
      throw new Error(`[LocationProviders] primary "${primaryId}" not registered`);
    }
    this.primaryId = primaryId;
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const [id, p] of this.providers) {
      try {
        p.start();
      } catch (err) {
        console.warn(`[LocationProviders] failed to start ${id}`, err);
      }
      this.providerUnsubs.set(id, p.onUpdate((fix) => this.onProviderFix(fix)));
    }
  }

  stop(): void {
    if (!this.started) return;
    for (const [id, p] of this.providers) {
      this.providerUnsubs.get(id)?.();
      try {
        p.stop();
      } catch {
        /* swallow — best-effort tear-down */
      }
    }
    this.providerUnsubs.clear();
    this.subs.clear();
    this.started = false;
  }

  // ─── public API (spec) ────────────────────────────────────────────────────

  getLocation(): LocationFix | null {
    return this.currentFix;
  }

  onLocationUpdate(cb: LocationListener): Unsubscribe {
    this.subs.add(cb);
    if (this.currentFix) {
      try {
        cb(this.currentFix);
      } catch (err) {
        console.error('[LocationProviders] subscriber error', err);
      }
    }
    return () => {
      this.subs.delete(cb);
    };
  }

  setPrimaryProvider(providerId: ProviderId): void {
    if (!this.providers.has(providerId)) {
      console.warn(`[LocationProviders] unknown provider "${providerId}"`);
      return;
    }
    if (providerId === this.primaryId) return;
    this.primaryId = providerId;

    // Make sure the new primary is producing. Push-driven providers (manual,
    // autoex, bluetooth) are no-op `start`s; scanners (wifi, sensors) will
    // begin emitting on next event.
    this.providers.get(providerId)?.start();

    // Adopt the new primary's last known fix immediately so subscribers don't
    // wait for the next event tick.
    const last = this.providers.get(providerId)?.getLast();
    if (last) this.commitFix(last);
  }

  // ─── introspection ────────────────────────────────────────────────────────

  getPrimary(): ProviderId {
    return this.primaryId;
  }

  getProvider<T extends LocationProvider = LocationProvider>(id: ProviderId): T | undefined {
    return this.providers.get(id) as T | undefined;
  }

  listProviders(): ProviderInfo[] {
    return this.providerOrder.map((id) => {
      const p = this.providers.get(id)!;
      return {
        id,
        name: p.name,
        available: p.isAvailable(),
        active: p.isActive(),
        primary: id === this.primaryId,
        lastAt: p.getLast()?.timestamp ?? null
      };
    });
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private onProviderFix(fix: LocationFix): void {
    const now = Date.now();

    if (fix.source === this.primaryId) {
      this.commitFix(fix);
    } else {
      // Accept fallback fixes only when the primary has gone stale, OR when no
      // fix has ever been committed (cold start).
      const stale = !this.currentFix || now - this.currentFix.timestamp > STALE_FIX_MS;
      if (stale) this.commitFix(fix);
    }

    // Always re-seed sensor fusion with absolute fixes so dead reckoning has an
    // anchor — but skip self-feed to avoid an oscillation loop.
    if (fix.source !== 'sensor-fusion') {
      const sf = this.providers.get('sensor-fusion') as SensorFusionProvider | undefined;
      if (sf && sf.isActive()) sf.seed(fix.lat, fix.lng, fix.accuracy);
    }
  }

  private commitFix(fix: LocationFix): void {
    this.currentFix = fix;
    this.subs.forEach((cb) => {
      try {
        cb(fix);
      } catch (err) {
        console.error('[LocationProviders] subscriber error', err);
      }
    });
  }
}
