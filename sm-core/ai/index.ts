/**
 * sm-core/ai — Smart-AI.
 *
 * Five models that turn engine state into decisions: which POIs matter, whether
 * we are inside, whether the floor is changing, whether the route was left, and
 * how the presentation should react. Each is a plain object with an `update` or
 * `rank` method and no dependency on the renderer or the host, so any of them
 * can be swapped for a learned implementation later.
 *
 * `SmartAI` runs all five per tick and hands back one combined result.
 */

import type { SMPosition } from '../ae/Position';
import type { MotionEstimate } from '../ae/IMU';
import type { LngLatPoint } from '../types';
import { PoiRelevanceModel, type PoiCandidate, type RankedPoi } from './PoiRelevance';
import { ContextInferenceModel, type ContextInferenceState } from './ContextInference';
import { RouteCorrectionModel, type RouteCorrectionState } from './RouteCorrection';
import { EnvironmentReactivityModel, type EnvironmentResponse } from './EnvironmentReactivity';

/** What Smart-AI is given each tick. */
export interface SmartAIInput {
  position: SMPosition;
  motion: MotionEstimate;
  dtMs: number;
  /** POIs the tile pipeline produced for this frame. */
  pois: PoiCandidate[];
  /** The active route polyline; empty when nothing is routed. */
  routePath: LngLatPoint[];
  /** True when the indoor layer has the subject inside a mapped venue. */
  insideKnownVenue: boolean;
}

/** What Smart-AI concludes. All plain data. */
export interface SmartAIResult {
  pois: RankedPoi[];
  context: ContextInferenceState;
  routeCorrection: RouteCorrectionState;
  environment: EnvironmentResponse;
}

export class SmartAI {
  readonly poiRelevance = new PoiRelevanceModel();
  readonly contextInference = new ContextInferenceModel();
  readonly routeCorrection = new RouteCorrectionModel();
  readonly environmentReactivity = new EnvironmentReactivityModel();

  /** Nothing to load and nothing to wait for; present so hosts can be uniform. */
  init(): void {
    this.reset();
  }

  reset(): void {
    this.contextInference.reset();
    this.routeCorrection.reset();
  }

  update(input: SmartAIInput): SmartAIResult {
    const context = this.contextInference.update(
      input.position,
      input.motion,
      input.dtMs,
      input.insideKnownVenue
    );
    return {
      pois: this.poiRelevance.rank(input.position, input.pois),
      context,
      routeCorrection: this.routeCorrection.update(input.position, input.routePath, input.dtMs),
      environment: this.environmentReactivity.respond(input.position, input.motion, context.environment)
    };
  }
}

export { PoiRelevanceModel, groundDistanceM, type PoiCandidate, type RankedPoi } from './PoiRelevance';
export { ContextInferenceModel, type ContextInferenceState, type Environment } from './ContextInference';
export { RouteCorrectionModel, type RouteCorrectionState } from './RouteCorrection';
export { EnvironmentReactivityModel, type EnvironmentResponse } from './EnvironmentReactivity';
