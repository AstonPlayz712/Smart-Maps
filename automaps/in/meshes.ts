// automaps/in/meshes.ts
//
// Immersive Navigation geometry generators. These thicken the flat 3D road
// graph into the volumetric forms AutoMaps IN renders around the driver:
// corridors, lane rails, roundabout discs, and junction volumes. All output is
// native `NativeMesh` ready for the Zante GPU pipeline.

import type { GeoCoord, NativeMesh, Vec3 } from '../../core/zante/native/types';
import { geoToLocal } from '../../core/zante/native/interop/GeometryAdapter';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';

/**
 * Corridor mesh — a U-section "tube" around the route centreline (floor + two
 * walls) that the camera flies through. Height + width taper with the road.
 */
export function buildCorridorMesh(
  centerline: GeoCoord[],
  origin: GeoCoord,
  widthM = 10,
  heightM = 6
): NativeMesh {
  const pts = centerline.map((c) => geoToLocal(c, origin));
  const half = widthM / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const [tx, , tz] = tangent(pts, i);
    const nx = tz;
    const nz = -tx;
    const p = pts[i];
    // 4 ring vertices: left-floor, right-floor, left-top, right-top
    positions.push(p[0] + nx * half, p[1], p[2] + nz * half);
    positions.push(p[0] - nx * half, p[1], p[2] - nz * half);
    positions.push(p[0] + nx * half, p[1] + heightM, p[2] + nz * half);
    positions.push(p[0] - nx * half, p[1] + heightM, p[2] - nz * half);

    if (i > 0) {
      const r = (i - 1) * 4;
      const s = i * 4;
      // floor
      quad(indices, r + 0, r + 1, s + 0, s + 1);
      // left wall
      quad(indices, r + 0, s + 0, r + 2, s + 2);
      // right wall
      quad(indices, r + 1, r + 3, s + 1, s + 3);
    }
  }
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/**
 * Roundabout disc — a flat ring centred on the island, with an inner and outer
 * radius. AutoMaps IN lights the active exit arc.
 */
export function buildRoundaboutDisc(
  center: GeoCoord,
  origin: GeoCoord,
  innerR = 8,
  outerR = 18,
  segments = 48
): NativeMesh {
  const c = geoToLocal(center, origin);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    positions.push(c[0] + cos * innerR, c[1] + 0.05, c[2] + sin * innerR);
    positions.push(c[0] + cos * outerR, c[1] + 0.05, c[2] + sin * outerR);
    if (i > 0) {
      const k = (i - 1) * 2;
      quad(indices, k, k + 1, k + 2, k + 3);
    }
  }
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/**
 * Volumetric junction — a low box volume over a junction footprint that the
 * renderer fills with a soft glow on approach. Built from a footprint ring.
 */
export function buildJunctionVolume(
  footprint: GeoCoord[],
  origin: GeoCoord,
  heightM = 4
): NativeMesh {
  const base = footprint.map((c) => geoToLocal(c, origin));
  const top = base.map((p) => [p[0], p[1] + heightM, p[2]] as Vec3);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < base.length; i++) {
    const j = (i + 1) % base.length;
    const start = positions.length / 3;
    positions.push(...base[i], ...base[j], ...top[i], ...top[j]);
    quad(indices, start, start + 1, start + 2, start + 3);
  }
  // top cap fan
  const capStart = positions.length / 3;
  for (const t of top) positions.push(...t);
  for (let i = 1; i < top.length - 1; i++) indices.push(capStart, capStart + i, capStart + i + 1);
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function tangent(pts: Vec3[], i: number): Vec3 {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, 0, dz / len];
}

/** Two CCW triangles for a quad given its four corner indices (a,b,c,d). */
function quad(indices: number[], a: number, b: number, c: number, d: number): void {
  indices.push(a, b, c, c, b, d);
}
