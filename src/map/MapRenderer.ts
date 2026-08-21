/**
 * MapRenderer — SmartMapsAE's own map renderer.
 *
 * Replaces the Apple/MapLibre tile pipeline entirely. It owns the layer stack,
 * the camera, and the active floor, and draws through a pluggable
 * `RenderBackend` so the same renderer logic runs on every platform:
 *
 *   web      → Canvas2D/WebGL backend in the browser
 *   iOS      → the Metal/SceneKit backend in SMCore
 *   Android  → the Zante native backend
 *
 * Layers, bottom to top: base vector → 3D buildings → indoor floor → POI.
 */

import { IndoorLayer } from './IndoorLayer';
import { TileSource } from './TileSource';
import { InternalDebugLayer, type InternalDebugFrame, type InternalDebugInput } from './layers/InternalDebugLayer';
import { resolveAccuracyRing, type AccuracyRing } from './layers/AccuracyLayer';
import type { SMPosition } from '../telemetry/Position';
import type { EgoPose } from '../engine/EgoPose';
import {
  lngLatToTileCoord,
  tileToLngLat,
  type BuildingMesh,
  type LngLat,
  type PoiFeature,
  type TileCoord,
  type VectorFeature
} from './types';

export interface Camera {
  center: LngLat;
  zoom: number;
  bearingDeg: number;
  pitchDeg: number;
}

/**
 * Renderer configuration.
 *
 * `debugMode` gates every internal engine layer. It defaults to **false**, so
 * a renderer constructed with no options can never draw internals — the leak
 * was possible because debug drawing had no flag of its own and depended on
 * callers not requesting it.
 */
export interface RendererConfig {
  /** Draw internal engine layers (GNSS/IMU/Always-IN/ego debug). */
  debugMode: boolean;
  /** Draw 3D building meshes. */
  buildings3D: boolean;
  /** Tiles loaded around the centre tile in each direction. */
  tileRadius: number;
}

export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  debugMode: false,
  buildings3D: true,
  tileRadius: 1
};

/** One frame's worth of resolved geometry, in lng/lat. */
export interface RenderFrame {
  camera: Camera;
  roads: { feature: VectorFeature; path: LngLat[] }[];
  buildings: { mesh: BuildingMesh; footprint: LngLat[]; heightM: number; minHeightM: number }[];
  indoor: { outline: LngLat[]; walls: LngLat[][]; level: number; transitioning: boolean } | null;
  pois: { poi: PoiFeature; position: LngLat }[];
  /** Vertical position of the camera subject, metres above ground. */
  egoZ: number;
  /** Accuracy ring in screen pixels, or null when nothing should be drawn. */
  accuracy: AccuracyRing | null;
  /**
   * Internal engine layers. **Null unless `debugMode` is true** — external
   * consumers of a frame never see engine internals.
   */
  debug: InternalDebugFrame | null;
  /** Floor everything in this frame is clipped to; null outdoors. */
  activeFloorLevel: number | null;
}

/** The platform-specific draw surface. */
export interface RenderBackend {
  readonly name: string;
  draw(frame: RenderFrame): void;
  resize?(width: number, height: number): void;
  dispose?(): void;
}

export interface MapRendererOptions extends Partial<RendererConfig> {
  tiles?: TileSource;
  backend?: RenderBackend;
}

export class MapRenderer {
  readonly tiles: TileSource;
  readonly indoor: IndoorLayer;

  private backend: RenderBackend | null;
  private camera: Camera = {
    center: { lng: 0, lat: 0 },
    zoom: 16,
    bearingDeg: 0,
    pitchDeg: 45
  };
  private egoZ = 0;
  private config: RendererConfig;
  private readonly debugLayer = new InternalDebugLayer();
  private position: SMPosition | null = null;
  private ego: EgoPose | null = null;
  private debugInput: InternalDebugInput = { position: null, ego: null, inState: null };
  private running = false;
  private dirty = true;
  private offIndoor: (() => void) | null = null;

