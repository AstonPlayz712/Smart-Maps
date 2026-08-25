/**
 * sm-core/types — the platform-agnostic boundary types.
 *
 * Smart-Maps is a Dynamic Spatial Engine, not an operating system. These are
 * the only shapes a host platform has to know about: a GNSS sample, an IMU
 * sample, a render surface, and the frame-level state the engine hands back.
 * Everything else is internal to the engine.
 *
 * Web and mobile hosts feed the *same* sample shapes, so `DSE` behaves
 * identically on both — no per-platform branch exists inside the engine.
 */

/** A single satellite/network position sample, exactly as a platform reports it. */
export interface GnssSample {
  lat: number;
  lng: number;
  /** Horizontal accuracy (1σ), metres. Coarse is still usable — never a reason to stall. */
  accuracyM: number;
  /** Course over ground, degrees. Null/undefined when the receiver has none. */
  headingDeg?: number | null;
  /** Ground speed, m/s. Null/undefined when the receiver has none. */
  speedMps?: number | null;
  /** Altitude above the WGS-84 ellipsoid or venue ground, metres. */
  altitudeM?: number | null;
  /** Vertical accuracy, metres. */
  verticalAccuracyM?: number | null;
  timestampMs: number;
  /** True when produced by DevShell/simulation rather than hardware. */
  simulated?: boolean;
}

/**
 * A single inertial sample. A superset of what each internal consumer needs,
 * so one shape crosses the boundary and the engine adapts internally.
 */
export interface ImuSample {
  /** Linear acceleration magnitude, gravity removed, m/s². */
  accelMagnitude: number;
  /** Vertical component of linear acceleration, m/s² (up positive). */
  verticalAccel: number;
  /** Rotation rate magnitude, rad/s. */
  gyroMagnitude: number;
  /** Barometric altitude when the device has a barometer, metres. */
  barometricAltitudeM?: number;
  /** Fused compass heading, degrees, when the device has a magnetometer. */
  compassHeadingDeg?: number | null;
  timestampMs: number;
}

/**
 * A drawable surface supplied by the host.
 *
 * The engine never creates one and never assumes a DOM: the web shell passes a
 * Canvas2D backend, a native shell passes its own. With no surface attached the
 * engine still runs — `renderFrame()` simply produces no draw call.
 */
export type RenderSurface = import('./renderer/MapRenderer').RenderBackend;

/** Geographic point, engine-wide. */
export interface LngLatPoint {
  lng: number;
  lat: number;
}

export interface DseOptions {
  /** Tile root the four families hang off. Relative by default. */
  tileBaseUrl?: string;
  /** Deepest zoom the tile source publishes; deeper requests overzoom. */
  maxSourceZoom?: number;
  /** Draw surface. Can also be attached later with `attachSurface`. */
  surface?: RenderSurface | null;
  /**
   * Draw internal engine layers. Defaults to **false** — internals are opt-in,
   * never opt-out, so nothing internal can reach a shipped UI by accident.
   */
  debugMode?: boolean;
  /** Draw 3D building meshes. */
  buildings3D?: boolean;
  /** Injectable fetch, for native hosts and tests. */
  fetchImpl?: typeof fetch;
  /** Clock override for deterministic replay. */
  now?: () => number;
  /** Seconds of forward trajectory the A/E module predicts. */
  predictionHorizonS?: number;
}

/**
 * What the engine knows right now. Returned by `DSE.getState()`; it is a
 * snapshot, safe to hold, and contains no internal layer geometry.
 */
export interface DseState {
  ready: boolean;
  position: import('./ae/Position').SMPosition;
  ego: import('./ae/EgoPose').EgoPose;
  motion: import('./ae/IMU').MotionEstimate;
  alwaysIN: import('./ae/AlwaysIN').AlwaysINState;
  /** Constant-velocity forward projection over the configured horizon. */
  trajectory: import('./ae/Trajectory').TrajectoryPrediction;
  /** Dimensional summary, 3D → 7D. */
  dimensions: import('./dimensions').DimensionalState;
  /** Floor everything is currently clipped to; null outdoors. */
  activeFloorLevel: number | null;
  venueId: string | null;
}
