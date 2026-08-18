// src/logic/INEngine.ts
//
// Always-IN — the core state machine:
//
//   OFF → PREP    route active + corridor locked
//   PREP → ACTIVE approaching a junction or entering a key segment
//                 (works in STATIONARY_PREDICTIVE too — proximity and the
//                 predictive envelope drive it, not raw speed)
//   ACTIVE → EXIT arrival, or sustainedly leaving the corridor
//   EXIT → OFF    after the arrival/exit dwell, or explicit reset
//
// Every transition is computed live from sensors + corridor each tick. The
// entry distance scales with speed, the corridor-loss grace scales with GNSS
// quality, and prediction substitutes for motion when the user is stationary.

import type {
  CorridorSegment,
  INState,
  INStateChange,
  MotionConfidence,
  PredictionResult
} from './types';

export interface INEngineInput {
  routeActive: boolean;
  corridorLocked: boolean;
  distanceToJunctionM: number | null;
  currentSegment: CorridorSegment | null;
  prediction: PredictionResult | null;
  motion: MotionConfidence;
  speedMps: number;
  arrived: boolean;
  nowMs: number;
  dtMs: number;
}

// Dynamic-threshold shaping.
const ACTIVE_BASE_DISTANCE_M = 70;   // minimum approach envelope
const ACTIVE_LOOKAHEAD_S = 8;        // envelope grows by speed × this
const EXIT_DWELL_ARRIVAL_MS = 2500;  // linger on arrival so UX can resolve
const EXIT_DWELL_LOST_MS = 1200;
const CORRIDOR_LOSS_BASE_MS = 3000;  // grace before ACTIVE→EXIT on unlock

export class INEngine {
  private state: INState = 'OFF';
  private corridorLostMs = 0;
  private exitDwellMs = 0;
  private exitCause: 'arrival' | 'corridor-lost' | 'reset' | null = null;
  private lastChange: INStateChange | null = null;

  current(): INState {
    return this.state;
  }

  lastTransition(): INStateChange | null {
    return this.lastChange;
  }

  /** Force the machine back to OFF (route cleared / arrival cycle complete). */
  reset(nowMs: number): INStateChange | null {
    if (this.state === 'OFF') return null;
    const change = this.transition('OFF', 'reset', nowMs);
    this.corridorLostMs = 0;
    this.exitDwellMs = 0;
    this.exitCause = null;
    return change;
  }

  /** Advance one tick. Returns a state change when one occurred, else null. */
  update(input: INEngineInput): INStateChange | null {
    switch (this.state) {
      case 'OFF':
        return this.tickOff(input);
      case 'PREP':
        return this.tickPrep(input);
      case 'ACTIVE':
        return this.tickActive(input);
      case 'EXIT':
        return this.tickExit(input);
    }
  }

  // ─── per-state logic ──────────────────────────────────────────────────────

  private tickOff(input: INEngineInput): INStateChange | null {
    if (input.routeActive && input.corridorLocked) {
      return this.transition('PREP', 'route active + corridor locked', input.nowMs);
    }
    return null;
  }

  private tickPrep(input: INEngineInput): INStateChange | null {
    if (!input.routeActive) {
      // Route torn down under us — reset path.
      return this.transition('OFF', 'route cleared (reset)', input.nowMs);
    }

    // Dynamic approach envelope: grows with speed so fast approach preps the
    // camera earlier; floor keeps stationary users at a junction inside it.
    const envelopeM = Math.max(
      ACTIVE_BASE_DISTANCE_M,
      input.speedMps * ACTIVE_LOOKAHEAD_S
    );

    const withinEnvelope =
      input.distanceToJunctionM !== null && input.distanceToJunctionM <= envelopeM;
    const predictedReach = input.prediction?.junctionWithinHorizon === true;
    const keySegment = input.currentSegment?.key === true;

    // Stationary-predictive still enters ACTIVE: proximity (withinEnvelope)
    // and the predictive envelope carry the transition when speed is ~0.
    if (withinEnvelope) {
      return this.transition(
        'ACTIVE',
        `junction within ${Math.round(envelopeM)} m envelope (${Math.round(input.distanceToJunctionM!)} m, ${input.motion.mode})`,
        input.nowMs
      );
    }
    if (predictedReach) {
      return this.transition(
        'ACTIVE',
        `junction predicted within ${input.prediction!.horizonS}s horizon`,
        input.nowMs
      );
    }
    if (keySegment) {
      return this.transition(
        'ACTIVE',
        `entered key segment ${input.currentSegment!.id}`,
        input.nowMs
      );
    }
    return null;
  }

  private tickActive(input: INEngineInput): INStateChange | null {
    if (input.arrived) {
      this.exitCause = 'arrival';
      this.exitDwellMs = 0;
      return this.transition('EXIT', 'arrival at terminal node', input.nowMs);
    }

    if (!input.routeActive) {
      this.exitCause = 'reset';
      this.exitDwellMs = 0;
      return this.transition('EXIT', 'route cleared', input.nowMs);
    }

    // Corridor loss must be sustained; the grace stretches when GNSS quality
    // is poor (an outage is not the same as leaving the corridor — DR keeps
    // the lock, so only a *locked=false* verdict accumulates here).
    if (!input.corridorLocked) {
      const grace = CORRIDOR_LOSS_BASE_MS * (1 + (1 - input.motion.gnssQuality));
      this.corridorLostMs += input.dtMs;
      if (this.corridorLostMs >= grace) {
        this.exitCause = 'corridor-lost';
        this.exitDwellMs = 0;
        return this.transition(
          'EXIT',
          `left corridor (unlocked ${Math.round(this.corridorLostMs)} ms)`,
          input.nowMs
        );
      }
    } else {
      this.corridorLostMs = 0;
    }
    return null;
  }

  private tickExit(input: INEngineInput): INStateChange | null {
    this.exitDwellMs += input.dtMs;
    const dwell =
      this.exitCause === 'arrival' ? EXIT_DWELL_ARRIVAL_MS : EXIT_DWELL_LOST_MS;
    if (this.exitDwellMs >= dwell) {
      const cause = this.exitCause ?? 'reset';
      this.exitCause = null;
      this.corridorLostMs = 0;
      return this.transition('OFF', `exit complete (${cause})`, input.nowMs);
    }
    return null;
  }

  // ─── transition bookkeeping ───────────────────────────────────────────────

  private transition(next: INState, reason: string, atMs: number): INStateChange {
    const change: INStateChange = { prev: this.state, next, reason, atMs };
    this.state = next;
    this.lastChange = change;
    return change;
  }
}
