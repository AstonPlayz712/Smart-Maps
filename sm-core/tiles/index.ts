/**
 * sm-core/tiles — the SM-VT v2 tile pipeline.
 *
 * SM's own vector tile format: tile-local integer geometry with the extent
 * carried in the payload, four families (base vector, 3D buildings, POIs,
 * indoor venues), an LRU cache, request coalescing so N layers asking for one
 * tile make one request, and overzoom so the map keeps drawing past the
 * source's deepest published zoom instead of going blank.
 *
 * `TilePipeline` is the thin front door: it owns a `TileSource` and prefetches
 * around where the subject is *going*, not only where they are.
 */

import { TileSource, type TileSourceOptions } from './TileSource';
import { lngLatToTileCoord, type LngLat, type TileCoord } from './types';

export interface TilePipelineOptions extends TileSourceOptions {
  /** Tiles fetched around the centre tile in each direction. */
  radius?: number;
  /** Share an existing source (e.g. the renderer's) instead of making one. */
  source?: TileSource;
}

export class TilePipeline {
  readonly source: TileSource;
  private readonly radius: number;

  constructor(opts: TilePipelineOptions = {}) {
    this.source = opts.source ?? new TileSource(opts);
    this.radius = opts.radius ?? 1;
  }

  /**
   * Warm the cache around a point. Fire-and-forget: a miss is normal and never
   * rejects, so a failed prefetch cannot take a frame down with it.
   */
  prefetch(centre: LngLat, zoom: number): void {
    const z = Math.max(0, Math.round(zoom));
    const origin = lngLatToTileCoord(centre, z);
    for (const coord of this.ring(origin)) {
      void this.source.vectorTile(coord).catch(() => null);
      void this.source.poiTile(coord).catch(() => null);
    }
  }

  /** Load an indoor venue definition. Null when the venue is not published. */
  venue(venueId: string) {
    return this.source.venue(venueId);
  }

  stats() {
    return this.source.stats();
  }

  clear(): void {
    this.source.clear();
  }

  private ring(centre: TileCoord): TileCoord[] {
    const coords: TileCoord[] = [];
    const span = 1 << centre.z;
    for (let dx = -this.radius; dx <= this.radius; dx++) {
      for (let dy = -this.radius; dy <= this.radius; dy++) {
        const y = centre.y + dy;
        if (y < 0 || y >= span) continue;
        coords.push({ z: centre.z, x: (((centre.x + dx) % span) + span) % span, y });
      }
    }
    return coords;
  }
}

export { TileSource, type TileSourceOptions, type TileFamily } from './TileSource';
export * from './types';
