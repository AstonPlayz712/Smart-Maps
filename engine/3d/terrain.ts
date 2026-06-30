// engine/3d/terrain.ts
//
// Terrain heightfield → native mesh for the 3D spatial engine. Tiles stream in
// through the native AssetLoader as raster-DEM, decode to a heightfield here,
// and tessellate into a grid mesh the Zante renderer draws under everything.

import type { NativeMesh } from '../../core/zante/native/types';
import { computeBounds } from '../../core/zante/native/interop/NativeFormat';

export interface HeightField {
  /** Row-major heights, metres. Length = resolution². */
  heights: Float32Array;
  resolution: number;
  /** World-space size of the tile edge, metres. */
  sizeM: number;
  /** Vertical exaggeration applied at mesh-build time. */
  exaggeration?: number;
}

/** Tessellate a heightfield into a grid mesh centred on the tile origin. */
export function buildTerrainMesh(hf: HeightField): NativeMesh {
  const n = hf.resolution;
  const step = hf.sizeM / (n - 1);
  const ex = hf.exaggeration ?? 1;
  const positions = new Float32Array(n * n * 3);
  const indices: number[] = [];

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      positions[i * 3] = -hf.sizeM / 2 + x * step;
      positions[i * 3 + 1] = hf.heights[i] * ex;
      positions[i * 3 + 2] = -hf.sizeM / 2 + z * step;
      if (x < n - 1 && z < n - 1) {
        const a = z * n + x;
        const b = z * n + x + 1;
        const c = (z + 1) * n + x;
        const d = (z + 1) * n + x + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  return {
    positions,
    normals: computeGridNormals(positions, n),
    indices: Uint32Array.from(indices),
    bounds: computeBounds(positions)
  };
}

/** Per-vertex normals from neighbouring grid heights. */
function computeGridNormals(pos: Float32Array, n: number): Float32Array {
  const normals = new Float32Array(pos.length);
  const h = (x: number, z: number) => pos[(z * n + x) * 3 + 1];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const l = h(Math.max(0, x - 1), z);
      const r = h(Math.min(n - 1, x + 1), z);
      const d = h(x, Math.max(0, z - 1));
      const u = h(x, Math.min(n - 1, z + 1));
      const nx = l - r;
      const nz = d - u;
      const ny = 2;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (z * n + x) * 3;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return normals;
}
