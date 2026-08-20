/**
 * SmartMapsAE map schema.
 *
 * These are the formats SM's own map engine consumes. They are deliberately
 * plain JSON rather than MVT: the same payload is parsed identically by the
 * TypeScript engine (web), the Swift engine (iOS) and the Kotlin engine
 * (Android), with no platform-specific decoder in the way. Geometry is stored
 * in tile-local integer units so a tile is self-describing and position-exact
 * regardless of floating-point drift at high zoom.
 *
 *   /maps/tiles/{z}/{x}/{y}.json      base vector tile
 *   /maps/buildings/{z}/{x}/{y}.json  3D building meshes
 *   /maps/indoors/{venueId}.json      indoor floor plans
 *   /maps/poi/{z}/{x}/{y}.json        POI layer
 */

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/**
 * Tile-local coordinate extent. Every geometry coordinate in a tile is an
 * integer in [0, extent]; dividing by `extent` gives the fraction across the
 * tile. This is the single source of truth for placement — mixing an assumed
 * extent with the real one is what misaligns POIs, so the value travels with
 * the data instead of being hard-coded.
 */
export const TILE_EXTENT = 4096;

export type LngLat = { lng: number; lat: number };

// ─── base vector tiles ──────────────────────────────────────────────────────

export type VectorFeatureKind = 'road' | 'water' | 'landuse' | 'boundary' | 'path';

export interface VectorFeature {
  id: string;
  kind: VectorFeatureKind;
  /** Tile-local rings: [[x, y], …]. Integers in [0, extent]. */
  geometry: [number, number][][];
  name?: string;
  /** Road class / landuse type etc. Renderer styles on this. */
  class?: string;
  /** Floor this feature belongs to. Absent = outdoor / ground. */
  floorLevel?: number;
}

export interface VectorTile {
  format: 'sm-vector-tile';
  version: 1;
  coord: TileCoord;
  /** Coordinate extent for this tile — never assume, always read. */
  extent: number;
  features: VectorFeature[];
}

// ─── 3D buildings ───────────────────────────────────────────────────────────

export interface BuildingMesh {
  id: string;
  /** Footprint ring in tile-local units. */
  footprint: [number, number][];
  /** Metres above ground for the roof. */
  heightM: number;
  /** Metres above ground for the base (non-zero for overhangs/bridges). */
  minHeightM?: number;
  name?: string;
  /** Venue this building hosts, linking it to an indoor plan. */
  venueId?: string;
}

export interface BuildingTile {
  format: 'sm-building-tile';
  version: 1;
  coord: TileCoord;
  extent: number;
  buildings: BuildingMesh[];
}

// ─── indoor ─────────────────────────────────────────────────────────────────

export type VerticalConnectorKind = 'stairs' | 'lift' | 'escalator';

export interface IndoorConnector {
  id: string;
  kind: VerticalConnectorKind;
  position: LngLat;
  /** Floors this connector serves, ascending. */
  floors: number[];
  /** Seconds to traverse one floor. Routing costs vertical moves with this. */
  secondsPerFloor: number;
  /** Bidirectional unless false (escalators are often one-way). */
  bidirectional?: boolean;
}

export interface IndoorFloor {
  level: number;
  name: string;
  /** Height of this floor's walking surface above venue ground, metres. */
  elevationM: number;
  /** Outline + internal walls, in lng/lat (floor plans are venue-scale). */
  outline: LngLat[];
  walls?: LngLat[][];
  /** Walkable graph nodes on this floor. */
  walkNodes?: { id: string; position: LngLat }[];
  /** Walkable edges between nodes on this floor. */
  walkEdges?: { from: string; to: string }[];
}

export interface IndoorVenue {
  format: 'sm-indoor-venue';
  version: 1;
  venueId: string;
  name: string;
  /** Ground-level reference for elevation maths. */
  origin: LngLat;
  floors: IndoorFloor[];
  connectors: IndoorConnector[];
}

// ─── POI ────────────────────────────────────────────────────────────────────

export interface PoiFeature {
  id: string;
  name: string;
  category: string;
  /** Tile-local position — same extent convention as vector tiles. */
  position: [number, number];
  /** Floor for indoor POIs. Absent = outdoor. */
  floorLevel?: number;
  venueId?: string;
}

export interface PoiTile {
  format: 'sm-poi-tile';
  version: 1;
  coord: TileCoord;
  extent: number;
  pois: PoiFeature[];
}

// ─── geo helpers shared by the map engine ───────────────────────────────────

/**
 * Convert a tile-local coordinate to lng/lat.
 *
 * BUG FIX (POI misalignment): the previous placement maths assumed a fixed
 * 4096 extent and applied the Web-Mercator inverse to the *linear* y fraction.
 * Both are wrong for custom tiles — the extent travels with the tile, and y
 * must go through the inverse Mercator projection, not a linear lerp. POIs
 * drifted north/south by up to a block at high latitude as a result.
 */
export function tileToLngLat(
  coord: TileCoord,
  extent: number,
  x: number,
  y: number
): LngLat {
  const scale = 1 << coord.z;
  const fx = (coord.x + x / extent) / scale;
  const fy = (coord.y + y / extent) / scale;
  const lng = fx * 360 - 180;
  const n = Math.PI - 2 * Math.PI * fy;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

/** Inverse of `tileToLngLat` — lng/lat to tile-local units. */
export function lngLatToTile(
  coord: TileCoord,
  extent: number,
  position: LngLat
): [number, number] {
  const scale = 1 << coord.z;
  const fx = (position.lng + 180) / 360;
  const sinLat = Math.sin((position.lat * Math.PI) / 180);
  const fy = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [(fx * scale - coord.x) * extent, (fy * scale - coord.y) * extent];
}

/** Tile covering a position at a zoom level. */
export function lngLatToTileCoord(position: LngLat, z: number): TileCoord {
  const scale = 1 << z;
  const sinLat = Math.sin((position.lat * Math.PI) / 180);
  return {
    z,
    x: Math.floor(((position.lng + 180) / 360) * scale),
    y: Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale)
  };
}