  constructor(opts: MapRendererOptions = {}) {
    this.tiles = opts.tiles ?? new TileSource();
    this.indoor = new IndoorLayer(this.tiles);
    this.backend = opts.backend ?? null;
    // debugMode defaults to false — internals are opt-in, never opt-out.
    this.config = {
      debugMode: opts.debugMode ?? DEFAULT_RENDERER_CONFIG.debugMode,
      buildings3D: opts.buildings3D ?? DEFAULT_RENDERER_CONFIG.buildings3D,
      tileRadius: opts.tileRadius ?? DEFAULT_RENDERER_CONFIG.tileRadius
    };

    // BUG FIX (indoor layer not updating when floorLevel changes): the
    // renderer now redraws off the layer's own change event instead of only
    // when the camera moves, so a floor change is visible immediately.
    this.offIndoor = this.indoor.onChange(() => {
      this.dirty = true;
      if (this.running) void this.render();
    });
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  attach(backend: RenderBackend): void {
    this.backend = backend;
    this.dirty = true;
  }

  start(): void {
    this.running = true;
    void this.render();
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.stop();
    this.offIndoor?.();
    this.offIndoor = null;
    this.indoor.dispose();
    this.backend?.dispose?.();
    this.backend = null;
  }

  // ─── camera ───────────────────────────────────────────────────────────────

  setCamera(camera: Partial<Camera>): void {
    this.camera = { ...this.camera, ...camera };
    this.dirty = true;
    if (this.running) void this.render();
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  /** Enable or disable internal debug layers at runtime. */
  setDebugMode(enabled: boolean): void {
    if (this.config.debugMode === enabled) return;
    this.config.debugMode = enabled;
    this.dirty = true;
    if (this.running) void this.render();
  }

  isDebugMode(): boolean {
    return this.config.debugMode;
  }

  getConfig(): RendererConfig {
    return { ...this.config };
  }

  /**
   * Feed the renderer the live position and pose. Used for the accuracy ring
   * and — only when debugMode is on — the internal debug layer.
   */
  setPosition(position: SMPosition | null, ego: EgoPose | null = null): void {
    this.position = position;
    this.ego = ego;
    if (ego) this.setEgoZ(ego.z);
    this.debugInput = { ...this.debugInput, position, ego };
    this.dirty = true;
  }

  /** Extra internals for the debug layer (ignored unless debugMode). */
  setDebugInput(input: Partial<InternalDebugInput>): void {
    this.debugInput = { ...this.debugInput, ...input };
  }

  /** Vertical position of the subject, metres — drives indoor camera height. */
  setEgoZ(z: number): void {
    if (Number.isFinite(z) && z !== this.egoZ) {
      this.egoZ = z;
      this.dirty = true;
    }
  }

  // ─── floors ───────────────────────────────────────────────────────────────

  async enterVenue(venueId: string, floor?: number): Promise<boolean> {
    return this.indoor.enterVenue(venueId, floor);
  }

  setFloor(level: number): boolean {
    return this.indoor.setFloor(level);
  }

  /** Follow a telemetry floor estimate. */
  syncFloor(floorLevel: number | null): void {
    this.indoor.syncToTelemetry(floorLevel);
  }

  // ─── rendering ────────────────────────────────────────────────────────────

  /** Build the frame and hand it to the backend. Safe to call repeatedly. */
  async render(): Promise<RenderFrame> {
    const frame = await this.buildFrame();
    this.dirty = false;
    try {
      this.backend?.draw(frame);
    } catch (err) {
      // A backend fault must not kill the loop — the next frame may recover.
      console.error(`[MapRenderer] backend "${this.backend?.name}" draw failed`, err);
    }
    return frame;
  }

  private async buildFrame(): Promise<RenderFrame> {
    const z = Math.max(0, Math.round(this.camera.zoom));
    const centre = lngLatToTileCoord(this.camera.center, z);
    const coords = this.visibleTiles(centre);
    const activeVenueId = this.indoor.currentVenue()?.venueId ?? null;

    const roads: RenderFrame['roads'] = [];
    const buildings: RenderFrame['buildings'] = [];
    const pois: RenderFrame['pois'] = [];
    const activeFloor = this.indoor.currentLevel();

    // Load every visible tile family in parallel; a missing tile is normal and
    // resolves to null rather than rejecting.
    const loads = coords.map(async (coord) => {
      const [vector, buildingTile, poiTile] = await Promise.all([
        this.tiles.vectorTile(coord),
        this.config.buildings3D ? this.tiles.buildingTile(coord) : Promise.resolve(null),
        this.tiles.poiTile(coord)
      ]);

      if (vector) {
        for (const feature of vector.features) {
          // Indoor features only draw on their own floor — one rule, owned
          // by IndoorLayer, so no layer can forget to apply it.
          if (!this.indoor.isOnActiveFloor(feature.floorLevel)) continue;
          for (const ring of feature.geometry) {
            roads.push({
              feature,
              // Extent comes from the tile, never assumed — see types.ts.
              // Project with the coord the tile itself reports, not the one we
              // asked for: under overzoom they differ, and using the request
              // coord smears the parent tile across every child position.
              path: ring.map(([x, y]) => tileToLngLat(vector.coord, vector.extent, x, y))
            });
          }
        }
      }

      if (buildingTile) {
        for (const mesh of buildingTile.buildings) {
          // Indoors, a building hosting *another* venue would occlude the
          // floor plan — only the active venue's shell is kept.
          if (activeVenueId !== null && mesh.venueId !== undefined && mesh.venueId !== activeVenueId) {
            continue;
          }
          buildings.push({
            mesh,
            footprint: mesh.footprint.map(([x, y]) =>
              tileToLngLat(buildingTile.coord, buildingTile.extent, x, y)
            ),
            heightM: mesh.heightM,
            minHeightM: mesh.minHeightM ?? 0
          });
        }
      }

      if (poiTile) {
        for (const poi of poiTile.pois) {
          if (!this.indoor.isOnActiveFloor(poi.floorLevel)) continue;
          pois.push({
            poi,
            position: tileToLngLat(poiTile.coord, poiTile.extent, poi.position[0], poi.position[1])
          });
        }
      }
    });

    await Promise.all(loads);

    const floor = this.indoor.currentFloor();
    const indoorState = this.indoor.state();

    // Accuracy ring: metres → pixels against the live zoom, clamped, and
    // suppressed indoors in favour of vertical accuracy (see AccuracyLayer).
    const accuracy = this.position
      ? resolveAccuracyRing(this.position, this.camera.zoom)
      : null;

    // Internal layers are built through the gate; with debugMode false this is
    // null and no internal geometry exists in the frame at all.
    const debug = this.debugLayer.build(
      { ...this.debugInput, position: this.position, ego: this.ego },
      this.config.debugMode
    );

    return {
      camera: this.getCamera(),
      roads,
      buildings,
      indoor: floor
        ? {
            outline: floor.outline,
            walls: floor.walls ?? [],
            level: floor.level,
            transitioning: indoorState.transitioning
          }
        : null,
      pois,
      egoZ: this.egoZ,
      accuracy,
      debug,
      activeFloorLevel: activeFloor
    };
  }

  private visibleTiles(centre: TileCoord): TileCoord[] {
    const coords: TileCoord[] = [];
    const seen = new Set<string>();
    const span = 1 << centre.z;
    for (let dx = -this.config.tileRadius; dx <= this.config.tileRadius; dx++) {
      for (let dy = -this.config.tileRadius; dy <= this.config.tileRadius; dy++) {
        const x = centre.x + dx;
        const y = centre.y + dy;
        // Clamp y (no wrap at the poles), wrap x (the world is a cylinder).
        if (y < 0 || y >= span) continue;
        const requested = { z: centre.z, x: ((x % span) + span) % span, y };
        // Under overzoom several requested tiles share one source tile —
        // fetching and drawing it once is both correct and cheaper.
        const source = this.tiles.sourceCoord(requested);
        const key = `${source.z}/${source.x}/${source.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coords.push(requested);
      }
    }
    return coords;
  }

  isDirty(): boolean {
    return this.dirty;
  }
}
