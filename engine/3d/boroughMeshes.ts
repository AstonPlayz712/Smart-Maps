// engine/3d/boroughMeshes.ts
//
// Borough-scale meshes for the 3D spatial engine. A borough is the unit of
// streaming + corridor continuity: AutoMaps IN keeps corridors visually
// continuous across borough seams using the `continuityId` set here.

import type { GeoCoord, NativeMesh } from '../../core/zante/native/types';
import { geoToLocal } from '../../core/zante/native/interop/GeometryAdapter';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';

export interface Borough {
  id: string;
  name: string;
  /** Boundary polygon ring. */
  boundary: GeoCoord[];
  /** Shared id used to stitch corridors continuously across borough seams. */
  continuityId: string;
}

/** Build a flat ground-fill mesh for a borough boundary (triangle fan). */
export function buildBoroughGround(borough: Borough, origin: GeoCoord): NativeMesh {
  const ring = borough.boundary.map((c) => geoToLocal(c, origin));
  const positions: number[] = [];
  for (const p of ring) positions.push(p[0], p[1], p[2]);
  const indices: number[] = [];
  for (let i = 1; i < ring.length - 1; i++) indices.push(0, i, i + 1);
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/**
 * Group boroughs that share a `continuityId` — AutoMaps IN consults this so a
 * corridor crossing from one borough to its neighbour does not visually break
 * at the seam.
 */
export function continuityGroups(boroughs: Borough[]): Map<string, Borough[]> {
  const groups = new Map<string, Borough[]>();
  for (const b of boroughs) {
    const g = groups.get(b.continuityId) ?? [];
    g.push(b);
    groups.set(b.continuityId, g);
  }
  return groups;
}
