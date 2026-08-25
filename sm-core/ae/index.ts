/**
 * sm-core/ae — the A/E Dynamic module.
 *
 * Owns everything positional: fusion, altitude and floor resolution, motion
 * mode inference, confidence, trajectory prediction, ego pose, and Always-IN
 * (both the horizontal corridor state machine and the vertical phase).
 *
 * One entry point, `AEModule`, so `DSE` never reaches into the parts. Import it
 * as `sm-core/ae`.
 */

import type { GnssSample, ImuSample } from '../types';
import { IMUProcessor, type MotionEstimate } from './IMU';
import { FusionEngine, type VenueFrame } from './Fusion';
import { TrajectoryPredictor, type TrajectoryPrediction } from './Trajectory';
import { EgoPoseTracker, type EgoPose } from './EgoPose';
import { AlwaysINTracker, type AlwaysINState } from './AlwaysIN';
import { emptyPosition, type SMPosition } from './Position';
import { SMCore } from './dynamic/SMCore';
import type { CorridorSegment, GnssFix, INState, JunctionNode } from './dynamic/types';

export interface AEOptions {
  now?: () => number;
  predictionHorizonS?: number;
  /** Storey pitch used to anchor ego z to the floor model, metres. */
  floorHeightM?: number;
}

/** Everything one A/E tick produces. Plain data — no engine internals escape. */
export interface AEUpdate {
  position: SMPosition;
  ego: EgoPose;
  motion: MotionEstimate;
  alwaysIN: AlwaysINState;
  trajectory: TrajectoryPrediction;
}

export class AEModule {
  /** The corridor/route engine: Always-IN horizontal state, arrival, context. */
  readonly dynamic: SMCore;

  private readonly imu: IMUProcessor;
  private readonly fusion: FusionEngine;
  private readonly trajectory: TrajectoryPredictor;
  private readonly ego: EgoPoseTracker;
  private readonly alwaysIN: AlwaysINTracker;
  private readonly now: () => number;

  private lastSampleMs: number | null = null;
  private lastUpdate: AEUpdate;

  constructor(opts: AEOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.imu = new IMUProcessor();
    this.fusion = new FusionEngine(this.now);
    this.trajectory = new TrajectoryPredictor(opts.predictionHorizonS ?? 12);
    this.ego = new EgoPoseTracker({ floorHeightM: opts.floorHeightM });
    this.alwaysIN = new AlwaysINTracker();
    this.dynamic = new SMCore({
      now: this.now,
      predictionHorizonS: opts.predictionHorizonS
    });
    this.lastUpdate = {
      position: emptyPosition(this.now()),
      ego: this.ego.current(),
      motion: {
        horizontal: 'unknown',
        vertical: 'static',
        confidence: 0,
        verticalTransitionConfidence: 0,
        verticalRateMps: 0,
        imuActivity: 0
      },
      alwaysIN: {
        corridor: 'OFF',
        vertical: 'level',
        floorLevel: null,
        targetFloorLevel: null,
        verticalMotionState: 'static',
        verticalTransitionConfidence: 0,
        changingFloor: false
      },
      trajectory: {
        horizonS: opts.predictionHorizonS ?? 12,
        predicted: { lng: 0, lat: 0 },
        distanceM: 0,
        confidence: 0
      }
    };
  }

  /**
   * Prepare the module. Synchronous and total: there is nothing to wait for, so
   * there is no state in which A/E "has not finished starting".
   */
  init(): void {
    this.dynamic.init();
  }

  /** The last computed state, without advancing anything. */
  current(): AEUpdate {
    return this.lastUpdate;
  }

  /** Set (or clear) the venue frame the vertical dimension resolves against. */
  setVenueFrame(frame: VenueFrame | null): void {
    this.fusion.setVenueFrame(frame);
  }

  /** Activate a corridor route; Always-IN's horizontal states follow from it. */
  setRoute(segments: CorridorSegment[], junctions: JunctionNode[]): void {
    this.dynamic.setRoute(segments, junctions);
  }

  clearRoute(): void {
    this.dynamic.clearRoute();
  }

