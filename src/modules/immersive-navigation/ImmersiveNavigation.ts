import type { Map as MlMap } from 'maplibre-gl';
import type { EventBus } from '../../engine/EventBus';
import type { CameraPose, EngineEvents, LatLng } from '../../engine/types';
import { CinematicCamera } from './CinematicCamera';
import { RouteEngine } from './RouteEngine';
import { UserMarker } from './UserMarker';
import { easing } from './easing';

export interface FlyToOpts {
  duration?: number;
  curve?: number;
  pitch?: number;
  bearing?: number;
  zoom?: number;
}

// Tesla-style follow pose parameters
const IN_BASE_PITCH = 55;
const IN_JUNCTION_PITCH_DELTA = 5;     // tilt up 5° on approach
const IN_BASE_ZOOM = 17.5;
const IN_FAST_ZOOM = 16.8;             // > 40 km/h
const IN_SLOW_ZOOM = 17.9;             // < 20 km/h
const IN_JUNCTION_ZOOM_DELTA = -0.4;   // widen FOV slightly
const IN_FOLLOW_DURATION_MS = 900;
const IN_ENTER_DURATION_MS = 1400;
const IN_EXIT_DURATION_MS = 1000;
const SPEED_FAST_MPS = 40 / 3.6;
const SPEED_SLOW_MPS = 20 / 3.6;
const JUNCTION_DISTANCE_M = 60;
const LOOKAHEAD_BASE_M = 25;
const LOOKAHEAD_PER_SEC = 3.5;          // lookahead grows with speed

/**
 * Immersive Navigation — the camera engine.
 *
 *   • CinematicCamera : free-roaming fly / orbit / tour
 *   • RouteEngine     : route polyline + destination marker
 *   • UserMarker      : sharp arrow at live position
 *
 * Adds the Tesla-style follow mode driven by NavigationService:
 *   • Low forward pitch (55°), horizon visible
 *   • Predictive rotation toward the next polyline lookahead
 *   • Speed-adaptive zoom (40+ km/h → out, <20 km/h → in)
 *   • Junction approach (< 60 m to destination): tilt up 5°, widen FOV,
 *     route widens 10 % (RouteEngine handles the stroke transition)
 *
 * All transitions use easeInOutQuad — no bounce, no overshoot.
 */
export class ImmersiveNavigation {
  private map?: MlMap;
  private camera?: CinematicCamera;
  private route?: RouteEngine;
  private userMarker?: UserMarker;
  private userPosition: LatLng | null = null;
  private lastHeadingDeg = 0;

  private immersive = false;
  private immersiveDestination: LatLng | null = null;

  // IN state-change flags — used to emit bus events only on transitions so
  // downstream listeners (voice engine) don't fire on every per-tick update.
  private lastInJunction = false;
  private lastZoomedOut = false;

  constructor(private bus: EventBus<EngineEvents>) {}

  attach(map: MlMap): void {
    this.map = map;
    this.camera = new CinematicCamera(map);
    this.route = new RouteEngine(map, this.bus);
    this.userMarker = new UserMarker(map);
    void this.userMarker.init();

    const c = map.getCenter();
    this.userPosition = { lng: c.lng, lat: c.lat };
    this.route.setUserLocation(this.userPosition);
  }

  // ─── live-position plumbing ───────────────────────────────────────────────

  setUserLocation(p: LatLng, headingDeg?: number | null): void {
    if (this.userPosition) {
      const moved = haversine(this.userPosition, p);
      if (moved > 0.5) {
        // Derive heading from positional delta when GPS doesn't give one.
        this.lastHeadingDeg = bearing(this.userPosition, p);
      }
    }
    if (typeof headingDeg === 'number' && !Number.isNaN(headingDeg)) {
      this.lastHeadingDeg = headingDeg;
    }
    this.userPosition = p;
    this.route?.setUserLocation(p);
    this.userMarker?.setPosition(p, this.lastHeadingDeg);
  }

  getUserHeadingDeg(): number {
    return this.lastHeadingDeg;
  }

  // ─── camera moves (free) ──────────────────────────────────────────────────

  flyToPose(pose: CameraPose, opts: FlyToOpts = {}): void {
    this.camera?.fly(pose, opts);
  }

  flyToPoint(
    point: [number, number],
    opts: FlyToOpts & { zoom?: number; pitch?: number } = {}
  ): void {
    this.camera?.fly(
      {
        center: point,
        zoom: opts.zoom ?? 16.4,
        pitch: opts.pitch ?? 60,
        bearing: opts.bearing ?? this.map?.getBearing() ?? 0
      },
      opts
    );
  }

  orbit(center: [number, number], pitch = 65): void {
    this.camera?.orbit(center, { pitch, speedDegPerSec: 8, radiusZoom: 16.5 });
  }

  stopOrbit(): void {
    this.camera?.stopOrbit();
  }

  tour(poses: CameraPose[]): void {
    this.camera?.tour(poses);
  }

  stopTour(): void {
    this.camera?.stopTour();
  }

