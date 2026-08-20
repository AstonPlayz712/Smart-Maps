/**
 * TileSource — SmartMapsAE's own tile loader.
 *
 * Replaces the Apple/MapLibre tile pipeline. Fetches SM's four data families
 * from the paths the app serves them from, parses them into the schema in
 * ./types, and caches by key. Identical behaviour on iOS, Android and Web:
 * the only platform dependency is `fetch`, and requests are plain relative
 * GETs so an embedded WebView (which blocks cross-origin and blob loads) can
 * serve them from the app bundle.
 *
 *   /maps/tiles/{z}/{x}/{y}.json
 *   /maps/buildings/{z}/{x}/{y}.json
 *   /maps/indoors/{venueId}.json
 *   /maps/poi/{z}/{x}/{y}.json
 */

import type {
  BuildingTile,
  IndoorVenue,
  PoiTile,
  TileCoord,
  VectorTile
} from './types';

export interface TileSourceOptions {
  /** Root the four families hang off. Relative by default — WebView-safe. */
  baseUrl?: string;
  /** Max entries per cache before least-recently-used eviction. */
  cacheSize?: number;
  /** Fetch implementation, injectable for tests/native hosts. */
  fetchImpl?: typeof fetch;
}

interface CacheEntry<T> {
  value: T;
  usedAt: number;
}

export type TileFamily = 'tiles' | 'buildings' | 'poi';

export class TileSource {
  private readonly baseUrl: string;
  private readonly cacheSize: number;
  private readonly doFetch: typeof fetch;

  private vector = new Map<string, CacheEntry<VectorTile>>();
  private buildings = new Map<string, CacheEntry<BuildingTile>>();
  private poi = new Map<string, CacheEntry<PoiTile>>();
  private venues = new Map<string, CacheEntry<IndoorVenue>>();
  /** In-flight requests, so N layers asking for one tile make one request. */
  private inflight = new Map<string, Promise<unknown>>();
  private clock = 0;

  constructor(opts: TileSourceOptions = {}) {
    // Relative by default: an Android/iOS WebView serving the bundle from
    // file:// or a custom scheme cannot fetch an absolute http origin without
    // tripping CORS — which is exactly why bundled meshes failed to load.
    this.baseUrl = (opts.baseUrl ?? '/maps').replace(/\/+$/, '');
    this.cacheSize = opts.cacheSize ?? 128;
    this.doFetch =
      opts.fetchImpl ??
      (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : notAvailable);
  }

  // ─── URLs ─────────────────────────────────────────────────────────────────

  url(family: TileFamily, coord: TileCoord): string {
    return `${this.baseUrl}/${family}/${coord.z}/${coord.x}/${coord.y}.json`;
  }

  venueUrl(venueId: string): string {
    return `${this.baseUrl}/indoors/${encodeURIComponent(venueId)}.json`;
  }

  // ─── loads ────────────────────────────────────────────────────────────────

  async vectorTile(coord: TileCoord): Promise<VectorTile | null> {
    return this.load(this.vector, key(coord), this.url('tiles', coord), (raw) =>
      isFormat(raw, 'sm-vector-tile') ? (raw as VectorTile) : null
    );
  }

  async buildingTile(coord: TileCoord): Promise<BuildingTile | null> {
    return this.load(this.buildings, key(coord), this.url('buildings', coord), (raw) =>
      isFormat(raw, 'sm-building-tile') ? (raw as BuildingTile) : null
    );
  }

  async poiTile(coord: TileCoord): Promise<PoiTile | null> {
    return this.load(this.poi, key(coord), this.url('poi', coord), (raw) =>
      isFormat(raw, 'sm-poi-tile') ? (raw as PoiTile) : null
    );
  }

  async venue(venueId: string): Promise<IndoorVenue | null> {
    return this.load(this.venues, venueId, this.venueUrl(venueId), (raw) =>
      isFormat(raw, 'sm-indoor-venue') ? (raw as IndoorVenue) : null
    );
  }

  // ─── cache access without I/O ─────────────────────────────────────────────

  peekVector(coord: TileCoord): VectorTile | null {
    return this.vector.get(key(coord))?.value ?? null;
  }

  peekBuildings(coord: TileCoord): BuildingTile | null {
    return this.buildings.get(key(coord))?.value ?? null;
  }

  peekPoi(coord: TileCoord): PoiTile | null {
    return this.poi.get(key(coord))?.value ?? null;
  }

  peekVenue(venueId: string): IndoorVenue | null {
    return this.venues.get(venueId)?.value ?? null;
  }

  clear(): void {
    this.vector.clear();
    this.buildings.clear();
    this.poi.clear();
    this.venues.clear();
    this.inflight.clear();
  }

  stats() {
    return {
      vector: this.vector.size,
      buildings: this.buildings.size,
      poi: this.poi.size,
      venues: this.venues.size,
      inflight: this.inflight.size
    };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async load<T>(
    cache: Map<string, CacheEntry<T>>,
    cacheKey: string,
    url: string,
    parse: (raw: unknown) => T | null
  ): Promise<T | null> {
    const hit = cache.get(cacheKey);
    if (hit) {
      hit.usedAt = ++this.clock;
      return hit.value;
    }

    const pending = this.inflight.get(url) as Promise<T | null> | undefined;
    if (pending) return pending;

    const request = (async (): Promise<T | null> => {
      try {
        const response = await this.doFetch(url);
        // A missing tile is normal (ocean, no buildings, no POIs) — it must
        // not throw, or one empty tile stalls the whole viewport.
        if (!response.ok) return null;
        const value = parse(await response.json());
        if (value === null) {
          console.warn(`[TileSource] unrecognised payload at ${url}`);
          return null;
        }
        cache.set(cacheKey, { value, usedAt: ++this.clock });
        this.evict(cache);
        return value;
      } catch (err) {
        // Network failure, malformed JSON, WebView scheme restriction — all
        // degrade to "no data here" rather than taking the renderer down.
        console.warn(`[TileSource] failed to load ${url}`, err);
        return null;
      } finally {
        this.inflight.delete(url);
      }
    })();

    this.inflight.set(url, request);
    return request;
  }

  private evict<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size <= this.cacheSize) return;
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [k, entry] of cache) {
      if (entry.usedAt < oldest) {
        oldest = entry.usedAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) cache.delete(oldestKey);
  }
}

const key = (c: TileCoord) => `${c.z}/${c.x}/${c.y}`;

function isFormat(raw: unknown, format: string): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { format?: string }).format === format;
}

function notAvailable(): Promise<Response> {
  return Promise.reject(new Error('[TileSource] no fetch implementation available'));
}
