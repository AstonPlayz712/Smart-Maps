// src/logic/SMCore.ts
//
// SMCore — central orchestrator of the Smart-Maps A/E Dynamic logic layer.
// Owns one instance of every engine and drives the whole pipeline each tick:
//
//   1. read sensors            (SensorFusionCore)
//   2. compute motion confidence (MotionConfidenceEngine)
//   3. update position         (PositionEngine ⇄ DeadReckoningEngine)
//   4. query corridor          (RouteManager)
//   5. update IN state         (INEngine, fed by PredictiveEngine)
//   6. compute IN geometry     (INGeometryEngine)
//   7. check arrival           (ArrivalManager → ContextManager)
//   8. emit events             (EventBus<SMEventMap>)
//
// Everything is computed live per tick from sensors + corridor. There are no
// scripted sequences anywhere downstream of tick().

import type {
  CorridorSegment,
  GnssFix,
  ImuSample,
  INViewModel,
  JunctionNode,
  Position,
  PositionState,
  SMEventMap
} from './types';
import { EventBus } from './EventBus';
import { SensorFusionCore } from './SensorFusionCore';
import { MotionConfidenceEngine } from './MotionConfidenceEngine';
import { RouteManager } from './RouteManager';
import { DeadReckoningEngine } from './DeadReckoningEngine';
import { PositionEngine } from './PositionEngine';
import { PredictiveEngine } from './PredictiveEngine';
import { INEngine } from './INEngine';
import { INGeometryEngine } from './INGeometryEngine';
import { ArrivalManager } from './ArrivalManager';
import { ContextManager } from './ContextManager';

export interface SMCoreOptions {
  /** Clock override for tests / deterministic replay. Defaults to Date.now. */
  now?: () => number;
  /** Prediction horizon handed to PredictiveEngine each tick (clamped 5–20). */
  predictionHorizonS?: number;
}

export class SMCore {
  readonly bus = new EventBus<SMEventMap>();
  readonly sensors = new SensorFusionCore();
  readonly motion = new MotionConfidenceEngine();
  readonly route = new RouteManager();
  readonly deadReckoning = new DeadReckoningEngine();
  readonly position: PositionEngine;
  readonly predictive = new PredictiveEngine();
  readonly inEngine = new INEngine();
  readonly inGeometry = new INGeometryEngine();
  readonly context = new ContextManager();
  readonly arrival: ArrivalManager;

  private readonly now: () => number;
  private readonly horizonS: number;
  private initialized = false;
  private routeActive = false;
  private lastViewModel: INViewModel | null = null;
  private lastLockEmitted: boolean | null = null;
  private lastMotionModeEmitted: string | null = null;
  private nowMs = 0;

  constructor(opts: SMCoreOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.horizonS = opts.predictionHorizonS ?? 12;
    this.position = new PositionEngine(this.deadReckoning);
    this.arrival = new ArrivalManager(this.bus, this.context);
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.nowMs = this.now();
  }

  /** Build the corridor and activate the route. */
  setRoute(segments: CorridorSegment[], junctions: JunctionNode[]): void {
    this.route.build(segments, junctions);
    this.routeActive = this.route.hasRoute();
    this.arrival.reset();
    this.predictive.reset();
    if (this.routeActive) {
      // Pre-register the labelled terminal so ContextManager knows the place
      // before the first arrival (e.g. "Work" = 2 Springwood Drive).
      const terminal = this.route.terminalNode();
      if (terminal?.node.label) {
        this.context.registerPlace(terminal.node.label, terminal.node.position, this.nowMs);
      }
      this.bus.emit('route:set', {
        segmentCount: segments.length,
        junctionCount: junctions.length,
        totalLengthM: this.route.totalLengthM()
      });
    }
  }

  clearRoute(): void {
    this.route.clear();
    this.routeActive = false;
    this.arrival.reset();
    this.predictive.reset();
    const change = this.inEngine.reset(this.nowMs);
    if (change) this.bus.emit('in:state', change);
    this.bus.emit('route:cleared', undefined);
  }

  /** Full state reset (keeps learned context/places). */
  reset(): void {
    this.clearRoute();
    this.sensors.reset();
    this.motion.reset();
    this.position.reset();
    this.inGeometry.reset();
    this.lastViewModel = null;
    this.lastLockEmitted = null;
    this.lastMotionModeEmitted = null;
  }

  // ─── sensor feeds (thin pass-throughs) ────────────────────────────────────

  pushGnss(fix: GnssFix): void {
    this.sensors.pushGnss(fix);
  }

  pushImu(sample: ImuSample): void {
    this.sensors.pushImu(sample);
  }

  pushCompassHeading(headingDeg: number, timestampMs: number): void {
    this.sensors.pushCompassHeading(headingDeg, timestampMs);
  }

  // ─── the tick ─────────────────────────────────────────────────────────────

