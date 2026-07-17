// src/logic/INGeometryEngine.ts
//
// Computes the Always-IN presentation geometry every tick: camera pitch, zoom
// and bearing targets, the corridor lookahead point, ribbon width, and
// junction emphasis. Every value is a continuous function of live state
// (speed, junction distance, IN state, motion mode) smoothed with
// per-tick exponential approach — there are no fixed camera paths and no
// scripted transitions anywhere in this file.

import type {
  INState,
  INViewModel,
  MotionConfidence,
  PositionState,
  PredictionResult
} from './types';
import type { RouteManager } from './RouteManager';
import { shortestAngleDeltaDeg } from './RouteManager';

export interface INGeometryInput {
  state: INState;
  positionState: PositionState;
  motion: MotionConfidence;
  prediction: PredictionResult | null;
  distanceToJunctionM: number | null;
  arrived: boolean;
  dtMs: number;
}

// Continuous shaping constants (targets, not keyframes).
const PITCH_OFF = 45;
const PITCH_PREP = 52;
const PITCH_ACTIVE = 58;
const PITCH_JUNCTION_DELTA = 5;
const PITCH_EXIT = 50;
const ZOOM_OFF = 15.5;
const ZOOM_PREP = 16.8;
const ZOOM_ACTIVE = 17.5;
const ZOOM_SPEED_DELTA = -0.9;    // fast → zoom out
const ZOOM_JUNCTION_DELTA = -0.4; // widen slightly on approach
const LOOKAHEAD_BASE_M = 20;
const LOOKAHEAD_PER_SEC = 3.5;
const SPEED_NORM_MPS = 25;        // ~90 km/h normalizes speed shaping to 1
const DEFAULT_RIBBON_M = 8;
const SMOOTH_TAU_MS = 350;        // camera value approach time-constant
const BEARING_TAU_MS = 550;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class INGeometryEngine {
  // Smoothed presentation state — persists across ticks so values glide.
  private pitchDeg = PITCH_OFF;
  private zoom = ZOOM_OFF;
  private bearingDeg = 0;
  private emphasis = 0;
  private ribbonM = DEFAULT_RIBBON_M;
  private bearingInitialized = false;

  reset(): void {
    this.pitchDeg = PITCH_OFF;
    this.zoom = ZOOM_OFF;
    this.bearingDeg = 0;
    this.emphasis = 0;
    this.ribbonM = DEFAULT_RIBBON_M;
    this.bearingInitialized = false;
  }

  /** Compute the view model for this tick. */
  compute(route: RouteManager, input: INGeometryInput): INViewModel {
    const { positionState: pos, state, dtMs } = input;
    const speedNorm = clamp01(pos.speedMps / SPEED_NORM_MPS);

    // ── junction emphasis: 0 far away → 1 at the junction ─────────────────
    // The emphasis range itself is speed-adaptive so fast approaches light up
    // earlier — proportional, not stepped.
    const emphasisRangeM = Math.max(120, pos.speedMps * 10);
    const emphasisTarget =
      state === 'ACTIVE' && input.distanceToJunctionM !== null
        ? clamp01(1 - input.distanceToJunctionM / emphasisRangeM)
        : 0;

    // ── camera targets (continuous functions of state + sensors) ──────────
    let pitchTarget: number;
    let zoomTarget: number;
    switch (state) {
      case 'OFF':
        pitchTarget = PITCH_OFF;
        zoomTarget = ZOOM_OFF;
        break;
      case 'PREP':
        pitchTarget = PITCH_PREP + 3 * speedNorm;
        zoomTarget = ZOOM_PREP + ZOOM_SPEED_DELTA * speedNorm * 0.5;
        break;
      case 'ACTIVE':
        pitchTarget = PITCH_ACTIVE + PITCH_JUNCTION_DELTA * emphasisTarget;
        zoomTarget =
          ZOOM_ACTIVE + ZOOM_SPEED_DELTA * speedNorm + ZOOM_JUNCTION_DELTA * emphasisTarget;
        break;
      case 'EXIT':
        pitchTarget = PITCH_EXIT;
        zoomTarget = ZOOM_PREP;
        break;
    }

    // ── lookahead + bearing along the corridor ────────────────────────────
    let lookahead = null as INViewModel['lookahead'];
    let bearingTarget = pos.headingDeg;
    if (pos.chainageM !== null && route.hasRoute()) {
      const lookaheadM = LOOKAHEAD_BASE_M + pos.speedMps * LOOKAHEAD_PER_SEC;
      const targetChainage = Math.min(route.totalLengthM(), pos.chainageM + lookaheadM);
      lookahead = route.pointAtChainage(targetChainage);
      const corridorHeading = route.headingAtChainage(
        Math.min(route.totalLengthM(), pos.chainageM + lookaheadM * 0.5)
      );
      if (corridorHeading !== null && pos.corridorLocked) {
        // Blend corridor tangent with measured heading by motion confidence:
        // trust the sensor course when moving fast, the corridor when not.
        const w = input.motion.mode === 'MOVING' ? clamp01(0.35 + speedNorm) : 0.15;
        bearingTarget =
          corridorHeading + shortestAngleDeltaDeg(corridorHeading, pos.headingDeg) * w;
      }
    }

    // ── ribbon width ───────────────────────────────────────────────────────
    const segment =
      pos.chainageM !== null ? route.segmentAtChainage(pos.chainageM) : null;
    const baseRibbon = (segment?.halfWidthM ?? DEFAULT_RIBBON_M / 2) * 2;
    const ribbonTarget = baseRibbon * (1 + 0.1 * emphasisTarget);

    // ── smooth everything (exponential approach, dt-correct) ──────────────
    const k = 1 - Math.exp(-dtMs / SMOOTH_TAU_MS);
    const kb = 1 - Math.exp(-dtMs / BEARING_TAU_MS);
    this.pitchDeg += (pitchTarget - this.pitchDeg) * k;
    this.zoom += (zoomTarget - this.zoom) * k;
    this.emphasis += (emphasisTarget - this.emphasis) * k;
    this.ribbonM += (ribbonTarget - this.ribbonM) * k;
    if (!this.bearingInitialized) {
      this.bearingDeg = bearingTarget;
      this.bearingInitialized = true;
    } else {
      this.bearingDeg =
        (this.bearingDeg + shortestAngleDeltaDeg(this.bearingDeg, bearingTarget) * kb + 360) % 360;
    }

    return {
      state,
      motionMode: input.motion.mode,
      cameraPitchDeg: this.pitchDeg,
      cameraZoom: this.zoom,
      cameraBearingDeg: this.bearingDeg,
      lookahead,
      corridorWidthM: this.ribbonM,
      junctionEmphasis: this.emphasis,
      distanceToJunctionM: input.distanceToJunctionM,
      etaToJunctionS: input.prediction?.etaToJunctionS ?? null,
      corridorLocked: pos.corridorLocked,
      arrived: input.arrived
    };
  }
}
