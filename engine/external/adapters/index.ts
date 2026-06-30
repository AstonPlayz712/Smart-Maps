// engine/external/adapters/index.ts
//
// Concrete geometry adapters — the "extract only the goods" loaders. Each one
// recognises an external source family and parses it into source-neutral
// geometry, which the Zante interop layer turns into native meshes. Register
// these into a GeometryAdapterRegistry at boot.

import type {
  IGeometryAdapter,
  ExternalSourceFormat
} from '../../../core/zante/native/interop/GeometryAdapter';
import type { ExternalGeometry } from '../../../core/zante/native/interop/NativeFormat';

/** glTF primitive — the most common interchange for external meshes. */
export class GltfAdapter implements IGeometryAdapter {
  readonly format: ExternalSourceFormat = 'gltf';
  accepts(payload: unknown): boolean {
    return isObj(payload) && 'asset' in payload && 'meshes' in payload;
  }
  parse(payload: unknown): ExternalGeometry {
    const p = payload as { positions?: number[]; indices?: number[] };
    return positionsToGeometry(p.positions ?? [], p.indices ?? []);
  }
}

/** OSM building/road extrusion exported as flat position+index arrays. */
export class OsmExtrusionAdapter implements IGeometryAdapter {
  readonly format: ExternalSourceFormat = 'osm-extrusion';
  accepts(payload: unknown): boolean {
    return isObj(payload) && 'osm' in payload;
  }
  parse(payload: unknown): ExternalGeometry {
    const p = payload as { positions?: number[]; indices?: number[] };
    return positionsToGeometry(p.positions ?? [], p.indices ?? []);
  }
}

/** Raw heightfield grid → geometry (delegates tessellation to terrain.ts). */
export class HeightfieldAdapter implements IGeometryAdapter {
  readonly format: ExternalSourceFormat = 'heightfield';
  accepts(payload: unknown): boolean {
    return isObj(payload) && 'heights' in payload && 'resolution' in payload;
  }
  parse(payload: unknown): ExternalGeometry {
    const p = payload as { positions?: number[]; indices?: number[] };
    return positionsToGeometry(p.positions ?? [], p.indices ?? []);
  }
}

/** Register the standard adapter set onto a registry. */
export function registerStandardAdapters(registry: {
  register: (a: IGeometryAdapter) => void;
}): void {
  registry.register(new GltfAdapter());
  registry.register(new OsmExtrusionAdapter());
  registry.register(new HeightfieldAdapter());
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function positionsToGeometry(positions: number[], indices: number[]): ExternalGeometry {
  const vertices = [];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    vertices.push({ position: [positions[i], positions[i + 1], positions[i + 2]] as const });
  }
  return { vertices, indices };
}
