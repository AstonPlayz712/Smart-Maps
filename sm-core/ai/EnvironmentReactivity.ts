/**
 * Environment reactivity.
 *
 * Turns "what is happening around the subject" into the presentation the
 * renderer should adopt: how far to look ahead, how much to tilt, how much
 * detail to keep. It reads state and returns a recommendation — it never
 * touches the renderer, so a host is free to ignore it.
 */

import type { SMPosition } from '../ae/Position';
import type { MotionEstimate } from '../ae/IMU';
import type { Environment } from './ContextInference';

export interface EnvironmentResponse {
  /** Suggested camera zoom. */
  zoom: number;
  /** Suggested camera pitch, degrees. */
  pitchDeg: number;
  /** Metres ahead of the subject the camera should lead. */
  lookaheadM: number;
  /** Suggested label density, 0…1 — thinner when moving fast. */
  labelDensity: number;
  /** Whether 3D building meshes are worth drawing right now. */
  buildings3D: boolean;
}

export class EnvironmentReactivityModel {
  respond(position: SMPosition, motion: MotionEstimate, environment: Environment): EnvironmentResponse {
    const speed = Math.max(0, Number.isFinite(position.speedMps) ? position.speedMps : 0);

    if (environment === 'indoor') {
      // Indoors the useful world is one room deep: close in, flatten out, and
      // drop the building shells that would otherwise occlude the floor plan.
      return {
        zoom: 19.5,
        pitchDeg: 25,
        lookaheadM: 12,
        labelDensity: 0.9,
        buildings3D: false
      };
    }

    // Outdoors, zoom tracks speed: a walk wants detail, a motorway wants range.
    const zoom = speed > 15 ? 15.5 : speed > 6 ? 16.5 : speed > 1.5 ? 17.5 : 18;
    return {
      zoom,
      pitchDeg: motion.horizontal === 'driving' ? 55 : 40,
      lookaheadM: Math.max(25, speed * 8),
      labelDensity: speed > 15 ? 0.3 : speed > 6 ? 0.6 : 1,
      buildings3D: true
    };
  }
}
