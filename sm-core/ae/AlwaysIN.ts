/**
 * Always-IN, indoor-aware.
 *
 * Wraps the corridor Always-IN state with the vertical dimension: when the
 * subject is moving between floors, guidance is about the *connector* (these
 * stairs, that lift), not the corridor ahead. This module tracks that and
 * exposes one combined view.
 */

import type { INState } from './dynamic/types';
import type { SMPosition, VerticalMotionState } from './Position';

/** Always-IN's vertical phase, orthogonal to the horizontal corridor state. */
export type VerticalINPhase =
  | 'level'         // travelling on one floor
  | 'approaching'   // nearing a connector
  | 'transitioning' // on stairs / in a lift / on an escalator
  | 'arriving';     // vertical motion ending, settling on the new floor

export interface AlwaysINState {
  /** Horizontal corridor state from the shared engine. */
  corridor: INState;
  vertical: VerticalINPhase;
  floorLevel: number | null;
  /** Floor the current transition is heading for, when known. */
  targetFloorLevel: number | null;
  verticalMotionState: VerticalMotionState;
  verticalTransitionConfidence: number;
  /** True while a floor change is in progress. */
  changingFloor: boolean;
}

const ARRIVAL_SETTLE_MS = 1200;

export class AlwaysINTracker {
  private vertical: VerticalINPhase = 'level';
  private floorLevel: number | null = null;
  private targetFloor: number | null = null;
  private settleMs = 0;

  /**
   * Advance the vertical phase.
   *
   * `distanceToConnectorM` is optional — pass it when the router knows the
   * next vertical move, so guidance can pre-announce ("take the lift ahead").
   */
  update(
    position: SMPosition,
    corridor: INState,
    dtMs: number,
    distanceToConnectorM: number | null = null
  ): AlwaysINState {
    const moving = position.verticalMotionState !== 'static';
    const confident = position.verticalTransitionConfidence >= 0.45;

    if (moving && confident) {
      this.vertical = 'transitioning';
      this.settleMs = 0;
      if (this.floorLevel === null) this.floorLevel = position.floorLevel;
    } else if (this.vertical === 'transitioning') {
      // Vertical motion stopped — settle before declaring the new floor.
      this.settleMs += dtMs;
      this.vertical = 'arriving';
    } else if (this.vertical === 'arriving') {
      this.settleMs += dtMs;
      if (this.settleMs >= ARRIVAL_SETTLE_MS) {
        this.vertical = 'level';
        this.floorLevel = position.floorLevel;
        this.targetFloor = null;
        this.settleMs = 0;
      }
    } else if (distanceToConnectorM !== null && distanceToConnectorM <= 15) {
      this.vertical = 'approaching';
    } else {
      this.vertical = 'level';
      this.floorLevel = position.floorLevel;
    }

    // While transitioning, the destination floor is whatever the fix now
    // reports — it updates as the connector carries the user.
    if (this.vertical === 'transitioning' && position.floorLevel !== this.floorLevel) {
      this.targetFloor = position.floorLevel;
    }

    return {
      corridor,
      vertical: this.vertical,
      floorLevel: this.floorLevel,
      targetFloorLevel: this.targetFloor,
      verticalMotionState: position.verticalMotionState,
      verticalTransitionConfidence: position.verticalTransitionConfidence,
      changingFloor: this.vertical === 'transitioning' || this.vertical === 'arriving'
    };
  }

  reset(): void {
    this.vertical = 'level';
    this.floorLevel = null;
    this.targetFloor = null;
    this.settleMs = 0;
  }
}

/** Human-readable guidance for the current vertical phase. */
export function verticalGuidance(state: AlwaysINState): string | null {
  switch (state.vertical) {
    case 'approaching':
      return 'Vertical connection ahead';
    case 'transitioning':
      switch (state.verticalMotionState) {
        case 'stairs': return 'Taking the stairs';
        case 'lift': return 'In the lift';
        case 'escalator': return 'On the escalator';
        default: return 'Changing floor';
      }
    case 'arriving':
      return state.targetFloorLevel !== null
        ? `Arriving on level ${state.targetFloorLevel}`
        : 'Arriving on the new floor';
    case 'level':
    default:
      return null;
  }
}
