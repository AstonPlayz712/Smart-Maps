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
export type SubscriberChannel = 'autoex' | 'ask-maps' | 'ui';

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
  speedMps: number;
  headingDeg: number | null;
  remainingMeters: number | null;
  etaSec: number | null;
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
const SPEED_EMA_ALPHA = 0.4;
const MIN_DELTA_M_FOR_HEADING = 0.5;
const DEFAULT_WALKING_MPS = 1.4;

/**
 * NavigationService — the single source of truth for navigation in Smart Maps OS.
 *
 * Owns:
 *   • current location          (live, fed by LocationProviders)
 *   • current route             (the active polyline + ETA bundle)
 *   • navigation state          (idle / starting / navigating / arrived / stopped)
 *   • destination               (the lat/lng the user is heading to)
 *   • live stats                (smoothed speed, derived heading, remaining, ETA)
 *   • subscribers               (tagged by channel: autoex · ask-maps · ui)
 *
 * Exposes a small surface (startNavigation / stopNavigation + three subscribe
 * methods). Every other module — UI, Ask Maps, AutoEx — coordinates through
 * this service, not the engine. The service in turn calls the engine for the
 * primitive renderer-side work (drawing the polyline, panning the camera) and
 * for entering/exiting Immersive Navigation follow mode.
 */
export class NavigationService {
  private state: NavigationState = 'idle';
  private location: LatLng | null = null;
  private destination: LatLng | null = null;
  private route: NavigationRoute | null = null;

  private speedMps = 0;
  private headingDeg: number | null = null;
  private lastLocAt = 0;

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

    this.locationUnsub = engine.locationProviders.onLocationUpdate((fix) => {
      this.updateLocation(
        { lng: fix.lng, lat: fix.lat },
        {
          speedHintMps: typeof fix.speed === 'number' ? fix.speed : undefined,
          headingHintDeg: typeof fix.heading === 'number' ? fix.heading : undefined
        }
      );
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
    // No fly-to-destination here — IN follow mode locks the camera to the user
    // when route:done fires.
  }

  stopNavigation(): void {
    if (this.destroyed) return;
    const wasActive = this.state !== 'idle' || this.destination !== null;
    this.engine.navigation.exitImmersive();
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
      route: this.route,
      speedMps: this.speedMps,
      headingDeg: this.headingDeg,
      remainingMeters: this.computeRemaining(),
      etaSec: this.computeEta()
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

  getSpeedMps(): number {
    return this.speedMps;
  }

  getSpeedKmh(): number {
    return this.speedMps * 3.6;
  }

  getHeadingDeg(): number | null {
    return this.headingDeg;
  }

  getRemainingMeters(): number | null {
    return this.computeRemaining();
  }

  getEtaSec(): number | null {
    return this.computeEta();
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

  /** Inspect subscriber counts per channel. Handy for debugging AutoEx wiring. */
  getSubscriberCounts(): Record<SubscriberChannel, { location: number; route: number; state: number }> {
    const acc: Record<SubscriberChannel, { location: number; route: number; state: number }> = {
      autoex: { location: 0, route: 0, state: 0 },
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

  private updateLocation(
    loc: LatLng,
    hint: { speedHintMps?: number; headingHintDeg?: number } = {}
  ): void {
    const now = Date.now();
    const prev = this.location;
    const dt = prev && this.lastLocAt ? (now - this.lastLocAt) / 1000 : 0;

    // Heading: hint wins, else derive from positional delta.
    if (typeof hint.headingHintDeg === 'number' && !Number.isNaN(hint.headingHintDeg)) {
      this.headingDeg = hint.headingHintDeg;
    } else if (prev) {
      const dist = haversine(prev, loc);
      if (dist > MIN_DELTA_M_FOR_HEADING) {
        this.headingDeg = bearing(prev, loc);
      }
    }

    // Speed: hint wins, else derive + smooth.
    if (typeof hint.speedHintMps === 'number' && !Number.isNaN(hint.speedHintMps)) {
      this.speedMps = hint.speedHintMps;
    } else if (prev && dt > 0.3 && dt < 30) {
      const instantaneous = haversine(prev, loc) / dt;
      this.speedMps = this.speedMps * (1 - SPEED_EMA_ALPHA) + instantaneous * SPEED_EMA_ALPHA;
    }

    this.location = loc;
    this.lastLocAt = now;

    // Push position + derived heading into the engine so the user marker and
    // RouteEngine origin track the live fix.
    this.engine.navigation.setUserLocation(loc, this.headingDeg);

    // Drive the IN follow camera while we're navigating.
    if (this.state === 'navigating' && this.engine.navigation.isImmersive()) {
      this.engine.navigation.updateFollow(loc, this.speedMps);
    }

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
    const prev = this.state;
    this.state = next;

    // Immersive camera coordination — flip on entering 'navigating', off on
    // leaving the active set.
    if (next === 'navigating' && this.location && this.destination) {
      this.engine.navigation.enterImmersive(this.location, this.destination);
    } else if (
      (next === 'idle' || next === 'stopped' || next === 'arrived') &&
      (prev === 'navigating' || prev === 'starting')
    ) {
      if (next !== 'arrived') {
        this.engine.navigation.exitImmersive();
      }
    }

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

  private computeRemaining(): number | null {
    if (!this.location || !this.destination) return null;
    return haversine(this.location, this.destination);
  }

  private computeEta(): number | null {
    const remaining = this.computeRemaining();
    if (remaining === null) return null;
    const speed = this.speedMps > 0.2 ? this.speedMps : DEFAULT_WALKING_MPS;
    return remaining / speed;
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

function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
