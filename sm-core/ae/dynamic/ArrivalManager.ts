// sm-core/ae/dynamic/ArrivalManager.ts
//
// Detects arrival at the corridor's terminal node (e.g. "2 Springwood Drive"
// labelled Work) and fires the arrival cycle exactly once per route:
//
//   • emits 'arrival' plus the dynamic key (ARRIVAL_AT_WORK)
//   • notifies ContextManager so the place is marked/reinforced
//   • latches `hasArrived()` — SMCore feeds this to INEngine, which runs
//     ACTIVE → EXIT → OFF, and then resets the cycle
//
// Detection is dynamic: the arrival radius widens with GNSS uncertainty, and
// confirmation requires sustained presence (dwell) OR passing the terminal
// chainage — a single fix inside the radius at speed is not an arrival.

import type { ArrivalEvent, MotionConfidence, PositionState } from './types';
import type { SMEventMap } from './types';
import type { EventBus } from './EventBus';
import type { RouteManager } from './RouteManager';
import type { ContextManager } from './ContextManager';
import { haversineM } from './RouteManager';

const BASE_ARRIVAL_RADIUS_M = 25;
const ARRIVAL_SPEED_MPS = 1.5; // must be at/below to accumulate dwell
const ARRIVAL_DWELL_MS = 1200;
/** Within this of the corridor end, chainage-based arrival applies. */
const END_OVERSHOOT_M = 8;

export class ArrivalManager {
  private dwellMs = 0;
  private arrived = false;
  private lastEvent: ArrivalEvent | null = null;

  constructor(
    private readonly bus: EventBus<SMEventMap>,
    private readonly context: ContextManager
  ) {}

  hasArrived(): boolean {
    return this.arrived;
  }

  lastArrival(): ArrivalEvent | null {
    return this.lastEvent;
  }

  /** Clear the latch for a new route. Keeps context (places persist). */
  reset(): void {
    this.dwellMs = 0;
    this.arrived = false;
  }

  /**
   * Advance one tick. Returns the ArrivalEvent when arrival is confirmed this
   * tick (fires once per route), else null.
   */
  check(
    route: RouteManager,
    positionState: PositionState,
    motion: MotionConfidence,
    nowMs: number,
    dtMs: number
  ): ArrivalEvent | null {
    if (this.arrived || !route.hasRoute()) return null;

    const terminal = route.terminalNode();
    if (!terminal) return null;

    // Radius widens with GNSS uncertainty so a weak fix can still confirm.
    const accuracy = positionState.position.accuracyM ?? (1 - motion.gnssQuality) * 30;
    const radius = BASE_ARRIVAL_RADIUS_M + Math.min(30, accuracy);

    const directDistanceM = haversineM(positionState.position, terminal.node.position);
    const chainagePassed =
      positionState.chainageM !== null &&
      positionState.chainageM >= terminal.chainageM - END_OVERSHOOT_M;

    const insideRadius = directDistanceM <= radius;
    const slow = positionState.speedMps <= ARRIVAL_SPEED_MPS;

    // Two live paths to confirmation:
    //  1. inside radius AND slow, sustained for the dwell (normal pull-up)
    //  2. corridor chainage passed the terminal AND inside radius (drive-past
    //     onto the driveway — chainage is the stronger signal)
    if (insideRadius && (slow || chainagePassed)) {
      this.dwellMs += dtMs;
    } else {
      this.dwellMs = 0;
    }

    const confirmed =
      (insideRadius && slow && this.dwellMs >= ARRIVAL_DWELL_MS) ||
      (insideRadius && chainagePassed && this.dwellMs >= ARRIVAL_DWELL_MS / 2);
    if (!confirmed) return null;

    // ── fire the arrival cycle (once) ──────────────────────────────────────
    this.arrived = true;
    const label = terminal.node.label ?? null;
    const eventKey = `ARRIVAL_AT_${sanitizeEventLabel(label ?? terminal.node.id)}` as const;

    const event: ArrivalEvent = {
      nodeId: terminal.node.id,
      label,
      eventKey,
      position: positionState.position,
      atMs: nowMs
    };
    this.lastEvent = event;

    // Mark/reinforce the place (Work/Home) in context.
    if (label) this.context.markArrival(label, positionState.position, nowMs);

    this.bus.emit('arrival', event);
    this.bus.emit(eventKey, event);
    return event;
  }
}

/** "Work" → "WORK", "2 Springwood Drive" → "2_SPRINGWOOD_DRIVE". */
function sanitizeEventLabel(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}
