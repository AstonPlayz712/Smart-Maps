// engine/index.ts
//
// Public barrel for the Dynamic Engine — the core of Smart Maps A/E.

export { DynamicEngine } from './DynamicEngine';
export type { DynamicEngineOptions } from './DynamicEngine';

export { Pipeline } from './pipeline/Pipeline';
export { ThreadModel, Lane } from './pipeline/ThreadModel';
export { GpuHooks } from './pipeline/GpuHooks';

// Dimensions
export { SpatialEngine } from './3d/SpatialEngine';
export type { SpatialState, SpatialPayload } from './3d/SpatialEngine';
export { TemporalEngine } from './4d/TemporalEngine';
export type { TemporalPayload } from './4d/TemporalEngine';
export { ContextEngine } from './5d/ContextEngine';
export type { ContextPayload, ContextSignals, TripType } from './5d/ContextEngine';
export { BehaviourEngine } from './6d/BehaviourEngine';
export type { BehaviourPayload, RoutePreferences } from './6d/BehaviourEngine';
export { IntentEngine } from './7d/IntentEngine';
export type { IntentPayload, IntentState, Purpose } from './7d/IntentEngine';

// 3D geometry builders
export { buildRoadRibbon, defaultWidth } from './3d/roads';
export type { RoadGraph, RoadSegment, RoadClass } from './3d/roads';
export { deriveLanes, buildLaneRail } from './3d/lanes';
export type { LaneSpec } from './3d/lanes';
export { buildTerrainMesh } from './3d/terrain';
export type { HeightField } from './3d/terrain';
export { extrudeBuilding } from './3d/buildings';
export type { BuildingFootprint } from './3d/buildings';
export { buildBoroughGround, continuityGroups } from './3d/boroughMeshes';
export type { Borough } from './3d/boroughMeshes';

// 4D models
export { TrafficModel, congestionFor } from './4d/traffic';
export type { TrafficReading, Congestion } from './4d/traffic';
export { WeatherModel, weatherCaution } from './4d/weather';
export type { WeatherState, Sky } from './4d/weather';
export { rushFactor, isRushHour, DEFAULT_RUSH } from './4d/rushHour';
export { DelayModel } from './4d/delays';
export type { DelayEvent, DelayKind } from './4d/delays';

// External engine integration (50% rule)
export { evaluateCoverage } from './external/FeatureCoverage';
export type { CoverageResult, IntegrationVerdict } from './external/FeatureCoverage';
export { ExternalEngineRegistry } from './external/ExternalEngineRegistry';
export type { IntegrationReport } from './external/ExternalEngineRegistry';
export type { IExternalEngine, NativeFeature, ExtractableGoods } from './external/IExternalEngine';
export { REQUIRED_FEATURES } from './external/IExternalEngine';
export {
  registerStandardAdapters,
  GltfAdapter,
  OsmExtrusionAdapter,
  HeightfieldAdapter
} from './external/adapters';

// Shared types
export type {
  DimensionId,
  DynamicContext,
  DimensionalFrame,
  DimensionLayer,
  DimensionScore,
  IDimension,
  DimensionHost,
  EgoState,
  GeoCoord
} from './types';
export { DIMENSIONS } from './types';
