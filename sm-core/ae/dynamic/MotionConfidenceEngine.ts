// sm-core/ae/dynamic/MotionConfidenceEngine.ts
//
// Computes, every tick, how confident we are in the current motion estimate
// and which motion regime the system is in:
//
//   MOVING                 — sensors agree the user is in motion
//   STATIONARY_PREDICTIVE  — user is stationary OR GNSS is too weak to trust;
//                            navigation continues predictively on the corridor
//   UNKNOWN                — insufficient fresh sensor data to say anything
//
// Nothing is thresholded statically against wall-clock scripts: mode flips are
// driven by sustained sensor evidence with hysteresis, so a single noisy fix
// never toggles the regime.

import type { MotionConfidence, MotionMode, SensorSnapshot } from './types';

// Evidence shaping constants — tuning surface, not scripted behaviour.
const SPEED_MOVING_MPS = 1.2;      // sustained above → moving evidence
const SPEED_STATIONARY_MPS = 0.6;  // sustained below → stationary evidence
const ACCURACY_GOOD_M = 5;
const ACCURACY_BAD_M = 50;
const GNSS_FRESH_MS = 2500;
const IMU_ACTIVE_VARIANCE = 0.35;  // accel variance implying real motion
const SUSTAIN_TO_MOVING_MS = 800;
const SUSTAIN_TO_STATIONARY_MS = 1500;
const SUSTAIN_TO_UNKNOWN_MS = 4000;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class MotionConfidenceEngine {
  private mode: MotionMode = 'UNKNOWN';
  private value = 0;
  private movingEvidenceMs = 0;
  private stationaryEvidenceMs = 0;
  private noDataMs = 0;
  private lastConfidence: MotionConfidence = {
    value: 0,
    mode: 'UNKNOWN',
    gnssQuality: 0,
    imuActivity: 0,
    updatedAtMs: 0
  };

  /** Advance one tick from the fused snapshot. */
  update(snapshot: SensorSnapshot, dtMs: number): MotionConfidence {
    const gnssQuality = this.gnssQuality(snapshot);
    const imuActivity = this.imuActivity(snapshot);

    const speed = snapshot.gnss?.fix.speedMps ?? null;
    const hasAnyData = snapshot.gnss !== null || snapshot.imu !== null;

    // ── accumulate sustained evidence ──────────────────────────────────────
    if (!hasAnyData) {
      this.noDataMs += dtMs;
      this.movingEvidenceMs = 0;
      this.stationaryEvidenceMs = 0;
    } else {
      this.noDataMs = 0;

      const speedSaysMoving = speed !== null && speed >= SPEED_MOVING_MPS && gnssQuality > 0.2;
      const imuSaysMoving = imuActivity >= 0.5;
      const speedSaysStill = speed !== null && speed <= SPEED_STATIONARY_MPS;
      const imuSaysStill = snapshot.imu !== null && imuActivity < 0.2;
      const gnssWeak = gnssQuality < 0.35;

      if (speedSaysMoving || (gnssWeak && imuSaysMoving)) {
        this.movingEvidenceMs += dtMs;
        this.stationaryEvidenceMs = 0;
      } else if ((speedSaysStill && imuSaysStill) || (gnssWeak && imuSaysStill) || (speedSaysStill && snapshot.imu === null)) {
        this.stationaryEvidenceMs += dtMs;
        this.movingEvidenceMs = 0;
      } else {
        // Conflicting evidence: decay both accumulators rather than resetting,
        // so brief disagreement doesn't erase an established trend.
        this.movingEvidenceMs = Math.max(0, this.movingEvidenceMs - dtMs);
        this.stationaryEvidenceMs = Math.max(0, this.stationaryEvidenceMs - dtMs);
      }
    }

    // ── mode with hysteresis ───────────────────────────────────────────────
    if (this.noDataMs >= SUSTAIN_TO_UNKNOWN_MS) {
      this.mode = 'UNKNOWN';
    } else if (this.movingEvidenceMs >= SUSTAIN_TO_MOVING_MS) {
      this.mode = 'MOVING';
    } else if (this.stationaryEvidenceMs >= SUSTAIN_TO_STATIONARY_MS) {
      this.mode = 'STATIONARY_PREDICTIVE';
    } else if (this.mode === 'UNKNOWN' && hasAnyData) {
      // First data after a blackout: provisionally stationary-predictive so
      // the corridor pipeline keeps running while evidence accumulates.
      this.mode = 'STATIONARY_PREDICTIVE';
    }

    // ── confidence value ───────────────────────────────────────────────────
    // Agreement between independent evidence sources raises confidence; a
    // single weak source caps it.
    let target: number;
    switch (this.mode) {
      case 'MOVING': {
        const speedNorm = speed !== null ? clamp01(speed / 4) : 0.3;
        target = clamp01(0.35 + 0.4 * gnssQuality + 0.25 * Math.max(speedNorm, imuActivity));
        break;
      }
      case 'STATIONARY_PREDICTIVE': {
        // Confidence that we're genuinely stationary (or correctly holding
        // position without GNSS): quiet IMU is the strongest signal here.
        const quietness = snapshot.imu ? 1 - imuActivity : 0.4;
        target = clamp01(0.3 + 0.45 * quietness + 0.25 * gnssQuality);
        break;
      }
      case 'UNKNOWN':
      default:
        target = 0;
    }
    // Smooth so confidence never steps discontinuously.
    const k = 1 - Math.exp(-dtMs / 600);
    this.value += (target - this.value) * k;

    this.lastConfidence = {
      value: clamp01(this.value),
      mode: this.mode,
      gnssQuality,
      imuActivity,
      updatedAtMs: snapshot.timestampMs
    };
    return this.lastConfidence;
  }

  current(): MotionConfidence {
    return this.lastConfidence;
  }

  reset(): void {
    this.mode = 'UNKNOWN';
    this.value = 0;
    this.movingEvidenceMs = 0;
    this.stationaryEvidenceMs = 0;
    this.noDataMs = 0;
  }

  // ─── evidence shaping ─────────────────────────────────────────────────────

  private gnssQuality(snapshot: SensorSnapshot): number {
    if (!snapshot.gnss) return 0;
    const { fix, ageMs } = snapshot.gnss;
    const accuracy = clamp01(
      (ACCURACY_BAD_M - fix.accuracyM) / (ACCURACY_BAD_M - ACCURACY_GOOD_M)
    );
    const freshness = clamp01(1 - ageMs / GNSS_FRESH_MS);
    return accuracy * (0.4 + 0.6 * freshness);
  }

  private imuActivity(snapshot: SensorSnapshot): number {
    if (!snapshot.imu) return 0;
    return clamp01(snapshot.imu.accelVariance / IMU_ACTIVE_VARIANCE);
  }
}
