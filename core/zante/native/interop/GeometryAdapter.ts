// core/zante/native/interop/GeometryAdapter.ts
//
// Adapters that convert specific external source formats into Zante geometry,
// then into native meshes. One adapter per source family. These are the
// "loaders, converters, and adapters" of Task 7 — the only place external
// formats are understood; everything downstream is native.

import type { ExternalGeometry } from './NativeFormat';
import { toNativeMesh } from './NativeFormat';
import type { NativeMesh, GeoCoord, Vec3 } from '../types';

export type ExternalSourceFormat = 'gltf' | 'obj' | 'osm-extrusion' | 'heightfield' | 'roadgraph';

export interface IGeometryAdapter {
  readonly format: ExternalSourceFormat;
  /** True if this adapter recognises the payload. */
  accepts(payload: unknown): boolean;
  /** Parse external bytes/objects into source-neutral geometry. */
  parse(payload: unknown): ExternalGeometry;
}

/**
 * Project a geo coordinate into the local tangent-plane metres the renderer
 * uses, relative to an origin. Shared by every adapter that ingests
 * georeferenced source data (OSM, terrain, road graphs).
 */
export function geoToLocal(coord: GeoCoord, origin: GeoCoord): Vec3 {
  const R = 6378137;
  const dLat = ((coord.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((coord.lng - origin.lng) * Math.PI) / 180;
  const x = dLng * R * Math.cos((origin.lat * Math.PI) / 180);
  const z = dLat * R;
  const y = (coord.alt ?? 0) - (origin.alt ?? 0);
  return [x, y, -z]; // -z so north maps to -Z (camera looks down +? handled by view)
}

/**
 * The registry routes an external payload to the first adapter that accepts
 * it and returns a native mesh. The Dynamic Engine's external-engine path
 * (engine/external) calls this for every chunk it extracts.
 */
export class GeometryAdapterRegistry {
  private adapters: IGeometryAdapter[] = [];

  register(adapter: IGeometryAdapter): void {
    this.adapters.push(adapter);
  }

  convert(payload: unknown): NativeMesh | null {
    const adapter = this.adapters.find((a) => a.accepts(payload));
    if (!adapter) return null;
    return toNativeMesh(adapter.parse(payload));
  }

  has(format: ExternalSourceFormat): boolean {
    return this.adapters.some((a) => a.format === format);
  }
}
