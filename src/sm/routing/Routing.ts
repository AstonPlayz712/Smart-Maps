import type { SmartMapsEngine } from '../../engine/SmartMapsEngine';
import type { LatLng } from '../../engine/types';

export interface SmRoute {
  origin: LatLng;
  destination: LatLng;
  distanceMeters: number;
  durationSec: number;
  path: LatLng[];
}

/**
 * SM Routing — proto wrapper over the engine's route + navigation services.
 *
 * The Auto-class build will replace this with a native OSRM / Valhalla
 * client + post-processing. The proto delegates to the in-engine straight-
 * line interpolator so the rest of the system can be wired up against a
 * stable interface today.
 */
export class Routing {
  constructor(private engine: SmartMapsEngine) {}

  /** Begin navigation to `destination` (the engine handles camera + voice). */
  start(destination: LatLng): void {
    this.engine.navigationService.startNavigation(destination);
  }

  /** Cancel any active route. */
  stop(): void {
    this.engine.navigationService.stopNavigation();
  }

  /** Snapshot of the live route, or null when idle. */
  current(): SmRoute | null {
    const r = this.engine.navigationService.getRoute();
    if (!r) return null;
    return {
      origin: r.origin,
      destination: r.destination,
      distanceMeters: r.distanceMeters,
      durationSec: r.durationSec,
      path: this.engine.navigation.getRoutePath()
    };
  }

  /** Subscribe to route changes. Fires immediately with the current state. */
  onChange(cb: (route: SmRoute | null) => void): () => void {
    return this.engine.navigationService.onRouteUpdate(() => cb(this.current()), 'ui');
  }
}
