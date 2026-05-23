import type { LatLng } from '../../engine/types';

export type LaneDirection =
  | 'left'
  | 'through'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'u-turn';

export interface Lane {
  /** 0-based index from the kerb on the driving side. */
  index: number;
  /** Allowed manoeuvres for this lane. */
  direction: LaneDirection;
  /** True when the upcoming maneuver requires being in this lane. */
  isActive: boolean;
}

/**
 * SM Lane Engine — proto stub.
 *
 * No lane data in the proto routing layer, so every query returns empty.
 * The Auto-class build will parse OSM `turn:lanes` tags from the live
 * route and align them to the current segment / heading. Public surface
 * intentionally matches what that real implementation will expose so the
 * Ask Maps / voice / IN callers can wire against it today.
 */
export class LaneEngine {
  /** All lanes on `segmentId`. Proto returns []. */
  getLanes(_segmentId: string): Lane[] {
    return [];
  }

  /** The active lane the user should be in for the next maneuver. */
  getActiveLane(_loc: LatLng): Lane | null {
    return null;
  }

  /** Quick capability check so callers can branch on "do we have data here?". */
  hasLaneData(_segmentId: string): boolean {
    return false;
  }
}
