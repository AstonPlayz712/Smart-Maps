/**
 * Short-horizon trajectory prediction.
 *
 * Constant-velocity projection along the current heading, damped by how much
 * the engine trusts the motion estimate. This is what the camera leads on and
 * what the tile pipeline prefetches against, so it deliberately does not model
 * turns: a wrong curve is worse than a straight line that is honestly short.
 *
 * Corridor-aware prediction (chainage along a locked route) lives in
 * `ae/dynamic/PredictiveEngine`, which supersedes this when a route is active.
 */

import type { LngLatPoint } from '../types';
import type { SMPosition } from './Position';

export interface TrajectoryPrediction {
  /** Horizon actually used, seconds. */
  horizonS: number;
  /** Where the subject is expected to be at the end of the horizon. */
  predicted: LngLatPoint;
  /** Ground distance to that point, metres. */
  distanceM: number;
  /** Confidence in the projection, 0…1 — falls with speed and motion doubt. */
  confidence: number;
}

const METRES_PER_DEG_LAT = 111_320;

export class TrajectoryPredictor {
  constructor(private readonly horizonS = 12) {}

  predict(position: SMPosition, motionConfidence: number): TrajectoryPrediction {
    const speed = Number.isFinite(position.speedMps) ? Math.max(0, position.speedMps) : 0;
    const distanceM = speed * this.horizonS;

    if (distanceM <= 0 || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
      return {
        horizonS: this.horizonS,
        predicted: { lng: position.lng, lat: position.lat },
        distanceM: 0,
        // Standing still is a perfectly confident prediction of standing still.
        confidence: motionConfidence
      };
    }

    const rad = (position.headingDeg * Math.PI) / 180;
    const north = Math.cos(rad) * distanceM;
    const east = Math.sin(rad) * distanceM;
    const lat = position.lat + north / METRES_PER_DEG_LAT;
    const lngScale = METRES_PER_DEG_LAT * Math.cos((position.lat * Math.PI) / 180);
    const lng = position.lng + (lngScale > 1 ? east / lngScale : 0);

    // A fast subject is easier to extrapolate than a dawdling one, but the
    // accuracy of the fix caps how much any of it is worth.
    const speedTrust = Math.min(1, speed / 3);
    const fixTrust = Number.isFinite(position.accuracyM)
      ? Math.max(0, Math.min(1, 30 / Math.max(1, position.accuracyM)))
      : 0;

    return {
      horizonS: this.horizonS,
      predicted: { lng, lat },
      distanceM,
      confidence: Math.max(0, Math.min(1, motionConfidence * 0.5 + speedTrust * 0.25 + fixTrust * 0.25))
    };
  }
}
