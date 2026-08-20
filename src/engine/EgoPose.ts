/**
 * EgoPose — the subject's pose in the world, now with a vertical axis.
 *
 * `z` is metres above venue ground, which is what the map renderer raises the
 * camera by indoors and what the 3D→7D pipeline consumes as the vertical
 * dimension. It is deliberately *not* raw barometric altitude: barometers
 * drift with weather and door pressure, so z is anchored to the floor model
 * and only allowed to move when there is real evidence of vertical motion.
 */

import type { SMPosition, VerticalMotionState } from '../telemetry/Position';

export interface EgoPose {
  location: { lng: number; lat: number };
  /** Metres above venue ground. */
  z: number;
  headingDeg: number;
  speedMps: number;
  /** Vertical rate, m/s (positive = ascending). */
  verticalRateMps: number;
  floorLevel: number | null;
  verticalMotionState: VerticalMotionState;
  timestampMs: number;
}

export interface EgoPoseOptions {
  /** Height of one floor, metres — used to anchor z to the floor model. */
  floorHeightM?: number;
  /** Vertical rate below which the subject counts as vertically static. */
  staticRateMps?: number;
  /** Seconds of stillness before z is hard-locked. */
  lockAfterSeconds?: number;
}

/**
 * Tracks ego pose over time, holding z steady when nothing is actually
 * moving vertically.
 */
export class EgoPoseTracker {
  private pose: EgoPose;
  private readonly floorHeightM: number;
  private readonly staticRateMps: number;
  private readonly lockAfterSeconds: number;

  /** Seconds spent vertically static — drives the z lock. */
  private staticFor = 0;
  /** z value z is locked to while static. */
  private lockedZ: number | null = null;

  constructor(opts: EgoPoseOptions = {}) {
    this.floorHeightM = opts.floorHeightM ?? 4.2;
    this.staticRateMps = opts.staticRateMps ?? 0.08;
    this.lockAfterSeconds = opts.lockAfterSeconds ?? 1.5;
    this.pose = {
      location: { lng: 0, lat: 0 },
      z: 0,
      headingDeg: 0,
      speedMps: 0,
      verticalRateMps: 0,
      floorLevel: null,
      verticalMotionState: 'static',
      timestampMs: Date.now()
    };
  }

  current(): EgoPose {
    return { ...this.pose, location: { ...this.pose.location } };
  }

  reset(): void {
    this.staticFor = 0;
    this.lockedZ = null;
  }

  /**
   * Fold a new position into the pose.
   *
   * BUG FIX (ego pose drifting vertically during static periods): z used to
   * integrate the vertical rate continuously, so barometric noise accumulated
   * while the user stood still and the camera slowly sank through the floor.
   * Now, once the subject has been vertically static for `lockAfterSeconds`,
   * z is *locked* to the floor's modelled elevation and stops integrating
   * entirely. Any genuine vertical motion (a committed non-static state with
   * real rate) releases the lock immediately, so responsiveness is unaffected.
   */
  update(position: SMPosition, verticalRateMps: number, dtSeconds: number): EgoPose {
    const dt = Math.max(0, Math.min(2, dtSeconds));

    const verticallyMoving =
      position.verticalMotionState !== 'static' &&
      Math.abs(verticalRateMps) >= this.staticRateMps;

    if (verticallyMoving) {
      this.staticFor = 0;
      this.lockedZ = null;
    } else {
      this.staticFor += dt;
    }

    // Anchor: the floor model is the truth for height; the barometer only
    // says *how* we are moving, never where we ultimately are.
    const anchorZ =
      position.floorLevel !== null
        ? position.floorLevel * this.floorHeightM
        : position.altitudeM;

    let z: number;
    if (!verticallyMoving && this.staticFor >= this.lockAfterSeconds) {
      // Locked: pin to the anchor and stop integrating.
      if (this.lockedZ === null) this.lockedZ = anchorZ;
      z = this.lockedZ;
    } else if (verticallyMoving) {
      // Integrate, but keep pulling toward the floor anchor so a long climb
      // cannot accumulate unbounded error.
      const integrated = this.pose.z + verticalRateMps * dt;
      z = integrated + (anchorZ - integrated) * 0.08;
    } else {
      // Settling: ease toward the anchor without integrating noise.
      z = this.pose.z + (anchorZ - this.pose.z) * (1 - Math.exp(-dt / 0.6));
    }

    this.pose = {
      location: { lng: position.lng, lat: position.lat },
      z: round(z, 3),
      headingDeg: position.headingDeg,
      speedMps: position.speedMps,
      verticalRateMps: verticallyMoving ? verticalRateMps : 0,
      floorLevel: position.floorLevel,
      verticalMotionState: position.verticalMotionState,
      timestampMs: position.timestampMs
    };
    return this.current();
  }

  /** True while z is pinned — surfaced in diagnostics. */
  isVerticallyLocked(): boolean {
    return this.lockedZ !== null;
  }
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));
