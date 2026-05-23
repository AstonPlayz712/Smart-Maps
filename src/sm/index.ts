import type { SmartMapsEngine } from '../engine/SmartMapsEngine';
import { SmCoreEngine } from './core/SmCoreEngine';
import { SpatialGraph } from './spatial-graph/SpatialGraph';
import { Routing } from './routing/Routing';
import { LaneEngine } from './lane-engine/LaneEngine';
import { RealTimeEngine } from './real-time-engine/RealTimeEngine';

export { SmCoreEngine, SpatialGraph, Routing, LaneEngine, RealTimeEngine };

/**
 * The proto SM module set.
 *
 * The Rendering Engine, Ask Maps, and Audio (4-Voice) Engine already live
 * elsewhere in the tree (`src/modules/smart-maps/`, `src/modules/ask-maps/`,
 * `src/services/voice/`). This bundle holds the four NEW SM modules the
 * proto adds: Core Engine facade, Spatial Graph, Routing, Lane Engine
 * stub, Real-Time Engine stub. The Auto-class build will replace each
 * impl one module at a time while preserving the public shape.
 */
export interface SmModules {
  core: SmCoreEngine;
  spatialGraph: SpatialGraph;
  routing: Routing;
  laneEngine: LaneEngine;
  realTimeEngine: RealTimeEngine;
}

export function buildSmModules(engine: SmartMapsEngine): SmModules {
  return {
    core: new SmCoreEngine(engine),
    spatialGraph: new SpatialGraph(),
    routing: new Routing(engine),
    laneEngine: new LaneEngine(),
    realTimeEngine: new RealTimeEngine()
  };
}
