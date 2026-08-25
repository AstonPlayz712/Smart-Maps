/**
 * The web shell's read-out.
 *
 * It shows only what a person navigating would want: where they are, how good
 * the fix is, how they are moving, and which floor they are on. Engine
 * internals — ego z, raw Always-IN state, update rate, dimensional depth,
 * confidence scores — are deliberately absent, and there is no affordance
 * anywhere in the shell to reveal them.
 */

import type { DseState } from 'sm-core';
import { positionQuality } from 'sm-core/ae/Position';

const QUALITY_LABEL: Record<string, string> = {
  precise: 'Precise',
  good: 'Good',
  coarse: 'Approximate',
  degraded: 'Searching'
};

export interface Hud {
  update(state: DseState): void;
}

/** Binds to the `data-sm` elements in index.html. Missing ones are ignored. */
export function createHud(root: ParentNode = document): Hud {
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-sm="${name}"]`);
  const place = field('place');
  const quality = field('quality');
  const motion = field('motion');
  const floor = field('floor');

  return {
    update(state: DseState) {
      const p = state.position;

      if (place) {
        place.textContent = Number.isFinite(p.lat) && Number.isFinite(p.lng)
          ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
          : 'Locating…';
      }
      if (quality) {
        quality.textContent = QUALITY_LABEL[positionQuality(p)] ?? 'Searching';
      }
      if (motion) {
        motion.textContent = motionLabel(state);
      }
      if (floor) {
        floor.textContent = floorLabel(state);
      }
    }
  };
}

/**
 * What the subject is doing, in plain words.
 *
 * Measured speed has the final say: a classifier that says "driving" while the
 * receiver reads a standstill is describing a parked car, and the read-out
 * should not claim otherwise.
 */
export function motionLabel(state: DseState): string {
  if (state.position.speedMps < 0.7) return 'Stationary';
  switch (state.motion.horizontal) {
    case 'walking':
      return 'Walking';
    case 'driving':
      return 'Driving';
    case 'still':
      return 'Stationary';
    default:
      return 'Moving';
  }
}

export function floorLabel(state: DseState): string {
  const vertical = state.alwaysIN.verticalMotionState;
  if (vertical === 'stairs') return 'On the stairs';
  if (vertical === 'lift') return 'In the lift';
  if (vertical === 'escalator') return 'On the escalator';

  const level = state.activeFloorLevel ?? state.position.floorLevel;
  if (level === null || level === undefined) return 'Outdoors';
  if (level === 0) return 'Ground floor';
  return level > 0 ? `Floor ${level}` : `Basement ${Math.abs(level)}`;
}
