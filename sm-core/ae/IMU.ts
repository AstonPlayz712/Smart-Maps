/**
 * IMU telemetry — horizontal motion classification plus the vertical channel
 * that indoor positioning needs.
 *
 * The vertical classifier distinguishes stairs, lift and escalator from the
 * shape of the signal rather than from any single reading:
 *
 *   stairs     rhythmic vertical acceleration (steps) while altitude changes
 *   lift       altitude changes with an almost silent accelerometer, plus the
 *              characteristic start/stop weight transient
 *   escalator  altitude changes steadily with low step energy — carried, not
 *              climbed
 *   static     altitude is not meaningfully changing
 */

import type { VerticalMotionState } from './Position';

export type HorizontalMotionState = 'still' | 'walking' | 'driving' | 'unknown';

export interface IMUSample {
  /** Linear acceleration magnitude, gravity removed, m/s². */
  accelMagnitude: number;
  /** Vertical component of linear acceleration, m/s² (up positive). */
  verticalAccel: number;
  /** Rotation rate magnitude, rad/s. */
  gyroMagnitude: number;
  /** Barometric altitude if the device has a barometer, metres. */
  barometricAltitudeM?: number;
  timestampMs: number;
}

export interface MotionEstimate {
  horizontal: HorizontalMotionState;
  vertical: VerticalMotionState;
  /** Confidence in the horizontal state, 0…1. */
  confidence: number;
  /** Confidence that a vertical transition is underway, 0…1. */
  verticalTransitionConfidence: number;
  /** Vertical rate, m/s (positive = ascending). */
  verticalRateMps: number;
  /** IMU motion energy 0…1 — gates dead reckoning. */
  imuActivity: number;
}

const WINDOW_MS = 2500;
/** Below this vertical rate nothing counts as a transition. */
const VERTICAL_RATE_FLOOR = 0.12;
/** Sustained evidence needed before a vertical state is committed, ms. */
const VERTICAL_SUSTAIN_MS = 900;

export class IMUProcessor {
  private window: IMUSample[] = [];
  private altitudeWindow: { altitude: number; t: number }[] = [];

  private horizontal: HorizontalMotionState = 'unknown';
  private vertical: VerticalMotionState = 'static';
  private confidence = 0;
  private verticalConfidence = 0;

  private stillMs = 0;
  private walkMs = 0;
  private driveMs = 0;
  private verticalCandidate: VerticalMotionState = 'static';
  private verticalCandidateMs = 0;

  push(sample: IMUSample): void {
    this.window.push(sample);
    const cutoff = sample.timestampMs - WINDOW_MS;
    this.window = this.window.filter((s) => s.timestampMs >= cutoff);
    if (sample.barometricAltitudeM !== undefined) {
      this.altitudeWindow.push({ altitude: sample.barometricAltitudeM, t: sample.timestampMs });
      this.altitudeWindow = this.altitudeWindow.filter((a) => a.t >= cutoff);
    }
  }

  /**
   * Advance the classifier. `gnssSpeedMps` is corroborating evidence — pass
   * null when there is no fix.
   */
  update(dtMs: number, gnssSpeedMps: number | null): MotionEstimate {
    const activity = this.activity();
    const verticalRate = this.verticalRate();

    this.classifyHorizontal(dtMs, gnssSpeedMps, activity);
    this.classifyVertical(dtMs, verticalRate, activity);

    return {
      horizontal: this.horizontal,
      vertical: this.vertical,
      confidence: clamp01(this.confidence),
      verticalTransitionConfidence: clamp01(this.verticalConfidence),
      verticalRateMps: verticalRate,
      imuActivity: activity
    };
  }

  reset(): void {
    this.window = [];
    this.altitudeWindow = [];
    this.horizontal = 'unknown';
    this.vertical = 'static';
    this.confidence = 0;
    this.verticalConfidence = 0;
    this.stillMs = 0;
    this.walkMs = 0;
    this.driveMs = 0;
    this.verticalCandidate = 'static';
    this.verticalCandidateMs = 0;
  }

  // ─── horizontal ───────────────────────────────────────────────────────────

