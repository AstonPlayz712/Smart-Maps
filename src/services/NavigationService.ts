import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import type { LatLng } from '../engine/types';

/**
 * Navigation state machine.
 *
 *   idle ──startNavigation──▶ starting ──route:done──▶ navigating
 *    ▲                             │                       │
 *    │                             │                       │ (distance to dest
 *    │                             │                       │  drops below
 *    │                             ▼                       ▼  ARRIVAL_THRESHOLD)
 *    └──stopNavigation────── stopped ◀──stopNavigation── arrived
 */
export type NavigationState = 'idle' | 'starting' | 'navigating' | 'arrived' | 'stopped';

/** Tag for the originating module of a subscription. Useful for diagnostics. */
export type SubscriberChannel = 'autolink' | 'ask-maps' | 'ui';

export interface NavigationRoute {
  origin: LatLng;
  destination: LatLng;
  distanceMeters: number;
  durationSec: number;
  startedAt: number;
}

export interface NavigationSnapshot {
  state: NavigationState;
  location: LatLng | null;
  destination: LatLng | null;
  route: NavigationRoute | null;
}

export type LocationListener = (location: LatLng) => void;
export type RouteListener = (route: NavigationRoute | null) => void;
export type NavigationStateListener = (state: NavigationState) => void;

interface Subscriber<T> {
  cb: T;
  channel: SubscriberChannel;
}

export type Unsubscribe = () => void;

const ARRIVAL_THRESHOLD_M = 35;

/**
 * NavigationService — the single source of truth for navigation in Smart Maps OS.
 *
 * Owns:
 *   • current location          (live, watched via geolocation)
 *   • current route             (the active polyline + ETA bundle)
 *   • navigation state          (idle / starting / navigating / arrived / stopped)
 *   • destination               (the lat/lng the user is heading to)
 *   • subscribers               (tagged by channel: autolink · ask-maps · ui)
 *
 * Exposes a small surface (startNavigation / stopNavigation + three subscribe
 * methods). Every other module — UI, Ask Maps, AutoLink — coordinates through
 * this service, not the engine. The service in turn calls the engine for the
 * primitive renderer-side work (drawing the polyline, panning the camera).
 */
export class NavigationService {
  private state: NavigationState = 'idle';
  private location: LatLng | null = null;
  private destination: LatLng | null = null;
  private route: NavigationRoute | null = null;

  private locationSubs = new Set<Subscriber<LocationListener>>();
  private routeSubs = new Set<Subscriber<RouteListener>>();
  private stateSubs = new Set<Subscriber<NavigationStateListener>>();

  private engineUnsubs: Unsubscribe[] = [];
  private locationUnsub: Unsubscribe | null = null;
  private destroyed = false;

  constructor(private engine: SmartMapsEngine) {
    const seed = engine.locationProviders.getLocation();
    if (seed) this.location = { lng: seed.lng, lat: seed.lat };

    this.engineUnsubs.push(
      engine.bus.on('route:done', ({ distanceMeters, durationSec }) => {
        if (!this.destination || !this.location) return;
        this.route = {
          origin: this.location,
          destination: this.destination,
          distanceMeters,
          durationSec,
          startedAt: Date.now()
        };
        this.fireRoute();
        this.setState('navigating');
      }),
      engine.bus.on('route:clear', () => {
        if (this.route === null && this.destination === null) return;
        this.route = null;
        this.destination = null;
        this.fireRoute();
        if (this.state !== 'idle') this.setState('idle');
      })
    );

    // Location comes exclusively from LocationProviders. This is what lets the
    // OS run on devices without GPS or SIM — the facade picks whichever
    // provider (Wi-Fi, beacons, AutoLink, sensor fusion, manual) is healthy.
    this.locationUnsub = engine.locationProviders.onLocationUpdate((fix) => {
      this.updateLocation({ lng: fix.lng, lat: fix.lat });
    });
  }

  // ─── public API ───────────────────────────────────────────────────────────

