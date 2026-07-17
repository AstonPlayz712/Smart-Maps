// src/logic/SensorFusionCore.ts
//
// Ingests raw sensor feeds (GNSS fixes, IMU samples, compass) and produces the
// per-tick SensorSnapshot every other engine consumes. Owns staleness
// accounting and short-window IMU statistics so downstream engines never
// touch raw sample buffers.

import type { GnssFix, ImuSample, SensorSnapshot } from './types';

const IMU_WINDOW_MS = 2000; // rolling window for accel variance / gyro mean
const GNSS_STALE_MS = 8000; // fixes older than this are dropped entirely
const IMU_STALE_MS = 3000;

export class SensorFusionCore {
  private lastGnss: GnssFix | null = null;
  private imuBuffer: ImuSample[] = [];
  private compassHeadingDeg: number | null = null;
  private compassAtMs = 0;

  // ─── feeds ────────────────────────────────────────────────────────────────

  pushGnss(fix: GnssFix): void {
    // Reject clearly-invalid fixes rather than poisoning the fusion state.
    if (!Number.isFinite(fix.position.lat) || !Number.isFinite(fix.position.lng)) return;
    if (fix.accuracyM < 0 || !Number.isFinite(fix.accuracyM)) return;
    // Out-of-order fixes are dropped; the newest fix wins.
    if (this.lastGnss && fix.timestampMs < this.lastGnss.timestampMs) return;
    this.lastGnss = fix;
  }

  pushImu(sample: ImuSample): void {
    if (!Number.isFinite(sample.accelMagnitude)) return;
    this.imuBuffer.push(sample);
    // Trim anything older than the window relative to the newest sample.
    const cutoff = sample.timestampMs - IMU_WINDOW_MS;
    while (this.imuBuffer.length > 0 && this.imuBuffer[0].timestampMs < cutoff) {
      this.imuBuffer.shift();
    }
  }

  pushCompassHeading(headingDeg: number, timestampMs: number): void {
    if (!Number.isFinite(headingDeg)) return;
    this.compassHeadingDeg = ((headingDeg % 360) + 360) % 360;
    this.compassAtMs = timestampMs;
  }

  // ─── snapshot ─────────────────────────────────────────────────────────────

  /** The fused sensor view at `nowMs`. Stale feeds report as null. */
  snapshot(nowMs: number): SensorSnapshot {
    let gnss: SensorSnapshot['gnss'] = null;
    if (this.lastGnss) {
      const ageMs = nowMs - this.lastGnss.timestampMs;
      if (ageMs <= GNSS_STALE_MS) gnss = { fix: this.lastGnss, ageMs };
    }

    let imu: SensorSnapshot['imu'] = null;
    const newest = this.imuBuffer[this.imuBuffer.length - 1];
    if (newest && nowMs - newest.timestampMs <= IMU_STALE_MS) {
      imu = {
        accelVariance: this.accelVariance(),
        gyroMean: this.gyroMean(),
        ageMs: nowMs - newest.timestampMs
      };
    }

    const compassFresh = this.compassHeadingDeg !== null && nowMs - this.compassAtMs <= 3000;

    return {
      timestampMs: nowMs,
      gnss,
      imu,
      compassHeadingDeg: compassFresh ? this.compassHeadingDeg : null
    };
  }

  reset(): void {
    this.lastGnss = null;
    this.imuBuffer = [];
    this.compassHeadingDeg = null;
  }

  // ─── window statistics ────────────────────────────────────────────────────

  private accelVariance(): number {
    const n = this.imuBuffer.length;
    if (n < 2) return 0;
    let mean = 0;
    for (const s of this.imuBuffer) mean += s.accelMagnitude;
    mean /= n;
    let variance = 0;
    for (const s of this.imuBuffer) variance += (s.accelMagnitude - mean) ** 2;
    return variance / (n - 1);
  }

  private gyroMean(): number {
    const n = this.imuBuffer.length;
    if (n === 0) return 0;
    let sum = 0;
    for (const s of this.imuBuffer) sum += s.gyroMagnitude;
    return sum / n;
  }
}
