// sm-core/ae/dynamic/types.ts
//
// Shared types for the Smart-Maps A/E Dynamic logic layer. Everything here is
// plain data — engines exchange these shapes, never each other's internals.
// All values are computed live per tick; nothing in this layer is pre-baked.

// ─── Geography ───────────────────────────────────────────────────────────────

export interface Position {
  lat: number;
  lng: number;
  altitudeM?: number;
  /** Horizontal accuracy (1σ), metres. */
  accuracyM?: number;
  timestampMs?: number;
}

// ─── Corridor model ──────────────────────────────────────────────────────────

export interface CorridorSegment {
  id: string;
  name?: string;
  /** Ordered polyline, at least 2 points. */
  path: Position[];
  speedLimitMps?: number;
  /** Corridor half-width used for lock tests. Defaults applied by RouteManager. */
  halfWidthM?: number;
  /**
   * A "key segment" is one IN should treat as significant on entry (complex
   * merge, tunnel, multi-lane weave) — PREP → ACTIVE fires when entering it
   * even if no junction is near.
   */
  key?: boolean;
}

export type JunctionKind =
  | 'turn'
  | 'roundabout'
  | 'merge'
  | 'fork'
  | 'crossing'
  | 'terminal';

export interface JunctionNode {
  id: string;
  kind: JunctionKind;
  position: Position;
  /** Place label for terminal nodes, e.g. "Work" for 2 Springwood Drive. */
  label?: string;
}

/** A junction located on the built corridor (chainage = metres from start). */
export interface CorridorJunction {
  node: JunctionNode;
  chainageM: number;
}

/** Result of projecting a raw position onto the corridor centreline. */
export interface CorridorProjection {
  /** Metres along the corridor from its start. */
  chainageM: number;
  /** Signed perpendicular distance from the centreline, metres. */
  lateralOffsetM: number;
  /** The snapped point on the centreline. */
  point: Position;
  /** Corridor tangent heading at the snapped point, degrees. */
  headingDeg: number;
  segmentId: string;
}

// ─── Sensors ─────────────────────────────────────────────────────────────────

export interface GnssFix {
  position: Position;
  /** Ground speed, m/s. Null when the receiver doesn't report one. */
  speedMps: number | null;
  /** Course over ground, degrees. Null when unavailable (e.g. stationary). */
  headingDeg: number | null;
  accuracyM: number;
  timestampMs: number;
}

export interface ImuSample {
  /** Linear acceleration magnitude with gravity removed, m/s². */
  accelMagnitude: number;
  /** Rotation rate magnitude, rad/s. */
  gyroMagnitude: number;
  timestampMs: number;
}

/**
 * The fused view of "what the sensors say right now", produced by
 * SensorFusionCore every tick. Ages are relative to the snapshot time so
 * consumers can reason about staleness without re-reading clocks.
 */
export interface SensorSnapshot {
  timestampMs: number;
  gnss: {
    fix: GnssFix;
    ageMs: number;
  } | null;
  imu: {
    /** Variance of accel magnitude over the recent window — motion energy. */
    accelVariance: number;
    /** Mean gyro magnitude over the recent window. */
    gyroMean: number;
    ageMs: number;
  } | null;
  /** Fused compass heading if a magnetometer/compass feed exists. */
  compassHeadingDeg: number | null;
}

// ─── Motion confidence ───────────────────────────────────────────────────────

export type MotionMode = 'MOVING' | 'STATIONARY_PREDICTIVE' | 'UNKNOWN';

export interface MotionConfidence {
  /** Confidence in the current motion estimate, 0..1. */
  value: number;
  mode: MotionMode;
  /** GNSS quality 0..1 (freshness × accuracy), for downstream weighting. */
  gnssQuality: number;
  /** IMU motion energy 0..1. */
  imuActivity: number;
  updatedAtMs: number;
}

// ─── Position engine output ──────────────────────────────────────────────────

export type PositionSource = 'gnss' | 'gnss-snapped' | 'dead-reckoning' | 'none';

export interface PositionState {
  position: Position;
  speedMps: number;
  headingDeg: number;
  /** Metres along the corridor; null when no route is active. */
  chainageM: number | null;
  /** Lateral offset from the centreline; null when no route is active. */
  lateralOffsetM: number | null;
  corridorLocked: boolean;
  source: PositionSource;
}

// ─── Prediction ──────────────────────────────────────────────────────────────

export interface PredictionResult {
  /** Horizon used, seconds (clamped 5..20). */
  horizonS: number;
  predictedChainageM: number;
  predictedPosition: Position;
  nextJunction: CorridorJunction | null;
  distanceToJunctionNowM: number | null;
  predictedDistanceToJunctionM: number | null;
  /** ETA to the next junction at current effective speed; null if unreachable. */
  etaToJunctionS: number | null;
  /** True when the junction falls inside the prediction horizon. */
  junctionWithinHorizon: boolean;
}

// ─── Always-IN state machine ─────────────────────────────────────────────────

export type INState = 'OFF' | 'PREP' | 'ACTIVE' | 'EXIT';

export interface INStateChange {
  prev: INState;
  next: INState;
  /** Human-readable reason computed from the live inputs that caused it. */
  reason: string;
  atMs: number;
}

/**
 * Everything the UI needs to render Always-IN for one tick. All values are
 * continuous functions of live sensors + corridor — no fixed camera paths.
 */
export interface INViewModel {
  state: INState;
  motionMode: MotionMode;
  cameraPitchDeg: number;
  cameraZoom: number;
  cameraBearingDeg: number;
  /** Point ahead on the corridor the camera should look toward. */
  lookahead: Position | null;
  /** Corridor ribbon render width, metres. */
  corridorWidthM: number;
  /** 0 (no junction near) … 1 (at the junction) — drives tilt/glow/zoom. */
  junctionEmphasis: number;
  distanceToJunctionM: number | null;
  etaToJunctionS: number | null;
  corridorLocked: boolean;
  arrived: boolean;
}

// ─── Arrival + context ───────────────────────────────────────────────────────

export interface ArrivalEvent {
  nodeId: string;
  /** Terminal label, e.g. "Work". */
  label: string | null;
  /** Sanitized event key, e.g. "ARRIVAL_AT_WORK". */
  eventKey: `ARRIVAL_AT_${string}`;
  position: Position;
  atMs: number;
}

export interface KnownPlace {
  label: string;
  position: Position;
  visits: number;
  firstSeenMs: number;
  lastArrivalMs: number;
}

// ─── Event map ───────────────────────────────────────────────────────────────

/**
 * All events the logic layer emits. Arrival additionally fires a dynamic
 * `ARRIVAL_AT_<LABEL>` key (e.g. ARRIVAL_AT_WORK) so app code can subscribe to
 * a specific place without filtering.
 */
export type SMEventMap = {
  'route:set': { segmentCount: number; junctionCount: number; totalLengthM: number };
  'route:cleared': undefined;
  'position:update': PositionState;
  'motion:update': MotionConfidence;
  'corridor:lock': { locked: boolean; lateralOffsetM: number | null };
  'in:state': INStateChange;
  'in:viewmodel': INViewModel;
  arrival: ArrivalEvent;
} & { [K in `ARRIVAL_AT_${string}`]: ArrivalEvent };
