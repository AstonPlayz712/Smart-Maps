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
}

export interface DevShellImuSample {
  /** Linear acceleration magnitude, gravity removed, m/s². */
  accelMagnitude: number;
  /** Rotation rate magnitude, rad/s. */
  gyroMagnitude: number;
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
