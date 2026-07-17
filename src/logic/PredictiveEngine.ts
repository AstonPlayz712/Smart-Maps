// src/logic/PredictiveEngine.ts
//
// Short-term (5–20 s) prediction along the corridor. INEngine uses this to
// enter PREP/ACTIVE ahead of the geometry actually arriving — including in
// stationary-predictive mode, where the *distance* envelope still matters
// even though projected movement is near zero.

import type { MotionConfidence, PositionState, PredictionResult } from './types';
import type { RouteManager } from './RouteManager';

const MIN_HORIZON_S = 5;
const MAX_HORIZON_S = 20;
/** Below this, ETA to a junction is treated as unreachable (∞). */
const MIN_ETA_SPEED_MPS = 0.3;

export class PredictiveEngine {
  private last: PredictionResult | null = null;

  /**
   * Predict where the user will be `horizonS` seconds from now, assuming
   * corridor-constrained motion at the current effective speed weighted by
   * motion confidence. Recomputed every tick — never cached across route or
   * regime changes.
   */
  predict(
    route: RouteManager,
    positionState: PositionState,
    motion: MotionConfidence,
    horizonS: number = 12
  ): PredictionResult | null {
    if (!route.hasRoute() || positionState.chainageM === null) {
      this.last = null;
      return null;
    }

    const horizon = Math.max(MIN_HORIZON_S, Math.min(MAX_HORIZON_S, horizonS));
    const chainage = positionState.chainageM;

    // Effective speed: in MOVING we trust measured speed scaled by confidence
    // (low confidence shrinks the projection rather than inventing motion).
    // In STATIONARY_PREDICTIVE / UNKNOWN the projection collapses toward the
    // current position — prediction never fabricates travel while parked.
    const confidenceScale = 0.5 + 0.5 * motion.value;
    const effectiveSpeed =
      motion.mode === 'MOVING' ? positionState.speedMps * confidenceScale : positionState.speedMps * motion.value * 0.5;

    const predictedChainageM = Math.min(
      route.totalLengthM(),
      chainage + effectiveSpeed * horizon
    );
    const predictedPosition =
      route.pointAtChainage(predictedChainageM) ?? positionState.position;

    const nextJunction = route.nextJunctionFrom(chainage);
    const distanceToJunctionNowM = nextJunction ? nextJunction.chainageM - chainage : null;
    const predictedDistanceToJunctionM = nextJunction
      ? Math.max(0, nextJunction.chainageM - predictedChainageM)
      : null;

    let etaToJunctionS: number | null = null;
    if (distanceToJunctionNowM !== null) {
      etaToJunctionS =
        effectiveSpeed >= MIN_ETA_SPEED_MPS ? distanceToJunctionNowM / effectiveSpeed : null;
    }

    const junctionWithinHorizon =
      distanceToJunctionNowM !== null &&
      (predictedDistanceToJunctionM === 0 ||
        (etaToJunctionS !== null && etaToJunctionS <= horizon));

    this.last = {
      horizonS: horizon,
      predictedChainageM,
      predictedPosition,
      nextJunction,
      distanceToJunctionNowM,
      predictedDistanceToJunctionM,
      etaToJunctionS,
      junctionWithinHorizon
    };
    return this.last;
  }

  current(): PredictionResult | null {
    return this.last;
  }

  reset(): void {
    this.last = null;
  }
}
