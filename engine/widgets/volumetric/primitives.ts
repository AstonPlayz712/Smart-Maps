// engine/widgets/volumetric/primitives.ts
//
// Tiny native-mesh primitives the volumetric widgets are built from. Kept here
// (not in the renderer) so widget geometry stays declarative and testable.

import type { NativeMesh, Mat4 } from '../../../core/zante/native/types';
import { computeBounds } from '../../../core/zante/native/interop/NativeFormat';

/** UV sphere — the Weather Orb body. */
export function sphere(radius = 1, rings = 16, sectors = 24): NativeMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= sectors; s++) {
      const theta = (s / sectors) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
    }
  }
  const stride = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * stride + s;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const pos = Float32Array.from(positions);
  return {
    positions: pos,
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    bounds: computeBounds(pos)
  };
}

/** Flat ring/annulus — the Calendar Ring body. */
export function ring(innerR = 0.8, outerR = 1, segments = 48): NativeMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.push(c * innerR, 0, s * innerR);
    positions.push(c * outerR, 0, s * outerR);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/** Flat ribbon strip of length `len` along +X with width `w` — Nav Ribbon. */
export function ribbon(len = 4, w = 0.6, segments = 24): NativeMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * len - len / 2;
    positions.push(x, 0, -w / 2);
    positions.push(x, 0, w / 2);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/** Axis-aligned box — Flight Widget body + Reminder Strip cells. */
export function box(sx = 1, sy = 1, sz = 1): NativeMesh {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const start = positions.length / 3;
    for (const ci of f) positions.push(...corners[ci]);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const pos = Float32Array.from(positions);
  return { positions: pos, indices: Uint32Array.from(indices), bounds: computeBounds(pos) };
}

/** Build a Y-axis rotation + translation transform (row-major). */
export function transformYRotate(angleRad: number, tx = 0, ty = 0, tz = 0): Mat4 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [
    c, 0, s, tx,
    0, 1, 0, ty,
    -s, 0, c, tz,
    0, 0, 0, 1
  ];
}
