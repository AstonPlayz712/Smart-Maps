// automaps/in/index.ts
//
// Public barrel for AutoMaps IN — Immersive Navigation, A/E.

export { AutoMapsIN } from './AutoMapsIN';
export type { AutoMapsINOptions } from './AutoMapsIN';

export { buildCorridorMesh, buildRoundaboutDisc, buildJunctionVolume } from './meshes';
export { BoroughContinuity } from './boroughContinuity';
export type { BoroughCrossing } from './boroughContinuity';
export { DynamicLighting, OcclusionPolicy, CameraTransitions } from './lighting';
export type { LightingState, CameraPhase, CameraTransition } from './lighting';
export { SonicVoiceTiming, DEFAULT_SONIC_TIMINGS } from './sonicTiming';
export type { SonicEvent, SonicCueSpec } from './sonicTiming';

// Lane rails are shared with the 3D spatial engine.
export { buildLaneRail } from '../../engine/3d/lanes';
