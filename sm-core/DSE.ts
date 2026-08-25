/**
 * DSE — the Smart-Maps Dynamic Spatial Engine.
 *
 * Smart-Maps is not an operating system. There is no bootloader here, no
 * kernel, no start-up watchdog and no state in which the engine "has not
 * finished booting": `init()` wires the modules together and resolves, and from
 * that moment the engine answers every call. Data that has not arrived yet is
 * simply data that has not arrived — an empty position, an unloaded tile — and
 * the engine keeps running around it.
 *
 * It is one object composed of five modules, each importable on its own:
 *
 *   sm-core/ae          A/E Dynamic  — fusion, altitude, trajectory, mode,
 *                                      confidence, Always-IN
 *   sm-core/ai          Smart-AI     — POI relevance, indoor/outdoor, floor
 *                                      transitions, route correction,
 *                                      environment reactivity
 *   sm-core/dimensions  3–7D engine  — geometry, motion, environment, traffic,
 *                                      satellite
 *   sm-core/tiles       SM-VT v2     — the vector tile pipeline
 *   sm-core/renderer    Renderer v2  — SM's own map renderer
 *
 * The public API is three calls:
 *
 *   ```ts
 *   const dse = new DSE({ surface });
 *   await dse.init();
 *   dse.updatePosition(gnss, imu);
 *   dse.renderFrame();
 *   ```
 *
 * `sm-platform-web/main.ts` and `sm-platform-mobile/App.tsx` make exactly those
 * calls with exactly those sample shapes, so behaviour is identical on both.
 */

import type { DseOptions, DseState, GnssSample, ImuSample, LngLatPoint, RenderSurface } from './types';
import { AEModule } from './ae';
import type { VenueFrame } from './ae/Fusion';
import type { CorridorSegment, JunctionNode } from './ae/dynamic/types';
import { SmartAI, type PoiCandidate, type SmartAIResult } from './ai';
import { DimensionalEngine, type DimensionalState, type TrafficSample } from './dimensions';
import { TilePipeline, TileSource } from './tiles';
import { MapRenderer, type RenderFrame } from './renderer';

export class DSE {
  readonly ae: AEModule;
  readonly ai: SmartAI;
  readonly dimensions: DimensionalEngine;
  readonly tiles: TilePipeline;
  readonly renderer: MapRenderer;

  private readonly now: () => number;
  private ready = false;
  private lastFrame: RenderFrame | null = null;
  private lastPois: PoiCandidate[] = [];
  private lastAI: SmartAIResult | null = null;
  private lastDimensions: DimensionalState | null = null;
  private routePath: LngLatPoint[] = [];
  private traffic: TrafficSample | null = null;
  private rendering = false;
  private lastSampleMs: number | null = null;

  constructor(opts: DseOptions = {}) {
    this.now = opts.now ?? (() => Date.now());

    // One tile source, shared: the pipeline prefetches into the same cache the
    // renderer reads from, so a prefetched tile is a tile the next frame gets
    // for free rather than a second copy.
    const source = new TileSource({
      baseUrl: opts.tileBaseUrl,
      maxSourceZoom: opts.maxSourceZoom,
      fetchImpl: opts.fetchImpl
    });
    this.renderer = new MapRenderer({
      tiles: source,
      backend: opts.surface ?? undefined,
      debugMode: opts.debugMode ?? false,
      buildings3D: opts.buildings3D
    });
    this.tiles = new TilePipeline({ source });

    this.ae = new AEModule({ now: this.now, predictionHorizonS: opts.predictionHorizonS });
    this.ai = new SmartAI();
    this.dimensions = new DimensionalEngine();
  }

