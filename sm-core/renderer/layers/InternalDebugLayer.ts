/**
 * InternalDebugLayer — engine internals, drawn only when explicitly enabled.
 *
 * GNSS candidates, raw IMU vectors, Always-IN state and the ego pose axes are
 * development aids. They were leaking into normal rendering because the layer
 * had no gate of its own and relied on callers not asking for it. Now the
 * layer refuses to produce geometry unless `debugMode` is true, so there is no
 * path by which internals reach an external frame.
 *
 * It also owns the conversion from engine-local coordinates to lng/lat.
 * Internal coordinates never escape this module: `build()` returns geographic
 * positions only, so no downstream layer can accidentally treat an engine
 * coordinate as a map coordinate.
 */

import type { EgoPose } from '../../ae/EgoPose';
import type { SMPosition } from '../../ae/Position';
import type { INState } from '../../ae/dynamic/types';
import type { LngLat } from '../../tiles/types';

export interface InternalDebugInput {
  position: SMPosition | null;
  ego: EgoPose | null;
  inState: INState | 'OFF' | null;
  /** Raw fixes considered this tick, for the GNSS scatter. */
  gnssCandidates?: LngLat[];
  /** IMU magnitudes, for the vector readout. */
  imu?: { accelMagnitude: number; verticalAccel: number; gyroMagnitude: number } | null;
}

export interface InternalDebugFrame {
  /** Raw GNSS candidate positions — geographic, never engine-local. */
  gnssCandidates: LngLat[];
  /** Ego position + heading, for the pose axes. */
  ego: { position: LngLat; headingDeg: number; z: number } | null;
  imu: { accelMagnitude: number; verticalAccel: number; gyroMagnitude: number } | null;
  inState: string;
  /** Text lines the backend can print in a corner. */
  readout: string[];
}

export class InternalDebugLayer {
  /**
   * Build the debug frame, or null when debug drawing is off.
   *
   * The `debugMode` check is *inside* the layer rather than at every call
   * site, so a new caller cannot forget it and leak internals.
   */
  build(input: InternalDebugInput, debugMode: boolean): InternalDebugFrame | null {
    if (!debugMode) return null;

    const readout: string[] = [];
    if (input.position) {
      readout.push(
        `pos ${input.position.lat.toFixed(5)}, ${input.position.lng.toFixed(5)} ±${input.position.accuracyM.toFixed(0)}m`
      );
      readout.push(
        `floor ${input.position.floorLevel ?? '—'} ±${input.position.verticalAccuracyM.toFixed(1)}m ${input.position.verticalMotionState}`
      );
    }
    if (input.ego) {
      readout.push(`ego z=${input.ego.z.toFixed(2)}m hdg=${input.ego.headingDeg.toFixed(0)}°`);
    }
    if (input.imu) {
      readout.push(
        `imu a=${input.imu.accelMagnitude.toFixed(2)} vz=${input.imu.verticalAccel.toFixed(2)} g=${input.imu.gyroMagnitude.toFixed(3)}`
      );
    }
    readout.push(`IN ${input.inState ?? 'OFF'}`);

    return {
      // Only geographic coordinates cross this boundary.
      gnssCandidates: (input.gnssCandidates ?? []).filter(isGeographic),
      ego: input.ego
        ? {
            position: { lng: input.ego.location.lng, lat: input.ego.location.lat },
            headingDeg: input.ego.headingDeg,
            z: input.ego.z
          }
        : null,
      imu: input.imu ?? null,
      inState: String(input.inState ?? 'OFF'),
      readout
    };
  }
}

/**
 * Guard against engine-local coordinates masquerading as map coordinates.
 * Engine space is metres from a local origin, so values sit outside the
 * lng/lat domain — rejecting them here stops a unit mix-up from placing debug
 * geometry somewhere absurd (or, worse, plausibly wrong).
 */
function isGeographic(p: LngLat): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
