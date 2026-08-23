/**
 * POI relevance ranking.
 *
 * Scores the POIs the tile pipeline delivered against where the subject is,
 * how fast they are going, and which floor they are on, so the renderer can
 * thin a dense tile down to the handful worth a label.
 *
 * The scoring below is the deterministic baseline. It is intentionally simple
 * and explainable; a learned model can replace `score()` without any consumer
 * changing, because the interface is "position + candidates → ranked list".
 */

import type { LngLatPoint } from '../types';
import type { PoiFeature } from '../tiles/types';
import type { SMPosition } from '../ae/Position';

export interface RankedPoi {
  poi: PoiFeature;
  position: LngLatPoint;
  distanceM: number;
  /** 0…1, higher is more worth showing. */
  relevance: number;
}

export interface PoiCandidate {
  poi: PoiFeature;
  position: LngLatPoint;
}

const METRES_PER_DEG_LAT = 111_320;

export class PoiRelevanceModel {
  /** Rank candidates, best first, dropping anything below `minRelevance`. */
  rank(position: SMPosition, candidates: PoiCandidate[], limit = 24, minRelevance = 0.05): RankedPoi[] {
    // Faster travel means a wider useful radius: at a walk you care about the
    // next 150 m, in a car about the next 1.5 km.
    const radiusM = 150 + Math.max(0, position.speedMps) * 120;

    const ranked: RankedPoi[] = [];
    for (const candidate of candidates) {
      if (!this.onSameFloor(position, candidate.poi)) continue;
      const distanceM = groundDistanceM(position, candidate.position);
      const relevance = this.score(distanceM, radiusM, candidate.poi);
      if (relevance < minRelevance) continue;
      ranked.push({ poi: candidate.poi, position: candidate.position, distanceM, relevance });
    }

    ranked.sort((a, b) => b.relevance - a.relevance);
    return ranked.slice(0, limit);
  }

  /**
   * Baseline score: proximity falls off linearly to the radius, then category
   * weight nudges the ordering among near-equals.
   */
  protected score(distanceM: number, radiusM: number, poi: PoiFeature): number {
    if (distanceM > radiusM) return 0;
    const proximity = 1 - distanceM / radiusM;
    return Math.max(0, Math.min(1, proximity * categoryWeight(poi.category)));
  }

  /** An indoor POI on another floor is never relevant; outdoor POIs always are. */
  private onSameFloor(position: SMPosition, poi: PoiFeature): boolean {
    const level = (poi as { floorLevel?: number | null }).floorLevel;
    if (level === undefined || level === null) return true;
    return position.floorLevel === level;
  }
}

/** Deterministic weights — replaced wholesale by a learned model later. */
function categoryWeight(category: string): number {
  switch (category) {
    case 'transit':
    case 'entrance':
      return 1;
    case 'toilets':
    case 'lift':
    case 'stairs':
      return 0.9;
    case 'food':
    case 'retail':
      return 0.7;
    default:
      return 0.55;
  }
}

export function groundDistanceM(a: { lat: number; lng: number }, b: LngLatPoint): number {
  const dLat = (b.lat - a.lat) * METRES_PER_DEG_LAT;
  const dLng = (b.lng - a.lng) * METRES_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}
