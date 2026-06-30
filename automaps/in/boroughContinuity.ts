// automaps/in/boroughContinuity.ts
//
// Borough corridor continuity. As the route crosses from one borough into a
// neighbour, the corridor must read as one continuous form — no seam, no
// restart of the lighting/taper. This tracks the active continuity group and
// the crossing transitions AutoMaps IN blends across.

import type { Borough } from '../../engine/3d/boroughMeshes';
import { continuityGroups } from '../../engine/3d/boroughMeshes';
import type { GeoCoord } from '../../core/zante/native/types';

export interface BoroughCrossing {
  fromBorough: string;
  toBorough: string;
  /** True when both sides share a continuity group (seamless). */
  continuous: boolean;
}

/**
 * Tracks which borough the corridor is currently in and reports crossings.
 * When the new borough shares a `continuityId` with the old one, the corridor
 * carries its lighting/taper across unchanged.
 */
export class BoroughContinuity {
  private groups: Map<string, Borough[]>;
  private byId: Map<string, Borough>;
  private currentBorough?: string;

  constructor(boroughs: Borough[]) {
    this.groups = continuityGroups(boroughs);
    this.byId = new Map(boroughs.map((b) => [b.id, b]));
  }

  /** Update with the ego's current borough; returns a crossing if it changed. */
  advance(boroughId: string | undefined): BoroughCrossing | null {
    if (!boroughId || boroughId === this.currentBorough) return null;
    const prev = this.currentBorough;
    this.currentBorough = boroughId;
    if (!prev) return null;
    return {
      fromBorough: prev,
      toBorough: boroughId,
      continuous: this.shareGroup(prev, boroughId)
    };
  }

  private shareGroup(a: string, b: string): boolean {
    const ga = this.byId.get(a)?.continuityId;
    const gb = this.byId.get(b)?.continuityId;
    return ga != null && ga === gb;
  }

  /** All boroughs in the same continuity group as `boroughId`. */
  groupOf(boroughId: string): Borough[] {
    const cid = this.byId.get(boroughId)?.continuityId;
    return cid ? this.groups.get(cid) ?? [] : [];
  }

  /** Stitch points are where group members touch — corridor lighting persists. */
  isStitchPoint(_loc: GeoCoord): boolean {
    return false; // refined in Stage 2 with real borough boundary adjacency
  }
}
