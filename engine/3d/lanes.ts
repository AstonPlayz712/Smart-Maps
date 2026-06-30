// engine/3d/lanes.ts
//
// Lane-level geometry for the 3D spatial engine. Splits a road segment into
// individual lane centrelines and builds the thin "lane rail" guides AutoMaps
// IN renders along the active lane.

import type { RoadSegment } from './roads';
import type { GeoCoord, NativeMesh } from '../../core/zante/native/types';
import { geoToLocal } from '../../core/zante/native/interop/GeometryAdapter';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';

export interface LaneSpec {
  index: number; // 0 = kerb-most on the driving side
  /** Lateral offset from the segment centreline, metres (signed). */
  offsetM: number;
  widthM: number;
}

/** Evenly divide a segment's carriageway into lane specs. */
export function deriveLanes(segment: RoadSegment): LaneSpec[] {
  const laneW = segment.widthM / segment.laneCount;
  const lanes: LaneSpec[] = [];
  for (let i = 0; i < segment.laneCount; i++) {
    const center = -segment.widthM / 2 + laneW * (i + 0.5);
    lanes.push({ index: i, offsetM: center, widthM: laneW });
  }
  return lanes;
}

/**
 * Build a thin rail strip along a lane centreline at a fixed height bias so it
 * floats just above the road ribbon (no z-fighting). Used by AutoMaps IN lane
 * rails.
 */
export function buildLaneRail(
  centerline: GeoCoord[],
  lane: LaneSpec,
  origin: GeoCoord,
  railWidthM = 0.35,
  heightBiasM = 0.08
): NativeMesh {
  const pts = centerline.map((c) => geoToLocal(c, origin));
  const positions: number[] = [];
  const indices: number[] = [];
  const half = railWidthM / 2;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    const nx = tz; // right-hand ground normal
    const nz = -tx;
    const p = pts[i];
    const cx = p[0] + nx * lane.offsetM;
    const cz = p[2] + nz * lane.offsetM;
    const y = p[1] + heightBiasM;
    positions.push(cx + nx * half, y, cz + nz * half);
    positions.push(cx - nx * half, y, cz - nz * half);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }

  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}
