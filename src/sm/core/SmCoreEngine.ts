import type { SmartMapsEngine } from '../../engine/SmartMapsEngine';

/**
 * SM Core Engine — proto facade.
 *
 * In the Auto-class build this will own its own state machine, lifecycle,
 * and event bus. For the proto, it delegates to the existing
 * SmartMapsEngine and exposes the SM-style "Core" surface so the other SM
 * modules (Spatial Graph, Routing, Lane Engine, Real-Time Engine) can
 * speak through a stable shape regardless of what's underneath.
 */
export class SmCoreEngine {
  constructor(private engine: SmartMapsEngine) {}

  /** Underlying proto engine — escape hatch for code that needs the raw map. */
  getEngine(): SmartMapsEngine {
    return this.engine;
  }

  /** The MapLibre instance (null until the map has attached). */
  getMap() {
    return this.engine.getMap();
  }

  /** Shorthand for the navigation state machine. */
  getNavigationService() {
    return this.engine.navigationService;
  }

  /** Shorthand for the multi-provider location facade. */
  getLocationProviders() {
    return this.engine.locationProviders;
  }
}
