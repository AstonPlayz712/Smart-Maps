// core/zante/native/interop/NativeFormat.ts
//
// Converters that bring external geometry into the Zante native mesh format
// so the GPU pipeline can upload it directly. This is the landing zone for
// the "extract only the goods" path (Task 6 / 7): external geometry, meshes,
// terrain, and road graphs are normalised here before they ever touch the
// renderer.

import type { NativeMesh, AABB, Vec3 } from '../types';

/** Minimal interleaved vertex layout many external engines export. */
export interface InterleavedVertex {
  position: Vec3;
  normal?: Vec3;
  uv?: readonly [number, number];
}

export interface ExternalGeometry {
  vertices: InterleavedVertex[];
  indices: number[];
}

/** Compute an AABB so the scene graph can frustum-cull the mesh. */
export function computeBounds(positions: Float32Array): AABB {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * De-interleave an external mesh into the Zante SoA `NativeMesh`. The GPU
 * pipeline binds channels independently, so this is the canonical entry point
 * for any external geometry — glTF, OSM extrusions, a game engine's terrain
 * chunk, etc.
 */
export function toNativeMesh(geo: ExternalGeometry): NativeMesh {
  const n = geo.vertices.length;
  const positions = new Float32Array(n * 3);
  const hasNormals = geo.vertices.some((v) => v.normal);
  const hasUvs = geo.vertices.some((v) => v.uv);
  const normals = hasNormals ? new Float32Array(n * 3) : undefined;
  const uvs = hasUvs ? new Float32Array(n * 2) : undefined;

  for (let i = 0; i < n; i++) {
    const v = geo.vertices[i];
    positions[i * 3] = v.position[0];
    positions[i * 3 + 1] = v.position[1];
    positions[i * 3 + 2] = v.position[2];
    if (normals && v.normal) {
      normals[i * 3] = v.normal[0];
      normals[i * 3 + 1] = v.normal[1];
      normals[i * 3 + 2] = v.normal[2];
    }
    if (uvs && v.uv) {
      uvs[i * 2] = v.uv[0];
      uvs[i * 2 + 1] = v.uv[1];
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices: Uint32Array.from(geo.indices),
    bounds: computeBounds(positions)
  };
}

/** Flip winding order — external engines vary in front-face convention. */
export function flipWinding(mesh: NativeMesh): NativeMesh {
  const idx = mesh.indices.slice();
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  return { ...mesh, indices: idx };
}