  reset(): void {
    const t = this.now();
    this.imu.reset();
    this.fusion.reset(t);
    this.ego.reset();
    this.alwaysIN.reset();
    this.dynamic.reset();
    this.lastSampleMs = null;
  }

  /**
   * Advance one tick from a paired GNSS + IMU sample.
   *
   * `dtMs` is derived from the sample timestamps, so replaying a recorded trace
   * produces exactly the same output as running it live.
   */
  update(gnss: GnssSample, imu: ImuSample, distanceToConnectorM: number | null = null): AEUpdate {
    const stamp = Number.isFinite(imu.timestampMs) ? imu.timestampMs : gnss.timestampMs;
    const dtMs = this.lastSampleMs === null ? 0 : Math.max(0, stamp - this.lastSampleMs);
    this.lastSampleMs = stamp;

    // 1. Inertial classification: motion mode, vertical state, confidence.
    this.imu.push(imu);
    const motion = this.imu.update(dtMs, gnss.speedMps ?? null);

    // 2. Fusion: one authoritative position, horizontal and vertical.
    const position = this.fusion.fuse(gnss, motion, imu.barometricAltitudeM ?? null);

    // 3. Corridor engine: Always-IN's horizontal state machine.
    this.dynamic.pushGnss(toGnssFix(gnss));
    this.dynamic.pushImu({
      accelMagnitude: imu.accelMagnitude,
      gyroMagnitude: imu.gyroMagnitude,
      timestampMs: imu.timestampMs
    });
    if (imu.compassHeadingDeg !== undefined && imu.compassHeadingDeg !== null) {
      this.dynamic.pushCompassHeading(imu.compassHeadingDeg, imu.timestampMs);
    }
    const corridor: INState = this.dynamic.tick(dtMs).state;

    // 4. Ego pose, with z locked while nothing is moving vertically.
    const ego = this.ego.update(position, motion.verticalRateMps, dtMs / 1000);

    // 5. Always-IN's vertical phase, and the forward projection.
    const alwaysIN = this.alwaysIN.update(position, corridor, dtMs, distanceToConnectorM);
    const trajectory = this.trajectory.predict(position, motion.confidence);

    this.lastUpdate = { position, ego, motion, alwaysIN, trajectory };
    return this.lastUpdate;
  }
}

/** Adapt the boundary sample to the corridor engine's fix shape. */
function toGnssFix(gnss: GnssSample): GnssFix {
  return {
    position: {
      lat: gnss.lat,
      lng: gnss.lng,
      altitudeM: gnss.altitudeM ?? undefined,
      accuracyM: gnss.accuracyM,
      timestampMs: gnss.timestampMs
    },
    speedMps: Number.isFinite(gnss.speedMps ?? NaN) ? (gnss.speedMps as number) : null,
    headingDeg: Number.isFinite(gnss.headingDeg ?? NaN) ? (gnss.headingDeg as number) : null,
    accuracyM: gnss.accuracyM,
    timestampMs: gnss.timestampMs
  };
}

// ─── public surface of sm-core/ae ────────────────────────────────────────────

export { FusionEngine, type VenueFrame } from './Fusion';
export { TrajectoryPredictor, type TrajectoryPrediction } from './Trajectory';
export { IMUProcessor, type MotionEstimate, type HorizontalMotionState, type IMUSample } from './IMU';
export { EgoPoseTracker, type EgoPose, type EgoPoseOptions } from './EgoPose';
export { AlwaysINTracker, verticalGuidance, type AlwaysINState, type VerticalINPhase } from './AlwaysIN';
export {
  emptyPosition,
  isUsableFix,
  hasFloorFix,
  positionQuality,
  stabiliseHeading,
  type SMPosition,
  type PositionQuality,
  type VerticalMotionState,
  type HorizontalFix,
  type VerticalFix
} from './Position';
export { SMCore } from './dynamic/SMCore';
export type {
  CorridorSegment,
  JunctionNode,
  INState,
  INViewModel,
  ArrivalEvent,
  MotionMode,
  PositionState
} from './dynamic/types';
