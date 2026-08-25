/**
 * Indoor/outdoor inference and floor-transition detection.
 *
 * Two related questions, one body of evidence:
 *
 *   • *Are we inside?* GNSS accuracy collapsing while the subject keeps moving
 *     is the classic indoor signature; being within a known venue footprint is
 *     stronger evidence still.
 *   • *Are we changing floor?* The IMU classifier already names the vertical
 *     motion; this adds the hysteresis so one noisy sample cannot flip a floor.
 *
 * Both decisions use sustained evidence, never a single sample — the same rule
 * the rest of the engine follows.
 */

import type { SMPosition } from '../ae/Position';
import type { MotionEstimate } from '../ae/IMU';
import type { VerticalMotionState } from '../ae/Position';

export type Environment = 'outdoor' | 'indoor' | 'unknown';

export interface ContextInferenceState {
  environment: Environment;
  /** Confidence in `environment`, 0…1. */
  confidence: number;
  /** True while a floor change is being committed. */
  floorTransition: boolean;
  /** The floor the transition is heading for, when it can be named. */
  targetFloorLevel: number | null;
  verticalMotionState: VerticalMotionState;
}

/** Accuracy above this, while moving, reads as "inside something". */
const INDOOR_ACCURACY_M = 25;
/** Sustained evidence before the environment flips, ms. */
const SUSTAIN_MS = 1500;

export class ContextInferenceModel {
  private environment: Environment = 'unknown';
  private candidate: Environment = 'unknown';
  private candidateMs = 0;
  private confidence = 0;
  private lastFloor: number | null = null;

  reset(): void {
    this.environment = 'unknown';
    this.candidate = 'unknown';
    this.candidateMs = 0;
    this.confidence = 0;
    this.lastFloor = null;
  }

  update(position: SMPosition, motion: MotionEstimate, dtMs: number, insideKnownVenue: boolean): ContextInferenceState {
    const observed = this.observe(position, motion, insideKnownVenue);

    if (observed === this.candidate) {
      this.candidateMs += dtMs;
    } else {
      this.candidate = observed;
      this.candidateMs = 0;
    }
    if (this.candidate !== this.environment && this.candidateMs >= SUSTAIN_MS) {
      this.environment = this.candidate;
    }
    this.confidence = Math.max(0, Math.min(1, this.candidateMs / SUSTAIN_MS));

    // Floor transition: the IMU says we are moving vertically and is confident.
    const floorTransition =
      motion.vertical !== 'static' && motion.verticalTransitionConfidence >= 0.45;
    const targetFloorLevel = this.resolveTarget(position, motion, floorTransition);
    if (!floorTransition && position.floorLevel !== null) this.lastFloor = position.floorLevel;

    return {
      environment: this.environment,
      confidence: this.confidence,
      floorTransition,
      targetFloorLevel,
      verticalMotionState: motion.vertical
    };
  }

  private observe(position: SMPosition, motion: MotionEstimate, insideKnownVenue: boolean): Environment {
    // Standing inside a mapped venue is the strongest signal there is.
    if (insideKnownVenue) return 'indoor';
    if (position.floorLevel !== null) return 'indoor';
    if (!Number.isFinite(position.accuracyM)) return 'unknown';
    if (position.accuracyM >= INDOOR_ACCURACY_M && motion.horizontal !== 'driving') return 'indoor';
    if (position.accuracyM <= 12) return 'outdoor';
    return this.environment;
  }

  /**
   * Where the transition is going. Direction comes from the vertical rate; the
   * magnitude of the guess stays at one floor, because predicting "three floors
   * up" from mid-flight evidence is guesswork the UI would show as fact.
   */
  private resolveTarget(position: SMPosition, motion: MotionEstimate, transitioning: boolean): number | null {
    if (!transitioning) return null;
    const from = position.floorLevel ?? this.lastFloor;
    if (from === null) return null;
    if (motion.verticalRateMps > 0.12) return from + 1;
    if (motion.verticalRateMps < -0.12) return from - 1;
    return from;
  }
}
