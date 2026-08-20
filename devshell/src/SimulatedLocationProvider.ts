/**
 * DevShell's stand-in for every hardware positioning source.
 *
 * It implements the same `LocationProvider` contract as WiFiProvider,
 * BluetoothBeaconProvider, AutoExLocationProvider and SensorFusionProvider, so
 * `LocationProviders` fans it in exactly like a real source — nothing in the
 * facade or its consumers knows the difference.
 *
 * Crucially it publishes its first fix **synchronously inside `start()`**, so
 * anything that waits for a location resolves on the boot tick instead of
 * waiting for a GNSS lock that will never come on a desktop.
 */

import type {
  LocationFix,
  LocationListener,
  LocationProvider,
  ProviderId,
  Unsubscribe
} from '../../src/services/location-providers/types';
import type { SimulationScript } from '../sim/types';
import type { DevShellSample } from './types';

const clamp = (v: number, lo: number, hi: number) =>
  !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;

export class SimulatedLocationProvider implements LocationProvider {
  readonly id: ProviderId = 'devshell';
  readonly name = 'DevShell Simulation';

  private readonly script: SimulationScript;
  private readonly intervalMs: number;
  private subs = new Set<LocationListener>();
  private sampleSubs = new Set<(s: DevShellSample) => void>();
  private lastFix: LocationFix | null = null;
  private lastSample: DevShellSample | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastEmitAt = 0;
  private active = false;

  constructor(script: SimulationScript, updateRateHz = 10) {
    this.script = script;
    this.intervalMs = 1000 / updateRateHz;
  }

  /** The simulation driving this provider (mode, name, determinism). */
  get simulation(): SimulationScript {
    return this.script;
  }

  // ─── LocationProvider ─────────────────────────────────────────────────────

  isAvailable(): boolean {
    return true; // the simulation is always available — that is the point
  }

  isActive(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.lastEmitAt = Date.now();

    // Boot-critical: emit immediately so `getLocation()` is non-null on the
    // very first read and the map has a centre without waiting a tick.
    this.emit(0);

    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastEmitAt) / 1000;
      this.lastEmitAt = now;
      this.emit(dt);
    }, this.intervalMs);
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getLast(): LocationFix | null {
    return this.lastFix;
  }

  onUpdate(cb: LocationListener): Unsubscribe {
    this.subs.add(cb);
    if (this.lastFix) cb(this.lastFix);
    return () => {
      this.subs.delete(cb);
    };
  }

  // ─── DevShell extras ──────────────────────────────────────────────────────

  /** Full simulated telemetry (adds motion state, confidence, update rate). */
  onSample(cb: (sample: DevShellSample) => void): Unsubscribe {
    this.sampleSubs.add(cb);
    if (this.lastSample) cb(this.lastSample);
    return () => {
      this.sampleSubs.delete(cb);
    };
  }

  getLastSample(): DevShellSample | null {
    return this.lastSample;
  }

  /** The IMU stream that accompanies the current motion. */
  imu() {
    return this.script.imu();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /**
   * Realistic bounds for simulated accuracy.
   *
   * A simulation is free to model a bad fix, but not an impossible one: an
   * unbounded accuracy value renders as an enormous ring and skews fusion
   * weighting. Horizontal is clamped to consumer-GNSS reality (1–200 m) and
   * vertical to what barometric floor detection actually achieves (1–8 m).
   */
  private static clampAccuracy(sample: DevShellSample): DevShellSample {
    const horizontal = clamp(sample.accuracyM, 1, 200);
    const vertical = clamp(sample.verticalAccuracyM, 1, 8);
    if (horizontal === sample.accuracyM && vertical === sample.verticalAccuracyM) {
      return sample;
    }
    return { ...sample, accuracyM: horizontal, verticalAccuracyM: vertical };
  }

  private emit(dtSeconds: number): void {
    const sample = SimulatedLocationProvider.clampAccuracy(this.script.advance(dtSeconds));
    this.lastSample = sample;

    const fix: LocationFix = {
      lat: sample.position.lat,
      lng: sample.position.lng,
      accuracy: sample.accuracyM,
      heading: sample.headingDeg,
      speed: sample.speedMps,
      source: this.id,
      timestamp: sample.timestampMs
    };
    this.lastFix = fix;

    this.subs.forEach((cb) => {
      try {
        cb(fix);
      } catch (err) {
        console.error('[devshell] location subscriber error', err);
      }
    });
    this.sampleSubs.forEach((cb) => {
      try {
        cb(sample);
      } catch (err) {
        console.error('[devshell] sample subscriber error', err);
      }
    });
  }
}
