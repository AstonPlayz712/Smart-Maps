/**
 * Indoor multi-floor simulation.
 *
 * Plays an `IndoorJourneyScript` phase by phase, emitting the full 3–7D
 * telemetry: floor level, altitude, vertical accuracy, vertical motion state
 * and transition confidence, alongside the usual horizontal fix.
 *
 * Deterministic: given the same dt sequence it produces identical output, so
 * an indoor session replays exactly.
 */

import type { DevShellConfig } from './config';
import type {
  DevShellImuSample,
  DevShellINState,
  DevShellMotionState,
  DevShellPosition,
  DevShellSample,
  IndoorJourneyScript,
  IndoorPhase,
  SimulationScript
} from './types';

export class IndoorJourneyScriptRunner implements SimulationScript {
  readonly mode = 'indoor' as const;
  readonly deterministic = true;
  readonly name: string;

  private readonly journey: IndoorJourneyScript;
  private readonly rateHz: number;
  private readonly accuracyM: number;
  private readonly verticalAccuracyM: number;

  private phaseIndex = 0;
  private phaseElapsed = 0;
  private elapsed = 0;
  /** Continuous floor position — fractional mid-transition. */
  private floorPosition = 0;
  private verticalRate = 0;
  private lastSpeed = 0;
  private noiseState: number;

  constructor(journey: IndoorJourneyScript, config: DevShellConfig) {
    this.journey = journey;
    this.name = `Indoor journey — ${journey.name}`;
    this.rateHz = config.updateRateHz;
    this.accuracyM = journey.accuracyM ?? 8;
    this.verticalAccuracyM = journey.verticalAccuracyM ?? 3;
    this.noiseState = config.seed ^ 0x1f100;
    this.floorPosition = this.firstFloor();
  }

  advance(dtSeconds: number): DevShellSample {
    const dt = Math.max(0, Math.min(1, dtSeconds));
    this.elapsed += dt;
    this.phaseElapsed += dt;

    const phase = this.currentPhase();
    // Advance through phases, carrying overflow so timing doesn't drift.
    while (this.phaseElapsed >= phase.seconds && this.journey.phases.length > 0) {
      this.phaseElapsed -= phase.seconds;
      this.phaseIndex++;
      if (this.phaseIndex >= this.journey.phases.length) {
        if (this.journey.loop === false) {
          this.phaseIndex = this.journey.phases.length - 1;
          this.phaseElapsed = this.currentPhase().seconds;
          break;
        }
        this.phaseIndex = 0;
      }
      break;
    }

    const active = this.currentPhase();
    const t = active.seconds > 0 ? Math.min(1, this.phaseElapsed / active.seconds) : 1;

    let position: DevShellPosition;
    let speed: number;
    let verticalMotionState: DevShellSample['verticalMotionState'] = 'static';
    let transitionConfidence = 0;

    switch (active.kind) {
      case 'walk': {
        position = lerp(active.from, active.to, t);
        speed = distanceM(active.from, active.to) / Math.max(0.001, active.seconds);
        this.floorPosition = active.floor;
        this.verticalRate = 0;
        break;
      }
      case 'dwell': {
        position = { ...active.at };
        speed = 0;
        this.floorPosition = active.floor;
        this.verticalRate = 0;
        break;
      }
      case 'vertical': {
        position = { ...active.at };
        speed = active.via === 'stairs' ? 0.4 : 0;
        // Floor position moves continuously through the transition, which is
        // what makes egoPose.z rise smoothly rather than snapping.
        this.floorPosition = active.from + (active.to - active.from) * t;
        const floorHeight = this.journey.floorHeightM;
        this.verticalRate = ((active.to - active.from) * floorHeight) / Math.max(0.001, active.seconds);
        verticalMotionState = active.via;
        // Confidence ramps up as the transition establishes, and stays high
        // through the middle — the shape a real classifier produces.
        transitionConfidence = clamp01(0.45 + 0.5 * Math.sin(Math.PI * t));
        break;
      }
      default: {
        position = { lat: 0, lng: 0 };
        speed = 0;
      }
    }

    this.lastSpeed = speed;
    const floorLevel = Math.round(this.floorPosition);

    return {
      position,
      accuracyM: round(this.accuracyM * (1 + 0.15 * this.noise()), 2),
      motionState: this.motionState(speed, verticalMotionState),
      confidence: round(clamp01(0.75 + 0.15 * (1 - Math.abs(this.noise()))), 3),
      headingDeg: round(this.heading(active, t), 2),
      speedMps: round(speed, 3),
      updateRateHz: this.rateHz,
      timestampMs: Date.now(),
      simulated: true,
      // ── 7D ────────────────────────────────────────────────────────────
      floorLevel,
      altitudeM: round(this.floorPosition * this.journey.floorHeightM, 3),
      verticalAccuracyM: round(this.verticalAccuracyM * (1 + 0.2 * Math.abs(this.noise())), 2),
      verticalMotionState,
      verticalTransitionConfidence: round(transitionConfidence, 3),
      venueId: this.journey.venueId
    };
  }

