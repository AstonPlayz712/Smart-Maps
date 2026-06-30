// engine/types.ts
//
// Shared data models for the Dynamic Engine — the core of Smart Maps A/E.
// Every dimensional sub-engine (3D spatial → 7D intent) consumes the same
// DynamicContext and contributes a typed layer to the DimensionalFrame. The
// engine fuses those layers into a single navigation decision each tick.

import type { GeoCoord } from '../core/zante/native/types';

export type { GeoCoord } from '../core/zante/native/types';

/** The five live dimensions above the static 2D base map. */
export type DimensionId = '3d' | '4d' | '5d' | '6d' | '7d';

export const DIMENSIONS: readonly DimensionId[] = ['3d', '4d', '5d', '6d', '7d'];

/** The ego vehicle/user state, refreshed every tick by the location stack. */
export interface EgoState {
  location: GeoCoord;
  headingDeg: number;
  speedMps: number;
}

/**
 * The evolving world state passed to every dimension each tick. Dimensions
 * read it; they never mutate it. The engine owns the single instance.
 */
export interface DynamicContext {
  /** Monotonic engine time, seconds. */
  time: number;
  /** Wall-clock epoch ms — 4D temporal reasoning keys off this. */
  epochMs: number;
  ego: EgoState;
  destination?: GeoCoord;
  routePath: readonly GeoCoord[];
  /** Atmospheric mode hint for the renderer/lighting. */
  mode: 'day' | 'dusk' | 'night';
}

/** A scored weighting a dimension assigns to a candidate route/segment. */
export interface DimensionScore {
  dimension: DimensionId;
  /** -1 (avoid) … 0 (neutral) … +1 (prefer). */
  weight: number;
  /** Human-readable reason — surfaces in Ask Maps / voice explanations. */
  reason: string;
}

/** The per-tick output of one dimension. */
export interface DimensionLayer<TPayload = unknown> {
  dimension: DimensionId;
  payload: TPayload;
  scores: DimensionScore[];
}

/** All dimension layers fused for one tick. */
export interface DimensionalFrame {
  time: number;
  layers: Partial<Record<DimensionId, DimensionLayer>>;
  /** Net per-dimension weight after fusion, for routing/score blending. */
  blended: DimensionScore[];
}

/**
 * A dimension sub-engine. Generic over its payload type so the 3D spatial
 * engine, 4D temporal engine, etc. each expose their own strongly-typed
 * `query` surface while sharing the lifecycle the Dynamic Engine drives.
 */
export interface IDimension<TPayload = unknown> {
  readonly id: DimensionId;
  /** Wire up GPU/threading/asset hooks from the host. */
  init(host: DimensionHost): void;
  /** Advance one tick; returns this dimension's layer for fusion. */
  update(ctx: DynamicContext, dt: number): DimensionLayer<TPayload>;
  dispose(): void;
}

/** What a dimension is handed at init — the native core + the thread pool. */
export interface DimensionHost {
  /** Schedule heavy work off the render loop. */
  schedule<T>(priority: number, fn: () => T | Promise<T>): Promise<T>;
  /** Emit a named engine signal (consumed by the app event bus bridge). */
  signal(event: string, payload: unknown): void;
}
