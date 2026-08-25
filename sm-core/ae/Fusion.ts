/**
 * A/E fusion — turns a raw platform GNSS sample plus the IMU motion estimate
 * into one authoritative `SMPosition`.
 *
 * Three things happen here that a raw fix cannot do on its own:
 *
 *   1. **Heading is stabilised.** Course over ground is derived from
 *      consecutive fixes, so at walking pace it is noise. `stabiliseHeading`
 *      holds the previous heading below 1.2 m/s and blends above it.
 *   2. **Speed is corroborated by the IMU.** A receiver reporting 0.4 m/s while
 *      the IMU says "still" is standing still; the fused speed says so too.
 *   3. **The vertical dimension is filled in.** GNSS altitude is poor and often
 *      absent, so barometric altitude (when present) wins, and the floor index
 *      comes from the venue frame rather than from the fix.
 *
 * A coarse fix is never discarded. Accuracy grades a fix, it does not gate it —
 * discarding coarse fixes is what used to leave the engine with no position at
 * all on a cold or indoor start.
 */

import type { GnssSample } from '../types';
import type { MotionEstimate } from './IMU';
import { emptyPosition, isUsableFix, stabiliseHeading, type SMPosition } from './Position';

/**
 * The venue frame the vertical dimension is expressed in.
 *
 * `groundAltitudeM` is the altitude the venue calls floor 0, and
 * `floorHeightM` is the storey pitch — together they turn an altitude into a
 * floor index. Null venue = outdoors, and `floorLevel` stays null.
 */
export interface VenueFrame {
  venueId: string;
  groundAltitudeM: number;
  floorHeightM: number;
  /** Floors the venue actually has, used to clamp the derived index. */
  levels: number[];
}

/** Below this GNSS speed, an IMU that says "still" wins. */
const IMU_STILL_VETO_MPS = 0.7;

export class FusionEngine {
  private previous: SMPosition;
  private venue: VenueFrame | null = null;

  constructor(now: () => number = Date.now) {
    this.previous = emptyPosition(now());
  }

  /** Set (or clear, with null) the venue the vertical dimension resolves against. */
  setVenueFrame(frame: VenueFrame | null): void {
    this.venue = frame;
  }

  venueFrame(): VenueFrame | null {
    return this.venue;
  }

  current(): SMPosition {
    return this.previous;
  }

  reset(timestampMs: number): void {
    this.previous = emptyPosition(timestampMs);
  }

  /**
   * Fuse one sample. Returns the new authoritative position; when the sample is
   * unusable (NaN coordinates, non-finite accuracy) the previous position is
   * held rather than replaced with garbage.
   */
  fuse(gnss: GnssSample, motion: MotionEstimate, barometricAltitudeM: number | null): SMPosition {
    const candidate: SMPosition = {
      ...this.previous,
      lat: gnss.lat,
      lng: gnss.lng,
      accuracyM: gnss.accuracyM,
      timestampMs: gnss.timestampMs,
      simulated: gnss.simulated ?? this.previous.simulated
    };
    if (!isUsableFix(candidate)) return this.previous;

    // ── speed: the IMU vetoes receiver creep ────────────────────────────────
    const reported = Number.isFinite(gnss.speedMps ?? NaN) ? Math.max(0, gnss.speedMps as number) : 0;
    const speedMps =
      motion.horizontal === 'still' && reported < IMU_STILL_VETO_MPS ? 0 : reported;

    // ── heading: held at low speed, blended above it ────────────────────────
    const measured = Number.isFinite(gnss.headingDeg ?? NaN)
      ? (gnss.headingDeg as number)
      : this.previous.headingDeg;
    const headingDeg = stabiliseHeading(this.previous.headingDeg, measured, speedMps);

    // ── vertical: barometer beats GNSS altitude when present ────────────────
    const altitudeM =
      barometricAltitudeM ??
      (Number.isFinite(gnss.altitudeM ?? NaN) ? (gnss.altitudeM as number) : this.previous.altitudeM);

    const verticalAccuracyM = this.resolveVerticalAccuracy(gnss, barometricAltitudeM);
    const floorLevel = this.resolveFloor(altitudeM);

    this.previous = {
      lat: gnss.lat,
      lng: gnss.lng,
      accuracyM: gnss.accuracyM,
      headingDeg,
      speedMps,
      floorLevel,
      altitudeM,
      verticalAccuracyM,
      verticalMotionState: motion.vertical,
      verticalTransitionConfidence: motion.verticalTransitionConfidence,
      timestampMs: gnss.timestampMs,
      venueId: this.venue?.venueId ?? null,
      simulated: gnss.simulated ?? false
    };
    return this.previous;
  }

  /**
   * Barometric altitude is good to a couple of metres; GNSS altitude is roughly
   * 1.5× worse than its horizontal accuracy and is what we fall back to.
   */
  private resolveVerticalAccuracy(gnss: GnssSample, barometric: number | null): number {
    if (barometric !== null) return 2.5;
    if (Number.isFinite(gnss.verticalAccuracyM ?? NaN)) return gnss.verticalAccuracyM as number;
    if (Number.isFinite(gnss.accuracyM)) return gnss.accuracyM * 1.5;
    return Number.POSITIVE_INFINITY;
  }

  /** Altitude → floor index, within the venue frame. Null when outdoors. */
  private resolveFloor(altitudeM: number): number | null {
    const frame = this.venue;
    if (!frame || !Number.isFinite(altitudeM)) return null;
    const pitch = frame.floorHeightM > 0 ? frame.floorHeightM : 4.2;
    const raw = Math.round((altitudeM - frame.groundAltitudeM) / pitch);
    if (frame.levels.length === 0) return raw;
    // Snap to the nearest floor the venue actually has, so a half-storey
    // reading on a mezzanine cannot invent a level that does not exist.
    let best = frame.levels[0];
    for (const level of frame.levels) {
      if (Math.abs(level - raw) < Math.abs(best - raw)) best = level;
    }
    return best;
  }
}
