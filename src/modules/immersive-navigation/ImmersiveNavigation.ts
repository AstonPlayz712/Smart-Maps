import type { Map as MlMap } from 'maplibre-gl';
import type { EventBus } from '../../engine/EventBus';
import type { CameraPose, EngineEvents, LatLng } from '../../engine/types';
import { CinematicCamera } from './CinematicCamera';
import { RouteEngine } from './RouteEngine';

export interface FlyToOpts {
  duration?: number;
  curve?: number;
  pitch?: number;
  bearing?: number;
  zoom?: number;
}

/**
 * Immersive Navigation — the camera engine. Owns:
 *
 *   • CinematicCamera : fly / orbit / tour
 *   • RouteEngine     : tap-to-route + ask-to-route polyline
 *
 * Exposes a small surface so commands and UI never poke MapLibre directly.
 */
export class ImmersiveNavigation {
  private map?: MlMap;
  private camera?: CinematicCamera;
  private route?: RouteEngine;
  private userPosition: LatLng | null = null;

  constructor(private bus: EventBus<EngineEvents>) {}

  attach(map: MlMap): void {
    this.map = map;
    this.camera = new CinematicCamera(map);
    this.route = new RouteEngine(map, this.bus);

    const c = map.getCenter();
    this.userPosition = { lng: c.lng, lat: c.lat };
    this.route.setUserLocation(this.userPosition);

    // Best-effort geolocation upgrade. Stays silent on denial — the map center remains
    // the "user" so the route demo always works regardless of permissions.
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: LatLng = { lng: pos.coords.longitude, lat: pos.coords.latitude };
          this.userPosition = p;
          this.route?.setUserLocation(p);
        },
        () => undefined,
        { maximumAge: 60000, timeout: 4000 }
      );
    }
  }

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
        pitch: opts.pitch ?? 66,
        bearing: opts.bearing ?? this.map?.getBearing() ?? 0
      },
      opts
    );
  }

  orbit(center: [number, number], pitch = 70): void {
    this.camera?.orbit(center, { pitch, speedDegPerSec: 10, radiusZoom: 16.5 });
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

  /**
   * Draw a route polyline from `from` to `to`. Low-level primitive — callers
   * should go through `NavigationService.startNavigation` instead of using this
   * directly, so navigation state stays in one place.
   */
  drawRoute(to: LatLng, from?: LatLng): void {
    this.route?.routeTo(to, from);
  }

  clearRoute(): void {
    this.route?.clear();
  }

  getUserPosition(): LatLng | null {
    return this.userPosition;
  }
}
