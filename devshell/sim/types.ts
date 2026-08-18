/**
 * DevShell simulation contracts.
 *
 * A "simulation script" is the thing that decides, for every instant of a
 * DevShell session, what the hardware *would* have reported: a GNSS sample, an
 * IMU packet, and optionally a scripted Always-IN state. `DevShellRuntime`
 * drives one of these instead of reading sensors.
 *
 * Everything here is web/Windows-only. The iOS and Android native builds bind
 * their own adapters to real frameworks and never see this module.
 */

import type {
  DevShellImuSample,
  DevShellMotionState,
  DevShellPosition,
  DevShellSample
} from '../src/types';

export type { DevShellImuSample, DevShellMotionState, DevShellPosition, DevShellSample };

/** Which simulation drives the session. */
export type DevShellMode = 'looped' | 'path' | 'static' | 'chaotic';

/**
 * DevShell's Always-IN vocabulary.
 *
 * NOTE: this is a **superset** of the shared engine's `INState`
 * (`OFF | PREP | ACTIVE | EXIT`). `HOLD` does not exist in the real Always-IN
 * state machine and is not being added to it — introducing a state there would
 * change live product behaviour, not just DevShell. Instead DevShell reports
 * HOLD when the engine is ACTIVE but the vehicle has been dwelling (stopped at
 * a junction), and scripted journeys may name it directly. Consumers that only
 * understand the four engine states can map HOLD → ACTIVE.
 */
export type DevShellINState = 'OFF' | 'PREP' | 'ACTIVE' | 'HOLD' | 'EXIT';

/** One waypoint of a GNSS playback path. */
export interface GnssPathPoint {
  lat: number;
  lng: number;
  /** Horizontal accuracy at this point, metres. Defaults to the script's base. */
  accuracyM?: number;
  /** Course override, degrees. Defaults to the bearing toward the next point. */
  headingDeg?: number;
  /** Ground speed used to travel *toward the next point*, m/s. */
  speedMps?: number;
  /** Dwell here for this long before moving on — models a stop. */
  holdSeconds?: number;
}

/** A scripted motion phase. */
export interface MotionPhase {
  state: DevShellMotionState;
  seconds: number;
}

/** A scripted Always-IN phase. */
export interface INPhase {
  state: DevShellINState;
  seconds: number;
}

/**
 * A complete, configurable journey: the GNSS path plus optional motion and
 * Always-IN timelines. Drop new ones in `devshell/sim/journeys/`.
 */
export interface JourneyScript {
  id: string;
  name: string;
  path: GnssPathPoint[];
  /** Cruise speed for legs with no explicit `speedMps`. */
  speedMps?: number;
  /** Baseline accuracy for points with no explicit `accuracyM`. */
  accuracyM?: number;
  /** Scripted motion states. When absent, motion is derived from speed. */
  motionSequence?: MotionPhase[];
  /** Scripted Always-IN timeline. When absent, the live engine drives it. */
  inTimeline?: INPhase[];
  /** Restart at the beginning when the path ends. Default true. */
  loop?: boolean;
}

/**
 * The interface `DevShellRuntime` drives. `advance(0)` must be valid and must
 * produce a usable sample — that is what lets boot publish a fix, an IMU packet
 * and an ego pose synchronously.
 */
export interface SimulationScript {
  readonly mode: DevShellMode;
  readonly name: string;
  /** True when identical dt sequences produce identical samples. */
  readonly deterministic: boolean;

  /** Advance and return the sample for this instant. */
  advance(dtSeconds: number): DevShellSample;

  /** The IMU packet matching the current motion. */
  imu(): DevShellImuSample;

  /**
   * Scripted Always-IN state, or null to let the live engine decide (with
   * DevShell deriving HOLD from dwell).
   */
  scriptedIN(): DevShellINState | null;

  /** Corridor for the Always-IN engine as [lng, lat] pairs; [] for none. */
  corridor(): [number, number][];

  reset(): void;
}