  /**
   * Wire the modules up.
   *
   * Async only because a host may want to await it in the same place it awaits
   * its own set-up; it does no network work and resolves on the next microtask.
   * There is deliberately no timeout, no retry and no failure mode: nothing
   * here can fail to start.
   */
  async init(): Promise<void> {
    if (this.ready) return;
    this.ae.init();
    this.ai.init();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Attach or replace the draw surface. Safe before or after `init()`. */
  attachSurface(surface: RenderSurface): void {
    this.renderer.attach(surface);
  }

  /**
   * Feed one paired sample.
   *
   * Synchronous and total: every module advances, the camera follows, and the
   * renderer is marked dirty. It never throws for a poor sample — a coarse fix
   * is a real fix and is used, graded rather than discarded.
   */
  updatePosition(gnss: GnssSample, imu: ImuSample): void {
    const ae = this.ae.update(gnss, imu);

    // dt comes from the samples themselves, so replaying a recorded trace
    // produces the same output as running it live.
    const stamp = Number.isFinite(imu.timestampMs) ? imu.timestampMs : gnss.timestampMs;
    const dtMs = this.lastSampleMs === null ? 0 : Math.max(0, stamp - this.lastSampleMs);
    this.lastSampleMs = stamp;

    const insideKnownVenue = this.renderer.indoor.currentVenue() !== null;
    const ai = this.ai.update({
      position: ae.position,
      motion: ae.motion,
      dtMs,
      // The AI reads the POIs the last frame actually resolved, so ranking is
      // over the tiles that are really loaded rather than a speculative set.
      pois: this.lastPois,
      routePath: this.routePath,
      insideKnownVenue
    });
    this.lastAI = ai;

    this.lastDimensions = this.dimensions.evaluate({
      position: ae.position,
      ego: ae.ego,
      motion: ae.motion,
      environment: ai.context.environment,
      levels: this.renderer.indoor.levels(),
      traffic: this.traffic,
      nowMs: this.now()
    });

    // Renderer state: position and floor first, then the camera the AI asked
    // for. Floor sync goes through IndoorLayer so clipping stays consistent.
    this.renderer.setPosition(ae.position, ae.ego);
    this.renderer.setEgoZ(ae.ego.z);
    this.renderer.syncFloor(ae.position.floorLevel);
    this.renderer.setCamera({
      center: { lng: ae.position.lng, lat: ae.position.lat },
      zoom: ai.environment.zoom,
      pitchDeg: ai.environment.pitchDeg,
      bearingDeg: ae.position.headingDeg
    });

    // Warm the tiles the trajectory is heading into, not just the ones we sit on.
    this.tiles.prefetch(ae.trajectory.predicted, ai.environment.zoom);
  }

  /**
   * Draw one frame.
   *
   * Fire-and-forget by design: the frame build awaits tile loads, and a host
   * render loop must not be made to wait on the network. Overlapping calls
   * collapse into the in-flight one instead of queueing.
   */
  renderFrame(): void {
    if (this.rendering) return;
    this.rendering = true;
    void this.renderer
      .render()
      .then((frame) => {
        this.lastFrame = frame;
        this.lastPois = frame.pois.map((p) => ({ poi: p.poi, position: p.position }));
      })
      .catch((err) => {
        // A frame that could not be built is a dropped frame, never a stopped
        // engine — the next tick tries again with whatever has since loaded.
        console.error('[DSE] frame build failed', err);
      })
      .finally(() => {
        this.rendering = false;
      });
  }

  // ─── optional inputs ──────────────────────────────────────────────────────

  /**
   * Enter a mapped venue: loads the floor plans, anchors the vertical frame and
   * clips the renderer to a floor. Returns false when the venue is unpublished.
   */
  async enterVenue(venueId: string, initialFloor?: number): Promise<boolean> {
    const entered = await this.renderer.indoor.enterVenue(venueId, initialFloor);
    if (!entered) return false;
    const venue = this.renderer.indoor.currentVenue();
    if (venue) {
      const ground = venue.floors.find((f) => f.level === 0) ?? venue.floors[0];
      this.ae.setVenueFrame(venueFrameFor(venue.venueId, venue.floors, ground?.elevationM ?? 0));
    }
    return true;
  }

  exitVenue(): void {
    this.renderer.indoor.exitVenue();
    this.ae.setVenueFrame(null);
  }

  /** Activate a corridor route — Always-IN's horizontal states follow from it. */
  setRoute(segments: CorridorSegment[], junctions: JunctionNode[]): void {
    this.ae.setRoute(segments, junctions);
    this.routePath = segments.flatMap((s) => s.path.map((p) => ({ lng: p.lng, lat: p.lat })));
  }

  clearRoute(): void {
    this.ae.clearRoute();
    this.routePath = [];
  }

  /** Supply live traffic for the 6D layer. Pass null to drop back to 5D. */
  setTraffic(traffic: TrafficSample | null): void {
    this.traffic = traffic;
  }

  /** Turn internal engine layers on. Off by default and off in every shipped UI. */
  setDebugMode(enabled: boolean): void {
    this.renderer.setDebugMode(enabled);
  }

  // ─── output ───────────────────────────────────────────────────────────────

  /** A snapshot of what the engine knows. Contains no internal layer geometry. */
  getState(): DseState {
    const ae = this.ae.current();
    return {
      ready: this.ready,
      position: ae.position,
      ego: ae.ego,
      motion: ae.motion,
      alwaysIN: ae.alwaysIN,
      trajectory: ae.trajectory,
      dimensions:
        this.lastDimensions ??
        this.dimensions.evaluate({
          position: ae.position,
          ego: ae.ego,
          motion: ae.motion,
          environment: 'unknown',
          levels: [],
          traffic: null,
          nowMs: this.now()
        }),
      activeFloorLevel: this.renderer.indoor.currentLevel(),
      venueId: this.renderer.indoor.currentVenue()?.venueId ?? null
    };
  }

  /** The last Smart-AI result, or null before the first `updatePosition`. */
  getAI(): SmartAIResult | null {
    return this.lastAI;
  }

  /** The last drawn frame, or null before the first successful `renderFrame`. */
  getLastFrame(): RenderFrame | null {
    return this.lastFrame;
  }

  reset(): void {
    this.ae.reset();
    this.ai.reset();
    this.routePath = [];
    this.lastPois = [];
    this.lastAI = null;
    this.lastDimensions = null;
    this.lastSampleMs = null;
  }

  dispose(): void {
    this.renderer.dispose();
    this.tiles.clear();
    this.ready = false;
  }
}

/** Build the vertical frame for a venue from its floor elevations. */
function venueFrameFor(
  venueId: string,
  floors: { level: number; elevationM: number }[],
  groundAltitudeM: number
): VenueFrame {
  // Derive the storey pitch from the venue's own floors rather than assuming
  // one: a shopping centre and an office block are not the same building.
  const sorted = [...floors].sort((a, b) => a.level - b.level);
  let pitch = 4.2;
  if (sorted.length >= 2) {
    const rise = sorted[sorted.length - 1].elevationM - sorted[0].elevationM;
    const spans = sorted[sorted.length - 1].level - sorted[0].level;
    if (spans > 0 && rise > 0) pitch = rise / spans;
  }
  return {
    venueId,
    groundAltitudeM,
    floorHeightM: pitch,
    levels: sorted.map((f) => f.level)
  };
}