  // ─── route primitives ─────────────────────────────────────────────────────

  drawRoute(to: LatLng, from?: LatLng): void {
    this.route?.routeTo(to, from);
  }

  clearRoute(): void {
    this.route?.clear();
  }

  getRoutePath(): LatLng[] {
    return this.route?.getPath() ?? [];
  }

  // ─── immersive follow ─────────────────────────────────────────────────────

  enterImmersive(loc: LatLng, destination: LatLng): void {
    if (!this.map) return;
    this.immersive = true;
    this.immersiveDestination = destination;
    this.lastInJunction = false;
    this.lastZoomedOut = false;
    const lookahead = this.lookaheadPoint(loc, 0);
    const initialBearing = bearing(loc, lookahead);

    this.camera?.stopOrbit();
    this.camera?.stopTour();
    this.map.easeTo({
      center: [loc.lng, loc.lat],
      zoom: IN_BASE_ZOOM,
      pitch: IN_BASE_PITCH,
      bearing: initialBearing,
      duration: IN_ENTER_DURATION_MS,
      easing: easing.easeInOutQuad
    });
    this.bus.emit('in:enter', { destination });
  }

  exitImmersive(): void {
    const wasImmersive = this.immersive;
    if (!this.immersive || !this.map) {
      this.immersive = false;
      this.immersiveDestination = null;
      this.lastInJunction = false;
      this.lastZoomedOut = false;
      this.route?.setJunctionMode(false);
      if (wasImmersive) this.bus.emit('in:exit', undefined);
      return;
    }
    this.immersive = false;
    this.immersiveDestination = null;
    this.lastInJunction = false;
    this.lastZoomedOut = false;
    this.route?.setJunctionMode(false);
    this.map.easeTo({
      pitch: 60,
      duration: IN_EXIT_DURATION_MS,
      easing: easing.easeInOutQuad
    });
    this.bus.emit('in:exit', undefined);
  }

  updateFollow(loc: LatLng, speedMps: number): void {
    if (!this.immersive || !this.map || !this.immersiveDestination) return;

    const remaining = haversine(loc, this.immersiveDestination);
    const inJunction = remaining < JUNCTION_DISTANCE_M;
    this.route?.setJunctionMode(inJunction);

    const lookaheadM = LOOKAHEAD_BASE_M + Math.max(0, speedMps) * LOOKAHEAD_PER_SEC;
    const lookahead = this.lookaheadPoint(loc, lookaheadM);
    const targetBearing = bearing(loc, lookahead);

    const zoomedOut = speedMps >= SPEED_FAST_MPS;
    let zoom = IN_BASE_ZOOM;
    if (zoomedOut) zoom = IN_FAST_ZOOM;
    else if (speedMps < SPEED_SLOW_MPS) zoom = IN_SLOW_ZOOM;
    if (inJunction) zoom += IN_JUNCTION_ZOOM_DELTA;

    const pitch = inJunction ? IN_BASE_PITCH + IN_JUNCTION_PITCH_DELTA : IN_BASE_PITCH;

    this.map.easeTo({
      center: [loc.lng, loc.lat],
      zoom,
      pitch,
      bearing: shortestBearing(this.map.getBearing(), targetBearing),
      duration: IN_FOLLOW_DURATION_MS,
      easing: easing.easeInOutQuad
    });

    // State-change events for the voice engine — only emit on transitions so
    // listeners don't fire on every per-tick update.
    if (inJunction !== this.lastInJunction) {
      this.lastInJunction = inJunction;
      this.bus.emit('in:junction', { inJunction, distanceMeters: remaining });
    }
    if (zoomedOut !== this.lastZoomedOut) {
      this.lastZoomedOut = zoomedOut;
      if (zoomedOut) this.bus.emit('in:zoomout', { speedMps });
    }
  }

  isImmersive(): boolean {
    return this.immersive;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /**
   * Walk forward along the current route from `loc` by `distanceM` and return
   * the resulting lat/lng. Falls back to the destination when the path is
   * empty or the lookahead overshoots the end.
   */
  private lookaheadPoint(loc: LatLng, distanceM: number): LatLng {
    const path = this.route?.getPath() ?? [];
    if (path.length < 2) return this.immersiveDestination ?? loc;

    // Find nearest segment to `loc`
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversine(loc, path[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    // Walk forward from that segment by `distanceM`
    let remaining = distanceM;
    for (let i = nearestIdx; i < path.length - 1; i++) {
      const segLen = haversine(path[i], path[i + 1]);
      if (segLen >= remaining) {
        const t = segLen === 0 ? 0 : remaining / segLen;
        return {
          lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
          lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t
        };
      }
      remaining -= segLen;
    }
    return path[path.length - 1];
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

/**
 * Wrap the target bearing so MapLibre rotates the short way around. Without
 * this the camera spins 350° instead of -10° crossing 0/360.
 */
function shortestBearing(current: number, target: number): number {
  let delta = ((target - current + 540) % 360) - 180;
  return current + delta;
}
