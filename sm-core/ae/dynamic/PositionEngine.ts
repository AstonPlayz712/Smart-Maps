// sm-core/ae/dynamic/PositionEngine.ts
//
// Produces the single authoritative position state per tick by fusing:
//   • fresh GNSS fixes, snapped to the corridor when plausibly on it
//   • dead reckoning along the corridor when GNSS is weak/stale/slow
//   • corridor-tangent heading when the GNSS course is unreliable
//
// Corridor lock is hysteretic: lock inside the corridor half-width (widened by
// GNSS accuracy), unlock only after being sustainedly outside a wider band —
// one noisy fix never breaks the lock.

import type {
  MotionConfidence,
  Position,
  PositionState,
  SensorSnapshot
} from './types';
import type { RouteManager } from './RouteManager';
import type { DeadReckoningEngine } from './DeadReckoningEngine';

const GNSS_USABLE_AGE_MS = 3000;
const GNSS_USABLE_ACCURACY_M = 60;
/** Below this GNSS speed, DR (with IMU-decayed speed) takes over advancement. */
const GNSS_LOW_SPEED_MPS = 0.8;
const UNLOCK_FACTOR = 1.6;
const UNLOCK_SUSTAIN_MS = 2500;
const HEADING_FROM_GNSS_MIN_SPEED = 1.5;
const SPEED_SMOOTH_TAU_MS = 800;

export class PositionEngine {
  private state: PositionState = {
    position: { lat: 0, lng: 0 },
    speedMps: 0,
    headingDeg: 0,
    chainageM: null,
    lateralOffsetM: null,
    corridorLocked: false,
    source: 'none'
  };
  private unlockAccumMs = 0;
  private lastAccuracyM = Number.POSITIVE_INFINITY;
  private lastChainageForSpeed: number | null = null;
  private lastTickMs = 0;
  private hasFix = false;

  constructor(private readonly dr: DeadReckoningEngine) {}

  current(): PositionState {
    return this.state;
  }

  reset(): void {
    this.state = {
      position: { lat: 0, lng: 0 },
      speedMps: 0,
      headingDeg: 0,
      chainageM: null,
      lateralOffsetM: null,
      corridorLocked: false,
      source: 'none'
    };
    this.unlockAccumMs = 0;
    this.lastChainageForSpeed = null;
    this.hasFix = false;
    this.dr.reset();
  }

  /**
   * Advance one tick. Route may be empty (pre-route tracking): raw GNSS then
   * passes through with no corridor fields.
   */
  update(
    route: RouteManager,
    snapshot: SensorSnapshot,
    motion: MotionConfidence,
    dtMs: number
  ): PositionState {
    this.lastTickMs = snapshot.timestampMs;
    const gnss = this.usableGnss(snapshot);
    const imuActivity = motion.imuActivity;

    if (!route.hasRoute()) {
      // No corridor: raw GNSS pass-through (or hold last state).
      if (gnss) {
        this.state = {
          position: gnss.position,
          speedMps: gnss.speedMps ?? 0,
          headingDeg: gnss.headingDeg ?? this.state.headingDeg,
          chainageM: null,
          lateralOffsetM: null,
          corridorLocked: false,
          source: 'gnss'
        };
        this.hasFix = true;
        this.dr.seed(this.state.speedMps, this.state.headingDeg, snapshot.timestampMs);
      }
      return this.state;
    }

    if (gnss) {
      this.updateFromGnss(route, gnss, motion, snapshot, dtMs, imuActivity);
    } else if (this.hasFix && this.state.chainageM !== null) {
      this.updateFromDeadReckoning(route, dtMs, imuActivity);
    }
    // else: no fix ever received — stay 'none' until the first fix arrives.

    return this.state;
  }

  // ─── GNSS path ────────────────────────────────────────────────────────────