  tick(dtMs: number): INViewModel {
    if (!this.initialized) this.init();
    this.nowMs = this.now();

    // 1. read sensors
    const snapshot = this.sensors.snapshot(this.nowMs);

    // 2. compute motion confidence
    const motion = this.motion.update(snapshot, dtMs);

    // 3. update position (GNSS ⇄ corridor snap ⇄ dead reckoning)
    const positionState = this.position.update(this.route, snapshot, motion, dtMs);

    // 4. query corridor
    const chainage = positionState.chainageM;
    const currentSegment =
      chainage !== null ? this.route.segmentAtChainage(chainage) : null;
    const distanceToJunctionM =
      chainage !== null ? this.route.distanceToJunctionFrom(chainage) : null;
    const prediction = this.predictive.predict(
      this.route,
      positionState,
      motion,
      this.horizonS
    );

    // 5. update IN state (arrival latch from the previous tick feeds in, so
    //    the machine reacts on the tick after confirmation — one-tick causal
    //    ordering, never a callback loop)
    const stateChange = this.inEngine.update({
      routeActive: this.routeActive,
      corridorLocked: positionState.corridorLocked,
      distanceToJunctionM,
      currentSegment,
      prediction,
      motion,
      speedMps: positionState.speedMps,
      arrived: this.arrival.hasArrived(),
      nowMs: this.nowMs,
      dtMs
    });

    // 6. compute IN geometry
    const viewModel = this.inGeometry.compute(this.route, {
      state: this.inEngine.current(),
      positionState,
      motion,
      prediction,
      distanceToJunctionM,
      arrived: this.arrival.hasArrived(),
      dtMs
    });
    this.lastViewModel = viewModel;

    // 7. check arrival (fires 'arrival' + ARRIVAL_AT_<LABEL>, marks context)
    this.arrival.check(this.route, positionState, motion, this.nowMs, dtMs);

    // 8. emit events
    this.bus.emit('position:update', positionState);
    if (motion.mode !== this.lastMotionModeEmitted) {
      this.lastMotionModeEmitted = motion.mode;
      this.bus.emit('motion:update', motion);
    }
    if (positionState.corridorLocked !== this.lastLockEmitted) {
      this.lastLockEmitted = positionState.corridorLocked;
      this.bus.emit('corridor:lock', {
        locked: positionState.corridorLocked,
        lateralOffsetM: positionState.lateralOffsetM
      });
    }
    if (stateChange) {
      this.bus.emit('in:state', stateChange);
      // EXIT → OFF after an arrival completes the cycle: clear the route so
      // the machine is genuinely reset for the next trip.
      if (stateChange.next === 'OFF' && this.arrival.hasArrived()) {
        this.clearRoute();
      }
    }
    this.bus.emit('in:viewmodel', viewModel);

    return viewModel;
  }

  // ─── queries ──────────────────────────────────────────────────────────────

  getINViewModel(): INViewModel | null {
    return this.lastViewModel;
  }

  getCurrentPosition(): Position | null {
    const s: PositionState = this.position.current();
    return s.source === 'none' ? null : s.position;
  }

  getPositionState(): PositionState {
    return this.position.current();
  }

  isRouteActive(): boolean {
    return this.routeActive;
  }
}

// ─── usage example ────────────────────────────────────────────────────────────
//
// A minimal end-to-end run: a two-segment corridor with one turn junction and
// a terminal labelled "Work" (2 Springwood Drive), synthetic GNSS fixes driven
// toward it, and the Always-IN state observed OFF → PREP → ACTIVE → EXIT → OFF.
// Exported (not auto-run) so it compiles under the project's strict TS config.

export function exampleUsage(): void {
  let t = 0;
  const sm = new SMCore({ now: () => t });

  sm.init();

  sm.bus.on('in:state', (c) => console.log(`[IN] ${c.prev} → ${c.next}: ${c.reason}`));
  sm.bus.on('arrival', (a) => console.log(`[ARRIVAL] ${a.eventKey} at`, a.position));
  sm.bus.on('ARRIVAL_AT_WORK', () => console.log('[ARRIVAL_AT_WORK] marked Work in context'));

  // Corridor: 1 km north up Main Road, turn, then 300 m to 2 Springwood Drive.
  const mainRoad = { lat: 51.5, lng: -0.12 };
  const turn = { lat: 51.509, lng: -0.12 };
  const work = { lat: 51.509, lng: -0.1157 };
  sm.setRoute(
    [
      { id: 'main-road', path: [mainRoad, turn] },
      { id: 'springwood-drive', path: [turn, work] }
    ],
    [
      { id: 'j-turn', kind: 'turn', position: turn },
      { id: 'j-work', kind: 'terminal', position: work, label: 'Work' }
    ]
  );

  // Drive: 10 Hz fixes at ~10 m/s toward the turn, then along to Work, then stop.
  const dtMs = 100;
  for (let i = 0; i < 1800; i++) {
    t += dtMs;
    const progress = Math.min(1, i / 1500);
    const lat = mainRoad.lat + (turn.lat - mainRoad.lat) * Math.min(1, progress * 1.4);
    const lng =
      progress > 0.71
        ? turn.lng + (work.lng - turn.lng) * Math.min(1, (progress - 0.71) / 0.29)
        : mainRoad.lng;
    const arrivedZone = progress >= 0.99;
    sm.pushGnss({
      position: { lat, lng },
      speedMps: arrivedZone ? 0 : 10,
      headingDeg: progress > 0.71 ? 90 : 0,
      accuracyM: 5,
      timestampMs: t
    });
    sm.pushImu({ accelMagnitude: arrivedZone ? 0.02 : 0.6, gyroMagnitude: 0.05, timestampMs: t });

    const vm = sm.tick(dtMs);
    if (i % 300 === 0) {
      console.log(
        `t=${(t / 1000).toFixed(1)}s state=${vm.state} mode=${vm.motionMode} ` +
          `dJunction=${vm.distanceToJunctionM?.toFixed(0) ?? '—'}m ` +
          `pitch=${vm.cameraPitchDeg.toFixed(1)} zoom=${vm.cameraZoom.toFixed(2)}`
      );
    }
  }

  console.log('final position:', sm.getCurrentPosition());
  console.log('known places:', sm.context.allPlaces());
}
