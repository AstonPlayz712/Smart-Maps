/**
 * The DevShell sensor simulator — the single source of truth for every
 * hardware feed SM would otherwise read from GNSS and the IMU.
 *
 * It drives a vehicle around a closed loop and emits, at a fixed rate:
 *   position · accuracy · motion state · confidence · heading · speed · Hz
 *
 * plus a matching IMU stream (accel/gyro magnitudes) so the dead-reckoning and
 * Always-IN engines receive exactly the shape they expect from real hardware.
 *
 * The simulation is deterministic (seeded noise, no Math.random), so a DevShell
 * session replays identically — which is what makes it useful for development.
 */

import { SimulatedRoute, buildLoop } from './SimulatedRoute';
import type {
  DevShellImuSample,
  DevShellMotionState,
  DevShellOptions,
  DevShellPosition,
  DevShellSample
} from './types';

/** Phases of the simulated drive, so motion state genuinely changes. */
type Phase = 'cruise' | 'slowing' | 'stopped' | 'accelerating';

const PHASE_SECONDS: Record<Phase, number> = {
  cruise: 24,
  slowing: 4,
  stopped: 6,
  accelerating: 4
};

export class SimulatedSensorFeed {
  private readonly route: SimulatedRoute;
  private readonly cruiseSpeed: number;
  private readonly baseAccuracy: number;
  private readonly rateHz: number;

  private distanceM = 0;
  private speedMps = 0;
  private phase: Phase = 'accelerating';
  private phaseElapsed = 0;
  private elapsed = 0;
  private noiseState: number;

  constructor(origin: DevShellPosition, opts: DevShellOptions = {}) {
    this.route = new SimulatedRoute(opts.route ?? buildLoop(origin));
    this.cruiseSpeed = opts.speedMps ?? 12;
    this.baseAccuracy = opts.accuracyM ?? 6;
    this.rateHz = opts.updateRateHz ?? 10;
    this.noiseState = opts.seed ?? 0x5eed;
    this.speedMps = this.cruiseSpeed;
  }

  /**
   * Advance the simulation and produce the next sample. Safe to call with
   * dt = 0, which is what makes the first (boot) sample available immediately
   * rather than one tick later.
   */
  advance(dtSeconds: number): DevShellSample {
    const dt = Math.max(0, Math.min(1, dtSeconds));
    this.elapsed += dt;
    this.phaseElapsed += dt;

    // ── phase machine: cruise → slowing → stopped → accelerating → cruise ──
    if (this.phaseElapsed >= PHASE_SECONDS[this.phase]) {
      this.phaseElapsed = 0;
      this.phase =
        this.phase === 'cruise'
          ? 'slowing'
          : this.phase === 'slowing'
            ? 'stopped'
            : this.phase === 'stopped'
              ? 'accelerating'
              : 'cruise';
    }

    const targetSpeed =
      this.phase === 'stopped' ? 0 : this.phase === 'slowing' ? this.cruiseSpeed * 0.25 : this.cruiseSpeed;
    // Approach the target smoothly so acceleration (and therefore the IMU
    // stream) is continuous rather than stepped.
    this.speedMps += (targetSpeed - this.speedMps) * (1 - Math.exp(-dt / 1.2));
    if (this.speedMps < 0.05) this.speedMps = 0;

    this.distanceM += this.speedMps * dt;
    const pose = this.route.poseAt(this.distanceM);

    // ── accuracy: breathes around the baseline, degrades when stopped ──────
    const accuracyM =
      this.baseAccuracy *
      (this.phase === 'stopped' ? 1.8 : 1) *
      (1 + 0.25 * this.noise());

    const motionState = this.motionState();

    return {
      position: pose.position,
      accuracyM: round(accuracyM, 2),
      motionState,
      confidence: round(this.confidence(motionState), 3),
      headingDeg: round(pose.headingDeg, 2),
      speedMps: round(this.speedMps, 3),
      updateRateHz: this.rateHz,
      timestampMs: Date.now(),
      simulated: true
    };
  }

  /**
   * The IMU stream matching the current motion. Driving produces sustained
   * vibration; stopped produces near-silence — the same signal the real motion
   * engine keys off.
   */
  imu(): DevShellImuSample {
    const driving = this.speedMps > 1;
    const vibration = driving ? 0.55 + 0.35 * Math.sin(this.elapsed * 7.3) : 0.01;
    return {
      accelMagnitude: Math.max(0, vibration + 0.12 * this.noise()),
      gyroMagnitude: driving ? 0.05 + 0.03 * Math.abs(this.noise()) : 0.005,
      timestampMs: Date.now()
    };
  }

  private motionState(): DevShellMotionState {
    if (this.speedMps < 0.5) return 'still';
    if (this.speedMps < 2.5) return 'walking';
    return 'driving';
  }

  private confidence(state: DevShellMotionState): number {
    // Confidence is high mid-phase and dips through transitions — same shape
    // the hysteresis in the real motion engine produces.
    const settled = Math.min(1, this.phaseElapsed / 2);
    const base = state === 'unknown' ? 0.2 : 0.72;
    return clamp01(base + 0.25 * settled - 0.08 * Math.abs(this.noise()));
  }

  /** Deterministic noise in [-1, 1] — no Math.random, so runs are repeatable. */
  private noise(): number {
    this.noiseState = (this.noiseState * 1664525 + 1013904223) >>> 0;
    return (this.noiseState / 0xffffffff) * 2 - 1;
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const round = (v: number, dp: number) => Number(v.toFixed(dp));
