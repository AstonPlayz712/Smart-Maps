/**
 * Chaotic mode — the stress test. Everything that can move, moves: heading
 * wanders, speed lurches between phases at random intervals, accuracy spikes,
 * and occasional "GNSS dropouts" jump the position sideways.
 *
 * The point is to catch code that quietly assumes a clean signal — smoothing
 * that explodes, snapping that loses lock, cameras that whip around. It is
 * still seeded, so a chaotic run is reproducible: same seed, same chaos.
 */

import { SimulatedRoute, buildLoop } from '../src/SimulatedRoute';
import type { DevShellConfig } from './config';
import type {
  DevShellImuSample,
  DevShellINState,
  DevShellMotionState,
  DevShellPosition,
  DevShellSample,
  SimulationScript
} from './types';

type Phase = 'cruise' | 'slowing' | 'stopped' | 'accelerating';
const PHASES: Phase[] = ['cruise', 'slowing', 'stopped', 'accelerating'];

export class ChaoticScript implements SimulationScript {
  readonly mode = 'chaotic' as const;
  readonly name = 'Chaotic';
  /** Deterministic given a seed, but intentionally erratic. */
  readonly deterministic = true;

  private readonly route: SimulatedRoute;
  private readonly loop: [number, number][];
  private readonly chaos: number;

  private distanceM = 0;
  private speed = 0;
  private phase: Phase = 'cruise';
  private phaseRemaining = 3;
  private headingJitter = 0;
  private elapsed = 0;
  private noiseState: number;

  constructor(origin: DevShellPosition, private readonly config: DevShellConfig) {
    this.loop = buildLoop(origin, config.loopSizeM);
    this.route = new SimulatedRoute(this.loop);
    this.chaos = config.chaos;
    this.noiseState = config.seed ^ 0xc4a05;
    this.speed = config.speedMps;
  }

  advance(dtSeconds: number): DevShellSample {
    const dt = Math.max(0, Math.min(1, dtSeconds));
    this.elapsed += dt;

    // ── phases flip at random intervals rather than on a fixed schedule ────
    this.phaseRemaining -= dt;
    if (this.phaseRemaining <= 0) {
      const pick = Math.floor(this.unit() * PHASES.length) % PHASES.length;
      this.phase = PHASES[pick];
      this.phaseRemaining = 1 + this.unit() * 6 * (1 + this.chaos);
    }

    const target =
      this.phase === 'stopped'
        ? 0
        : this.phase === 'slowing'
          ? this.config.speedMps * 0.3
          : this.phase === 'accelerating'
            ? this.config.speedMps * 1.4
            : this.config.speedMps;

    // Lurch toward the target — the harder the chaos, the snappier the change.
    const responsiveness = 0.4 + this.chaos * 1.6;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * responsiveness));
    this.speed = Math.max(0, this.speed + this.noise() * 2 * this.chaos);

    this.distanceM += this.speed * dt;
    const pose = this.route.poseAt(this.distanceM);

    // ── heading wander, and the occasional hard dropout ───────────────────
    this.headingJitter += this.noise() * 12 * this.chaos * dt;
    this.headingJitter *= 0.94;

    const dropout = this.unit() < 0.01 * this.chaos;
    const jumpM = dropout ? 25 + this.unit() * 60 * this.chaos : 0;
    const position = offset(pose.position, jumpM, pose.headingDeg + 90);

    const accuracyM =
      this.config.accuracyM *
      (1 + 2.5 * this.chaos * Math.abs(this.noise())) *
      (dropout ? 4 : 1);

    return {
      position,
      accuracyM: round(accuracyM, 2),
      motionState: this.motionState(),
      confidence: round(clamp01(0.85 - 0.55 * this.chaos * Math.abs(this.noise())), 3),
      headingDeg: round((pose.headingDeg + this.headingJitter + 360) % 360, 2),
      speedMps: round(this.speed, 3),
      updateRateHz: this.config.updateRateHz,
      timestampMs: Date.now(),
      simulated: true,
      floorLevel: null,
      altitudeM: 0,
      verticalAccuracyM: 0,
      verticalMotionState: 'static',
      verticalTransitionConfidence: 0,
      venueId: null
    };
  }

  imu(): DevShellImuSample {
    const moving = this.speed > 1;
    return {
      accelMagnitude: Math.max(
        0,
        (moving ? 0.6 : 0.02) + this.noise() * 1.4 * this.chaos
      ),
      verticalAccel: 0,
      gyroMagnitude: Math.max(0, (moving ? 0.06 : 0.005) + Math.abs(this.noise()) * 0.4 * this.chaos),
      barometricAltitudeM: 0,
      timestampMs: Date.now()
    };
  }

  /** Null → let the live engine cope with the mess. That is the test. */
  scriptedIN(): DevShellINState | null {
    return null;
  }

  corridor(): [number, number][] {
    return this.loop;
  }

  reset(): void {
    this.distanceM = 0;
    this.speed = this.config.speedMps;
    this.phase = 'cruise';
    this.phaseRemaining = 3;
    this.headingJitter = 0;
    this.elapsed = 0;
    this.noiseState = this.config.seed ^ 0xc4a05;
  }

  private motionState(): DevShellMotionState {
    if (this.speed < 0.5) return 'still';
    if (this.speed < 2.5) return 'walking';
    return 'driving';
  }

  /** Deterministic noise in [-1, 1]. */
  private noise(): number {
    return this.unit() * 2 - 1;
  }

  /** Deterministic uniform in [0, 1). */
  private unit(): number {
    this.noiseState = (this.noiseState * 1664525 + 1013904223) >>> 0;
    return this.noiseState / 0x100000000;
  }
}

function offset(p: DevShellPosition, metres: number, bearingDeg: number): DevShellPosition {
  if (metres === 0) return { ...p };
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (metres * Math.cos(rad)) / 111320;
  const dLng = (metres * Math.sin(rad)) / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const round = (v: number, dp: number) => Number(v.toFixed(dp));
