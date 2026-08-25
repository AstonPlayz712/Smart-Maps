/**
 * DevShell telemetry — the simulated equivalent of what the native providers
 * emit. The field set deliberately mirrors the native side so nothing
 * downstream can tell the difference:
 *
 *   native (iOS SMLiveState / Android FusedFix + MovementEstimate)
 *     coordinate · accuracyM · motion state · confidence · headingDeg · Hz
 *
 *   DevShell (this type)
 *     position  · accuracyM · motionState  · confidence · headingDeg · updateRateHz
 */

export type DevShellMotionState = 'still' | 'walking' | 'driving' | 'unknown';

export interface DevShellPosition {
  lat: number;
  lng: number;
}

export type DevShellVerticalMotionState = 'stairs' | 'lift' | 'escalator' | 'static';

export interface DevShellSample {
  /** Simulated position on the DevShell route. */
  position: DevShellPosition;
  /** Simulated horizontal accuracy, metres. */
  accuracyM: number;
  /** Simulated motion classification. */
  motionState: DevShellMotionState;
  /** Confidence in the estimate, 0…1. */
  confidence: number;
  /** Course over ground, degrees from true north. */
  headingDeg: number;
  /** Ground speed, m/s. */
  speedMps: number;
  /** Measured emission rate of this feed, Hz. */
  updateRateHz: number;
  /** Epoch ms this sample represents. */
  timestampMs: number;
  /** Always true — marks the feed as simulated for any consumer that cares. */
  simulated: true;

  // ── 3–7D indoor fields (mirrors sm-core/ae/Position.ts) ───────────────
  /** Floor index; null outdoors. */
  floorLevel: number | null;
  /** Height above venue ground, metres — the source of egoPose.z. */
  altitudeM: number;
  /** Vertical accuracy, metres (2–5 m indoors). */
  verticalAccuracyM: number;
  /** How the subject is moving vertically. */
  verticalMotionState: DevShellVerticalMotionState;
  /** Confidence a floor transition is happening, 0…1. */
  verticalTransitionConfidence: number;
  /** Venue providing the floor frame of reference; null outdoors. */
  venueId: string | null;
}

export interface DevShellImuSample {
  /** Linear acceleration magnitude, gravity removed, m/s². */
  accelMagnitude: number;
  /** Vertical component of linear acceleration, m/s² (up positive). */
  verticalAccel: number;
  /** Rotation rate magnitude, rad/s. */
  gyroMagnitude: number;
  /** Simulated barometric altitude, metres — drives vertical classification. */
  barometricAltitudeM: number;
  timestampMs: number;
}

export interface DevShellOptions {
  /** Emission rate for the simulated feeds, Hz. Default 10. */
  updateRateHz?: number;
  /** Route the simulated vehicle drives, as [lng, lat] pairs. */
  route?: [number, number][];
  /** Cruise speed along the route, m/s. Default 12 (~43 km/h). */
  speedMps?: number;
  /** Baseline accuracy of the simulated fix, metres. Default 6. */
  accuracyM?: number;
  /** Seed for the deterministic noise generator. */
  seed?: number;
}
