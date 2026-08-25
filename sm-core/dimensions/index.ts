/**
 * sm-core/dimensions — the 3–7D engine.
 *
 * Smart-Maps reasons about space in five stacked dimensions, each one a
 * strictly richer description of the same moment:
 *
 *   3D  geometry     where the subject is, including which floor
 *   4D  motion       how that is changing — speed, heading, vertical rate
 *   5D  environment  what surrounds it — inside/outside, venue, floor plan
 *   6D  traffic      how congested the surroundings are, and the delay it costs
 *   7D  satellite    the quality of the observation itself — the engine's own
 *                    honesty about how much of the above it actually knows
 *
 * Higher dimensions degrade rather than fail: with no traffic feed the 6D layer
 * reports `available: false` and everything below it keeps working. Nothing in
 * the stack is allowed to block on a dimension it does not have.
 */

import type { SMPosition } from '../ae/Position';
import type { EgoPose } from '../ae/EgoPose';
import type { MotionEstimate } from '../ae/IMU';
import type { Environment } from '../ai/ContextInference';

export interface GeometryDimension {
  lng: number;
  lat: number;
  /** Metres above venue ground. */
  z: number;
  floorLevel: number | null;
}

export interface MotionDimension {
  speedMps: number;
  headingDeg: number;
  verticalRateMps: number;
  state: MotionEstimate['horizontal'];
  verticalState: MotionEstimate['vertical'];
}

export interface EnvironmentDimension {
  environment: Environment;
  venueId: string | null;
  /** Floors known for the current venue; empty outdoors. */
  levels: number[];
}

export interface TrafficDimension {
  available: boolean;
  /** 0 (free-flowing) … 1 (stationary). Zero when unavailable. */
  congestion: number;
  /** Delay attributable to congestion over the current leg, seconds. */
  delayS: number;
}

export interface SatelliteDimension {
  /** Horizontal accuracy, metres. */
  accuracyM: number;
  /** Vertical accuracy, metres. */
  verticalAccuracyM: number;
  /** Overall observation quality, 0…1. */
  quality: number;
  /** Age of the observation at evaluation time, ms. */
  ageMs: number;
}

export interface DimensionalState {
  d3: GeometryDimension;
  d4: MotionDimension;
  d5: EnvironmentDimension;
  d6: TrafficDimension;
  d7: SatelliteDimension;
  /** Deepest dimension currently backed by real data: 3…7. */
  depth: 3 | 4 | 5 | 6 | 7;
}

/** Optional live traffic, supplied by the host. Absent = 6D degrades cleanly. */
export interface TrafficSample {
  congestion: number;
  delayS: number;
}

export interface DimensionalInput {
  position: SMPosition;
  ego: EgoPose;
  motion: MotionEstimate;
  environment: Environment;
  levels: number[];
  traffic?: TrafficSample | null;
  nowMs: number;
}

export class DimensionalEngine {
  evaluate(input: DimensionalInput): DimensionalState {
    const { position, ego, motion } = input;

    const d3: GeometryDimension = {
      lng: position.lng,
      lat: position.lat,
      z: ego.z,
      floorLevel: position.floorLevel
    };

    const d4: MotionDimension = {
      speedMps: position.speedMps,
      headingDeg: position.headingDeg,
      verticalRateMps: motion.verticalRateMps,
      state: motion.horizontal,
      verticalState: motion.vertical
    };

    const d5: EnvironmentDimension = {
      environment: input.environment,
      venueId: position.venueId,
      levels: input.levels
    };

    const traffic = input.traffic ?? null;
    const d6: TrafficDimension = traffic
      ? {
          available: true,
          congestion: clamp01(traffic.congestion),
          delayS: Math.max(0, traffic.delayS)
        }
      : { available: false, congestion: 0, delayS: 0 };

    const ageMs = Math.max(0, input.nowMs - position.timestampMs);
    const d7: SatelliteDimension = {
      accuracyM: position.accuracyM,
      verticalAccuracyM: position.verticalAccuracyM,
      quality: observationQuality(position.accuracyM, ageMs),
      ageMs
    };

    return { d3, d4, d5, d6, d7, depth: resolveDepth(d5, d6, d7) };
  }
}

/**
 * How deep the stack genuinely goes right now.
 *
 * A dimension counts only when it is backed by data: a null environment does
 * not become 5D by being present in the type, and an infinite accuracy is not
 * a satellite dimension. Reporting depth honestly is the point — it is what
 * stops the UI presenting a guess as a measurement.
 */
function resolveDepth(
  d5: EnvironmentDimension,
  d6: TrafficDimension,
  d7: SatelliteDimension
): 3 | 4 | 5 | 6 | 7 {
  if (Number.isFinite(d7.accuracyM) && d7.quality > 0) return 7;
  if (d6.available) return 6;
  if (d5.environment !== 'unknown') return 5;
  return 4;
}

function observationQuality(accuracyM: number, ageMs: number): number {
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) return 0;
  const spatial = Math.max(0, Math.min(1, 30 / Math.max(1, accuracyM)));
  // A fix decays to worthless over ~10 s of staleness.
  const freshness = Math.max(0, 1 - ageMs / 10_000);
  return clamp01(spatial * freshness);
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