  imu(): DevShellImuSample {
    const climbing = this.verticalRate !== 0;
    const onStairs = this.currentPhase().kind === 'vertical' &&
      (this.currentPhase() as { via?: string }).via === 'stairs';
    return {
      // Stairs produce rhythmic footfalls; a lift is near-silent.
      accelMagnitude: onStairs
        ? 0.9 + 0.5 * Math.sin(this.elapsed * 9)
        : climbing
          ? 0.05
          : this.lastSpeed > 0.5
            ? 0.45 + 0.2 * Math.sin(this.elapsed * 7)
            : 0.01,
      verticalAccel: onStairs ? 1.4 * Math.sin(this.elapsed * 9) : climbing ? 0.06 : 0.01,
      gyroMagnitude: this.lastSpeed > 0.5 ? 0.05 : 0.005,
      barometricAltitudeM: this.floorPosition * this.journey.floorHeightM,
      timestampMs: Date.now()
    };
  }

  /** Indoor journeys let the live Always-IN engine run. */
  scriptedIN(): DevShellINState | null {
    return null;
  }

  /** Indoor movement follows the venue graph, not a road corridor. */
  corridor(): [number, number][] {
    const points: [number, number][] = [];
    for (const phase of this.journey.phases) {
      if (phase.kind === 'walk') {
        points.push([phase.from.lng, phase.from.lat], [phase.to.lng, phase.to.lat]);
      }
    }
    return points;
  }

  reset(): void {
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.elapsed = 0;
    this.floorPosition = this.firstFloor();
    this.verticalRate = 0;
    this.lastSpeed = 0;
  }

  /** The venue this journey walks — the renderer loads its floor plans. */
  venueId(): string {
    return this.journey.venueId;
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private currentPhase(): IndoorPhase {
    return (
      this.journey.phases[this.phaseIndex] ?? {
        kind: 'dwell',
        floor: 0,
        at: { lat: 0, lng: 0 },
        seconds: 1
      }
    );
  }

  private firstFloor(): number {
    const first = this.journey.phases[0];
    if (!first) return 0;
    return first.kind === 'vertical' ? first.from : first.floor;
  }

  private motionState(speed: number, vertical: string): DevShellMotionState {
    if (vertical === 'stairs') return 'walking';
    if (vertical === 'lift' || vertical === 'escalator') return 'still';
    return speed < 0.3 ? 'still' : 'walking';
  }

  private heading(phase: IndoorPhase, t: number): number {
    if (phase.kind !== 'walk') return this.lastHeading;
    this.lastHeading = bearingDeg(phase.from, phase.to);
    return this.lastHeading;
  }

  private lastHeading = 0;

  private noise(): number {
    this.noiseState = (this.noiseState * 1664525 + 1013904223) >>> 0;
    return (this.noiseState / 0x100000000) * 2 - 1;
  }
}

// ─── geo helpers ────────────────────────────────────────────────────────────

function lerp(a: DevShellPosition, b: DevShellPosition, t: number): DevShellPosition {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function distanceM(a: DevShellPosition, b: DevShellPosition): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: DevShellPosition, b: DevShellPosition): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const round = (v: number, dp: number) => Number(v.toFixed(dp));
