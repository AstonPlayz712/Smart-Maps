import type { Map as MlMap } from 'maplibre-gl';
import { EventBus } from './EventBus';
import type { EngineEvents } from './types';
import { SmartMapsRenderer } from '../modules/smart-maps/SmartMapsRenderer';
import { ImmersiveNavigation } from '../modules/immersive-navigation/ImmersiveNavigation';
import { AskMaps } from '../modules/ask-maps/AskMaps';
import { LOCATIONS, type LocationId } from '../modules/smart-maps/locations';
import { POIS } from '../data/pois';

export interface EngineOptions {
  initialLocation: LocationId;
  onReady?: () => void;
  onToast?: (msg: string) => void;
}

/**
 * SmartMapsEngine is the unified SM·IN·AM kernel. It owns:
 *
 *   • SmartMapsRenderer        — Smart Maps (MapLibre + 3D buildings + terrain + sky)
 *   • ImmersiveNavigation      — cinematic camera + tap-to-route engine
 *   • AskMaps                  — natural-language command layer
 *
 * The three modules never reach for each other directly — they coordinate through this
 * conductor and the shared EventBus, so any one of them can be swapped out without breaking
 * the rest of the system.
 */
export class SmartMapsEngine {
  private map?: MlMap;
  private container?: HTMLElement;
  private currentLocation: LocationId;

  readonly bus = new EventBus<EngineEvents>();
  readonly renderer: SmartMapsRenderer;
  readonly navigation: ImmersiveNavigation;
  readonly askMaps: AskMaps;

  constructor(opts: EngineOptions) {
    this.currentLocation = opts.initialLocation;
    this.renderer = new SmartMapsRenderer(this.bus);
    this.navigation = new ImmersiveNavigation(this.bus);
    this.askMaps = new AskMaps(this);

    if (opts.onReady) this.bus.on('engine:ready', opts.onReady);
    if (opts.onToast) this.bus.on('engine:toast', opts.onToast);
  }

  attach(container: HTMLElement): void {
    if (this.map) return;
    this.container = container;
    const start = LOCATIONS[this.currentLocation];

    this.map = this.renderer.create(container, start.pose);
    this.navigation.attach(this.map);

    this.map.on('load', () => {
      this.renderer.enableTerrain(true);
      this.renderer.enable3DBuildings(true);
      this.renderer.enableSky();
      this.navigation.flyToPose(start.pose, { duration: 1800 });
      this.bus.emit('engine:ready', undefined);
      this.bus.emit('engine:toast', `Welcome to ${start.name}`);
    });

    // Tap-to-route: any click on the map drops a destination pin and routes from the user.
    this.map.on('click', (e) => {
      this.navigation.routeFromUserTo({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
  }

  detach(): void {
    this.bus.clear();
    this.map?.remove();
    this.map = undefined;
    this.container = undefined;
  }

  getMap(): MlMap | undefined {
    return this.map;
  }

  getPOIs() {
    return POIS;
  }

  getLocationId(): LocationId {
    return this.currentLocation;
  }

  goToLocation(id: LocationId): void {
    const loc = LOCATIONS[id];
    if (!loc) return;
    this.currentLocation = id;
    this.navigation.flyToPose(loc.pose, { duration: 2800, curve: 1.5 });
    this.bus.emit('engine:toast', `Flying to ${loc.name}`);
  }
}