  /**
   * BUG FIX (Live State showing "Driving" while stationary): the old rule let
   * IMU vibration alone imply driving, so a phone buzzing on a desk — or the
   * user's own fidgeting — read as a car. Speed is now authoritative whenever
   * it is available: with a real speed reading below the walking threshold the
   * state cannot be `driving`, whatever the accelerometer says. Vibration is
   * only allowed to imply driving when there is no speed at all to check
   * against (tunnel, GNSS outage).
   */
  private classifyHorizontal(
    dtMs: number,
    gnssSpeedMps: number | null,
    activity: number
  ): void {
    const hasSpeed = gnssSpeedMps !== null && Number.isFinite(gnssSpeedMps);
    const speed = hasSpeed ? (gnssSpeedMps as number) : -1;

    if (hasSpeed && speed < 0.7) {
      // Measured as stationary: this is decisive.
      this.stillMs += dtMs;
      this.walkMs = 0;
      this.driveMs = 0;
    } else if (hasSpeed && speed >= 4.2) {
      this.driveMs += dtMs;
      this.walkMs = 0;
      this.stillMs = 0;
    } else if (hasSpeed && speed >= 0.7) {
      this.walkMs += dtMs;
      this.driveMs = 0;
      this.stillMs = 0;
    } else if (activity > 0.45) {
      // No speed available — fall back to vibration, but only then.
      this.driveMs += dtMs;
      this.walkMs = 0;
      this.stillMs = 0;
    } else if (activity < 0.2) {
      this.stillMs += dtMs;
      this.walkMs = 0;
      this.driveMs = 0;
    } else {
      this.stillMs = Math.max(0, this.stillMs - dtMs);
      this.walkMs = Math.max(0, this.walkMs - dtMs);
      this.driveMs = Math.max(0, this.driveMs - dtMs);
    }

    if (this.driveMs >= 1200) this.horizontal = 'driving';
    else if (this.walkMs >= 1200) this.horizontal = 'walking';
    else if (this.stillMs >= 1200) this.horizontal = 'still';

    const target =
      this.horizontal === 'unknown'
        ? 0
        : this.horizontal === 'still'
          ? clamp01(0.5 + 0.5 * (1 - activity))
          : clamp01(0.4 + 0.6 * activity);
    this.confidence += (target - this.confidence) * (1 - Math.exp(-dtMs / 600));
  }

  // ─── vertical ─────────────────────────────────────────────────────────────

  private classifyVertical(dtMs: number, verticalRate: number, activity: number): void {
    const ascendingOrDescending = Math.abs(verticalRate) >= VERTICAL_RATE_FLOOR;
    let candidate: VerticalMotionState = 'static';

    if (ascendingOrDescending) {
      const stepEnergy = this.stepEnergy();
      if (stepEnergy > 0.55) {
        // Rhythmic vertical impulses while climbing — footfalls.
        candidate = 'stairs';
      } else if (activity < 0.18) {
        // Moving vertically with an almost silent IMU — enclosed car.
        candidate = 'lift';
      } else {
        // Steady rise, low step energy — carried upward.
        candidate = 'escalator';
      }
    }

    // Require sustained evidence before committing, so a single lurch doesn't
    // register as a floor change.
    if (candidate === this.verticalCandidate) {
      this.verticalCandidateMs += dtMs;
    } else {
      this.verticalCandidate = candidate;
      this.verticalCandidateMs = 0;
    }

    if (
      this.verticalCandidateMs >= VERTICAL_SUSTAIN_MS ||
      (candidate === 'static' && this.verticalCandidateMs >= VERTICAL_SUSTAIN_MS / 2)
    ) {
      this.vertical = candidate;
    }

    const target =
      this.vertical === 'static'
        ? 0
        : clamp01(
            0.35 +
              0.4 * Math.min(1, Math.abs(verticalRate) / 0.8) +
              0.25 * Math.min(1, this.verticalCandidateMs / (VERTICAL_SUSTAIN_MS * 2))
          );
    this.verticalConfidence += (target - this.verticalConfidence) * (1 - Math.exp(-dtMs / 700));
  }

  /** Vertical rate from the barometric window, m/s. */
  private verticalRate(): number {
    if (this.altitudeWindow.length < 2) return 0;
    const first = this.altitudeWindow[0];
    const last = this.altitudeWindow[this.altitudeWindow.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0.05) return 0;
    return (last.altitude - first.altitude) / dt;
  }

  /** Rhythmic vertical impulse energy, 0…1 — the signature of stepping. */
  private stepEnergy(): number {
    if (this.window.length < 4) return 0;
    let crossings = 0;
    let magnitude = 0;
    for (let i = 1; i < this.window.length; i++) {
      const a = this.window[i - 1].verticalAccel;
      const b = this.window[i].verticalAccel;
      if (Math.sign(a) !== Math.sign(b)) crossings++;
      magnitude += Math.abs(b);
    }
    const meanMagnitude = magnitude / this.window.length;
    const rate = crossings / this.window.length; // 0…1, peaks for periodic signals
    return clamp01(rate * 2 * Math.min(1, meanMagnitude / 1.6));
  }

  /** IMU motion energy over the window, 0…1. */
  private activity(): number {
    if (this.window.length < 2) return 0;
    const mean =
      this.window.reduce((sum, s) => sum + s.accelMagnitude, 0) / this.window.length;
    const variance =
      this.window.reduce((sum, s) => sum + (s.accelMagnitude - mean) ** 2, 0) /
      (this.window.length - 1);
    return clamp01(variance / 0.35);
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