  private updateFromGnss(
    route: RouteManager,
    gnss: { position: Position; speedMps: number | null; headingDeg: number | null; accuracyM: number },
    motion: MotionConfidence,
    snapshot: SensorSnapshot,
    dtMs: number,
    imuActivity: number
  ): void {
    this.lastAccuracyM = gnss.accuracyM;
    const proj = route.projectToCorridor(gnss.position);
    if (!proj) return;

    // ── corridor lock hysteresis ───────────────────────────────────────────
    const halfWidth = route.halfWidthAtChainage(proj.chainageM);
    const lockEnter = halfWidth + gnss.accuracyM * 0.5;
    const lockExit = lockEnter * UNLOCK_FACTOR;
    const absLateral = Math.abs(proj.lateralOffsetM);

    let locked = this.state.corridorLocked;
    if (!locked && absLateral <= lockEnter) {
      locked = true;
      this.unlockAccumMs = 0;
    } else if (locked) {
      if (absLateral > lockExit) {
        this.unlockAccumMs += dtMs;
        if (this.unlockAccumMs >= UNLOCK_SUSTAIN_MS) locked = false;
      } else {
        this.unlockAccumMs = 0;
      }
    }

    // ── speed: GNSS-reported, else derived from chainage delta ────────────
    let rawSpeed: number;
    if (gnss.speedMps !== null && Number.isFinite(gnss.speedMps)) {
      rawSpeed = Math.max(0, gnss.speedMps);
    } else if (this.lastChainageForSpeed !== null && dtMs > 0) {
      rawSpeed = Math.max(0, (proj.chainageM - this.lastChainageForSpeed) / (dtMs / 1000));
    } else {
      rawSpeed = this.state.speedMps;
    }
    const k = 1 - Math.exp(-dtMs / SPEED_SMOOTH_TAU_MS);
    const speed = this.state.speedMps + (rawSpeed - this.state.speedMps) * k;
    this.lastChainageForSpeed = proj.chainageM;

    // ── low-speed / stationary: DR governs advancement, GNSS anchors it ────
    // When GNSS says "barely moving" but we're locked on corridor, let DR
    // (IMU-decayed) advance the chainage so GPS-denied creep still tracks —
    // while the snapped GNSS point keeps DR from drifting when truly parked.
    let chainageM = proj.chainageM;
    let source: PositionState['source'] = locked ? 'gnss-snapped' : 'gnss';
    if (
      locked &&
      motion.mode !== 'MOVING' &&
      (gnss.speedMps ?? 0) < GNSS_LOW_SPEED_MPS &&
      imuActivity > 0.4
    ) {
      const drResult = this.dr.advance(route, Math.max(this.state.chainageM ?? proj.chainageM, proj.chainageM), dtMs, imuActivity);
      chainageM = drResult.chainageM;
      source = 'dead-reckoning';
    }

    // ── heading: GNSS course when moving, corridor tangent otherwise ──────
    let headingDeg = this.state.headingDeg;
    if (gnss.headingDeg !== null && speed >= HEADING_FROM_GNSS_MIN_SPEED) {
      headingDeg = gnss.headingDeg;
    } else if (locked) {
      headingDeg = route.headingAtChainage(chainageM) ?? proj.headingDeg;
    } else if (snapshot.compassHeadingDeg !== null) {
      headingDeg = snapshot.compassHeadingDeg;
    }

    const position = locked
      ? route.pointAtChainage(chainageM) ?? proj.point
      : gnss.position;

    this.state = {
      position,
      speedMps: speed,
      headingDeg,
      chainageM,
      lateralOffsetM: proj.lateralOffsetM,
      corridorLocked: locked,
      source
    };
    this.hasFix = true;

    // Re-seed DR with every trusted fix so it starts from truth when GNSS drops.
    this.dr.seed(speed, headingDeg, this.lastTickMs);
  }

  // ─── DR path (no usable GNSS) ─────────────────────────────────────────────

  private updateFromDeadReckoning(route: RouteManager, dtMs: number, imuActivity: number): void {
    const from = this.state.chainageM!;
    const drResult = this.dr.advance(route, from, dtMs, imuActivity);

    this.state = {
      position: drResult.position ?? this.state.position,
      speedMps: drResult.speedUsedMps,
      headingDeg: drResult.headingDeg,
      chainageM: drResult.chainageM,
      // Lateral offset is unobservable without GNSS; hold the last known one.
      lateralOffsetM: this.state.lateralOffsetM,
      // Lock persists through GNSS outage — the corridor constraint *is* the
      // reason DR is trustworthy here.
      corridorLocked: this.state.corridorLocked,
      source: 'dead-reckoning'
    };
    this.lastChainageForSpeed = drResult.chainageM;
  }

  /**
   * The freshest fix worth using.
   *
   * BUG FIX (boot stall on a low-accuracy first fix): this used to *discard*
   * any fix coarser than GNSS_USABLE_ACCURACY_M. A cold start, an indoor
   * start, or an urban canyon routinely produces a first fix well past that,
   * so the engine produced no position at all — no snap, no DR seed, nothing
   * for the boot path to resolve on — and the app sat until the watchdog
   * fired.
   *
   * Staleness is still a hard reject (an old fix is genuinely wrong), but
   * imprecision no longer is: a coarse fix is a real fix. It is returned and
   * flagged degraded, and the corridor-lock maths already widens its envelope
   * by `accuracyM`, so a coarse fix positions the user without ever being
   * trusted enough to snap them to the wrong road.
   */
  private usableGnss(snapshot: SensorSnapshot) {
    if (!snapshot.gnss) return null;
    const { fix, ageMs } = snapshot.gnss;
    if (ageMs > GNSS_USABLE_AGE_MS) return null;
    if (!Number.isFinite(fix.accuracyM) || fix.accuracyM <= 0) return null;
    return fix;
  }

  /** True when the current fix is coarser than navigation-grade. */
  isDegraded(): boolean {
    return this.state.source !== 'none' && this.lastAccuracyM > GNSS_USABLE_ACCURACY_M;
  }
}
