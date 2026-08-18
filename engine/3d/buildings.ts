// engine/3d/buildings.ts
//
// Building footprint → extruded native mesh for the 3D spatial engine. The Z
// Build leaned on MapLibre fill-extrusion; A/E extrudes footprints natively so
// buildings are real scene geometry that occlude, cast, and cull like anything
// else.

import type { GeoCoord, NativeMesh, Vec3 } from '../../core/zante/native/types';
import { geoToLocal } from '../../core/zante/native/interop/GeometryAdapter';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';

export interface BuildingFootprint {
  id: string;
  /** Closed polygon ring (outer). */
  ring: GeoCoord[];
  heightM: number;
  /** Base elevation, metres (sits on terrain). */
  baseM?: number;
}

/** Extrude a footprint ring up to `heightM`: walls + a flat roof fan. */
export function extrudeBuilding(fp: BuildingFootprint, origin: GeoCoord): NativeMesh {
  const base = fp.ring.map((c) => geoToLocal({ ...c, alt: fp.baseM ?? 0 }, origin));
  const top = base.map((p) => [p[0], p[1] + fp.heightM, p[2]] as Vec3);
  const positions: number[] = [];
  const indices: number[] = [];

  // Walls
  for (let i = 0; i < base.length; i++) {
    const j = (i + 1) % base.length;
    const b0 = base[i], b1 = base[j], t0 = top[i], t1 = top[j];
    const start = positions.length / 3;
    positions.push(...b0, ...b1, ...t0, ...t1);
    indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
  }

  // Roof fan (assumes convex-ish footprint; fine for scaffolding)
  const roofStart = positions.length / 3;
  for (const t of top) positions.push(...t);
  for (let i = 1; i < top.length - 1; i++) {
    indices.push(roofStart, roofStart + i, roofStart + i + 1);
  }

  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}
