// engine/3d/roads.ts
//
// Road graph + ribbon-mesh generation for the 3D spatial engine. A road graph
// is the native, georeferenced backbone everything else hangs off: lanes ride
// it, 4D traffic colours it, AutoMaps IN extrudes corridors from it.

import type { GeoCoord, NativeMesh, Vec3 } from '../../core/zante/native/types';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';
import { geoToLocal } from '../../core/zante/native/interop/GeometryAdapter';

export type RoadClass = 'motorway' | 'primary' | 'secondary' | 'residential' | 'service';

export interface RoadSegment {
  id: string;
  /** Ordered polyline of the centreline. */
  centerline: GeoCoord[];
  roadClass: RoadClass;
  /** Total carriageway width, metres. */
  widthM: number;
  laneCount: number;
  oneway: boolean;
}

export interface RoadGraph {
  origin: GeoCoord;
  segments: RoadSegment[];
}

const CLASS_WIDTH: Record<RoadClass, number> = {
  motorway: 16,
  primary: 12,
  secondary: 9,
  residential: 6,
  service: 4
};

export function defaultWidth(cls: RoadClass): number {
  return CLASS_WIDTH[cls];
}

/**
 * Extrude a road segment centreline into a flat ribbon mesh (two triangles per
 * centreline span). This is the native geometry the Zante renderer draws and
 * the base AutoMaps IN thickens into a volumetric corridor.
 */
export function buildRoadRibbon(segment: RoadSegment, origin: GeoCoord): NativeMesh {
  const pts = segment.centerline.map((c) => geoToLocal(c, origin));
  const half = segment.widthM / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const dir = tangentAt(pts, i);
    // Right-hand normal in the ground plane (x,z); y is up.
    const nx = dir[2];
    const nz = -dir[0];
    const p = pts[i];
    positions.push(p[0] + nx * half, p[1], p[2] + nz * half); // left
    positions.push(p[0] - nx * half, p[1], p[2] - nz * half); // right

    if (i > 0) {
      const a = (i - 1) * 2;
      const b = (i - 1) * 2 + 1;
      const c = i * 2;
      const d = i * 2 + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

function tangentAt(pts: Vec3[], i: number): Vec3 {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, 0, dz / len];
}
