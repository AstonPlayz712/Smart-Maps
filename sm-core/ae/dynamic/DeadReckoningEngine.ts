// sm-core/ae/dynamic/DeadReckoningEngine.ts
//
// Advances position along the corridor when GNSS is weak or reports near-zero
// speed. Uses the last trusted heading + speed, decayed by what the IMU says:
// if the IMU still shows motion energy, the last speed is held (GPS-denied
// driving — tunnel, urban canyon); if the IMU is quiet, speed decays quickly
// toward zero so a genuinely parked user doesn't drift down the corridor.

import type { Position } from './types';
import type { RouteManager } from './RouteManager';

export interface DeadReckoningResult {
  chainageM: number;
  position: Position | null;
  /** The effective speed used for the advance, after IMU-driven decay. */
  speedUsedMps: number;
  headingDeg: number;
}

// Decay half-lives (seconds): quiet IMU forgets speed fast, active IMU slowly.
const QUIET_HALF_LIFE_S = 0.9;
const ACTIVE_HALF_LIFE_S = 12;

export class DeadReckoningEngine {
  private speedMps = 0;
  private headingDeg = 0;
  private seededAtMs = 0;

  /** Seed with the last trusted GNSS-derived state. Call on every good fix. */
  seed(speedMps: number, headingDeg: number, atMs: number): void {
    if (Number.isFinite(speedMps) && speedMps >= 0) this.speedMps = speedMps;
    if (Number.isFinite(headingDeg)) this.headingDeg = ((headingDeg % 360) + 360) % 360;
    this.seededAtMs = atMs;
  }

  /**
   * Advance along the corridor from `fromChainageM` by dtMs. `imuActivity`
   * (0..1) modulates how quickly the remembered speed decays. Clamps at the
   * corridor end — DR never overshoots the destination.
   */
  advance(
    route: RouteManager,
    fromChainageM: number,
    dtMs: number,
    imuActivity: number
  ): DeadReckoningResult {
    const dtS = Math.max(0, dtMs) / 1000;

    // Interpolate the decay half-life by IMU activity, then apply exponential
    // decay — continuous, sensor-driven, no mode switches.
    const halfLife = QUIET_HALF_LIFE_S + (ACTIVE_HALF_LIFE_S - QUIET_HALF_LIFE_S) * clamp01(imuActivity);
    this.speedMps *= Math.pow(0.5, dtS / halfLife);
    if (this.speedMps < 0.05) this.speedMps = 0;

    const chainageM = Math.min(route.totalLengthM(), fromChainageM + this.speedMps * dtS);

    // Heading follows the corridor tangent while dead-reckoning — the corridor
    // is a stronger constraint than a stale GNSS course.
    const corridorHeading = route.headingAtChainage(chainageM);
    if (corridorHeading !== null) this.headingDeg = corridorHeading;

    return {
      chainageM,
      position: route.pointAtChainage(chainageM),
      speedUsedMps: this.speedMps,
      headingDeg: this.headingDeg
    };
  }

  currentSpeedMps(): number {
    return this.speedMps;
  }

  currentHeadingDeg(): number {
    return this.headingDeg;
  }

  lastSeededAtMs(): number {
    return this.seededAtMs;
  }

  reset(): void {
    this.speedMps = 0;
    this.headingDeg = 0;
    this.seededAtMs = 0;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
