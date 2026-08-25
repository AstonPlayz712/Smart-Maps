/**
 * sm-core — the Smart-Maps Dynamic Spatial Engine.
 *
 * Import the whole engine from here, or reach a single module directly:
 *
 *   import { DSE } from 'sm-core';
 *   import { AEModule } from 'sm-core/ae';
 *   import { SmartAI } from 'sm-core/ai';
 *   import { MapRenderer } from 'sm-core/renderer';
 *   import { TilePipeline } from 'sm-core/tiles';
 *   import { DimensionalEngine } from 'sm-core/dimensions';
 *   import { RoutingEngine } from 'sm-core/routing';
 *
 * The engine is platform-agnostic: it touches no DOM, no `window`, and no
 * native API. Hosts supply samples and a draw surface; everything else is here.
 */

export { DSE } from './DSE';
export type {
  GnssSample,
  ImuSample,
  RenderSurface,
  LngLatPoint,
  DseOptions,
  DseState
} from './types';

export { AEModule, type AEUpdate, type AEOptions } from './ae';
export { SmartAI, type SmartAIInput, type SmartAIResult } from './ai';
export { DimensionalEngine, type DimensionalState, type TrafficSample } from './dimensions';
export { TilePipeline, TileSource } from './tiles';
export { MapRenderer, Canvas2DBackend, type RenderFrame, type RenderBackend } from './renderer';
export { RoutingEngine, GraphBuilder, type IndoorRoute } from './routing';
