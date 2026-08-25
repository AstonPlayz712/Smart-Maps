/**
 * SmartMapsAE positional model — 3D through 7D, indoor-aware.
 *
 * Extends the flat lat/lng/accuracy fix with the vertical dimension every
 * indoor feature needs: which floor, how confident we are in that, whether the
 * user is moving between floors and how.
 *
 * Every telemetry provider emits this shape — simulated (DevShell) and native
 * alike — so nothing downstream needs a provider-specific branch.
 */

export type VerticalMotionState = 'stairs' | 'lift' | 'escalator' | 'static';

export interface HorizontalFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy, metres. */
  accuracyM: number;
  /** Course over ground, degrees. */
  headingDeg: number;
  /** Ground speed, m/s. */
  speedMps: number;
}

export interface VerticalFix {
  /** Floor index. 0 = ground, negative = below grade. Null outdoors. */
  floorLevel: number | null;
  /** Height above venue ground, metres — this is egoPose.z's source. */
  altitudeM: number;
  /** Vertical accuracy, metres. Typically 2–5 m indoors. */
  verticalAccuracyM: number;
  /** How the user is moving vertically right now. */
  verticalMotionState: VerticalMotionState;
  /** Confidence that a floor transition is genuinely happening, 0…1. */
  verticalTransitionConfidence: number;
}

/** The full positional state: horizontal + vertical + provenance. */
export interface SMPosition extends HorizontalFix, VerticalFix {
  timestampMs: number;
  /** Venue providing the floor frame of reference, when indoors. */
  venueId: string | null;
  /** True when this came from a simulation rather than hardware. */
  simulated: boolean;
}

/** A position with nothing known yet — used before the first fix lands. */
export function emptyPosition(timestampMs = Date.now()): SMPosition {
  return {
    lat: 0,
    lng: 0,
    accuracyM: Number.POSITIVE_INFINITY,
    headingDeg: 0,
    speedMps: 0,
    floorLevel: null,
    altitudeM: 0,
    verticalAccuracyM: Number.POSITIVE_INFINITY,
    verticalMotionState: 'static',
    verticalTransitionConfidence: 0,
    timestampMs,
    venueId: null,
    simulated: false
  };
}

/**
 * Whether a fix is good enough to *use*. Deliberately generous.
 *
 * BUG FIX (boot timeout when GNSS accuracy > 30 m): boot used to gate on an
 * accuracy threshold, so a first fix of 30 m+ — completely normal indoors, in
 * a city street, or on a cold start — was discarded, leaving boot waiting for
 * a fix that might never improve, until the watchdog fired. Usability and
 * *quality* are now separate questions: any finite, real fix is usable (boot
 * proceeds), and `positionQuality` grades it for display and fusion weighting.
 */
export function isUsableFix(position: SMPosition): boolean {
  return (
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Number.isFinite(position.accuracyM) &&
    position.accuracyM > 0
  );
}

export type PositionQuality = 'precise' | 'good' | 'coarse' | 'degraded';

/** Grade a fix for display; never used to block boot. */
export function positionQuality(position: SMPosition): PositionQuality {
  const a = position.accuracyM;
  if (!Number.isFinite(a)) return 'degraded';
  if (a <= 10) return 'precise';
  if (a <= 30) return 'good';
  if (a <= 100) return 'coarse';
  return 'degraded';
}

/** True when the fix carries a usable floor estimate. */
export function hasFloorFix(position: SMPosition): boolean {
  return (
    position.floorLevel !== null &&
    Number.isFinite(position.verticalAccuracyM) &&
    position.verticalAccuracyM <= 8
  );
}

/**
 * Smooth a heading, holding it steady at low speed.
 *
 * BUG FIX (heading jitter at low speeds): course over ground is derived from
 * consecutive positions, so at walking pace or a standstill it is dominated by
 * GNSS noise and the arrow spun on the spot. Below `holdBelowMps` the previous
 * heading is held; above it, the new heading is blended in proportionally, so
 * the transition is smooth rather than a snap.
 */
export function stabiliseHeading(
  previousDeg: number,
  measuredDeg: number,
  speedMps: number,
  holdBelowMps = 1.2,
  fullTrustAtMps = 3.5
): number {
  if (!Number.isFinite(measuredDeg)) return previousDeg;
  if (speedMps < holdBelowMps) return previousDeg;

  const trust = Math.min(
    1,
    (speedMps - holdBelowMps) / Math.max(0.001, fullTrustAtMps - holdBelowMps)
  );
  const delta = ((measuredDeg - previousDeg + 540) % 360) - 180;
  return (previousDeg + delta * trust + 360) % 360;
}