  startNavigation(destination: LatLng): void {
    if (this.destroyed) return;

    const origin = this.location ?? this.fallbackLocation();
    if (!origin) {
      console.warn('[NavigationService] no origin available');
      return;
    }
    this.location = origin;
    this.destination = destination;
    this.setState('starting');

    this.engine.navigation.drawRoute(destination, origin);
    this.engine.navigation.flyToPoint([destination.lng, destination.lat], {
      zoom: 16.4,
      pitch: 66,
      duration: 2000
    });
    // engine emits 'route:done' → service flips to 'navigating' and fires route.
  }

  stopNavigation(): void {
    if (this.destroyed) return;
    const wasActive = this.state !== 'idle' || this.destination !== null;
    this.engine.navigation.clearRoute();
    this.destination = null;
    this.route = null;
    this.fireRoute();
    if (wasActive) {
      this.setState('stopped');
      this.setState('idle');
    }
  }

  getSnapshot(): NavigationSnapshot {
    return {
      state: this.state,
      location: this.location,
      destination: this.destination,
      route: this.route
    };
  }

  getLocation(): LatLng | null {
    return this.location;
  }

  getRoute(): NavigationRoute | null {
    return this.route;
  }

  getState(): NavigationState {
    return this.state;
  }

  getDestination(): LatLng | null {
    return this.destination;
  }

  // ─── subscriptions ────────────────────────────────────────────────────────

  onLocationUpdate(cb: LocationListener, channel: SubscriberChannel = 'ui'): Unsubscribe {
    const sub: Subscriber<LocationListener> = { cb, channel };
    this.locationSubs.add(sub);
    if (this.location) this.safeFire(() => cb(this.location!));
    return () => {
      this.locationSubs.delete(sub);
    };
  }

  onRouteUpdate(cb: RouteListener, channel: SubscriberChannel = 'ui'): Unsubscribe {
    const sub: Subscriber<RouteListener> = { cb, channel };
    this.routeSubs.add(sub);
    this.safeFire(() => cb(this.route));
    return () => {
      this.routeSubs.delete(sub);
    };
  }

  onNavigationStateChange(
    cb: NavigationStateListener,
    channel: SubscriberChannel = 'ui'
  ): Unsubscribe {
    const sub: Subscriber<NavigationStateListener> = { cb, channel };
    this.stateSubs.add(sub);
    this.safeFire(() => cb(this.state));
    return () => {
      this.stateSubs.delete(sub);
    };
  }

  /** Inspect subscriber counts per channel. Handy for debugging AutoLink wiring. */
  getSubscriberCounts(): Record<SubscriberChannel, { location: number; route: number; state: number }> {
    const acc: Record<SubscriberChannel, { location: number; route: number; state: number }> = {
      autolink: { location: 0, route: 0, state: 0 },
      'ask-maps': { location: 0, route: 0, state: 0 },
      ui: { location: 0, route: 0, state: 0 }
    };
    this.locationSubs.forEach((s) => (acc[s.channel].location += 1));
    this.routeSubs.forEach((s) => (acc[s.channel].route += 1));
    this.stateSubs.forEach((s) => (acc[s.channel].state += 1));
    return acc;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.locationUnsub?.();
    this.locationUnsub = null;
    this.engineUnsubs.forEach((fn) => fn());
    this.engineUnsubs = [];
    this.locationSubs.clear();
    this.routeSubs.clear();
    this.stateSubs.clear();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private updateLocation(loc: LatLng): void {
    this.location = loc;
    // Keep the engine's RouteEngine origin in sync so any direct drawRoute()
    // call without an explicit `from` uses the live position.
    this.engine.navigation.setUserLocation(loc);
    this.locationSubs.forEach((s) => this.safeFire(() => s.cb(loc)));

    if (this.state === 'navigating' && this.destination) {
      const remaining = haversine(loc, this.destination);
      if (remaining < ARRIVAL_THRESHOLD_M) {
        this.setState('arrived');
      }
    }
  }

  private setState(next: NavigationState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateSubs.forEach((s) => this.safeFire(() => s.cb(next)));
  }

  private fireRoute(): void {
    this.routeSubs.forEach((s) => this.safeFire(() => s.cb(this.route)));
  }

  private fallbackLocation(): LatLng | null {
    const map = this.engine.getMap();
    if (!map) return null;
    const c = map.getCenter();
    return { lng: c.lng, lat: c.lat };
  }

  private safeFire(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('[NavigationService] subscriber error', err);
    }
  }
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
