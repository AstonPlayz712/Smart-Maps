import { ZanteNativeCore } from '../../core/zante/native';
import type { GeoCoord, Viewport } from '../../core/zante/native';
import { DynamicEngine } from '../../engine';
import type { SpatialState, EgoState } from '../../engine';
import { AutoMapsIN } from '../../automaps/in';
import { mountDefaultWidgets } from '../../engine/widgets/volumetric';
import type { Borough } from '../../engine';
import type { EventBus } from '../engine/EventBus';
import type { EngineEvents, StyleMode } from '../engine/types';

export interface SmartMapsAEOptions {
  bus: EventBus<EngineEvents>;
  viewport: Viewport;
  /** Local-tangent-plane origin for all native geometry (usually the city centre). */
  origin: GeoCoord;
  /** Initial spatial data — empty is valid; streamed in during Stage 2. */
  spatial?: SpatialState;
  boroughs?: Borough[];
}

/**
 * Stage-1 integration point that stands the full A/E stack up alongside the
 * existing Z Build app:
 *
 *   ZanteNativeCore  → native GPU / scene / assets / widgets / threading
 *   DynamicEngine    → 3D…7D dimensional pipeline
 *   AutoMapsIN       → immersive navigation world
 *
 * It bridges Dynamic Engine signals onto the app EventBus and exposes the
 * frame/ego hooks the app loop calls. The native renderer runs headless in
 * Stage 1 (no device surface yet); Stage 2 binds it to a real swapchain.
 */
export class SmartMapsAE {
  readonly core: ZanteNativeCore;
  readonly dynamic: DynamicEngine;
  readonly inav: AutoMapsIN;

  private running = false;

  constructor(opts: SmartMapsAEOptions) {
    const spatial: SpatialState =
      opts.spatial ?? { roadGraph: { origin: opts.origin, segments: [] }, boroughs: opts.boroughs ?? [] };

    this.core = new ZanteNativeCore({ viewport: opts.viewport, backend: 'webgpu', mode: 'day' });

    this.dynamic = new DynamicEngine({
      core: this.core,
      spatial,
      onSignal: (event, payload) => this.bridgeSignal(opts.bus, event, payload)
    });

    this.inav = new AutoMapsIN({
      gpu: this.dynamic.gpuHooks,
      boroughs: spatial.boroughs,
      origin: opts.origin,
      audio: this.core.audio
    });

    mountDefaultWidgets(this.core.widgets);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.core.start();
  }

  /** Advance the native core + dimensional pipeline one frame. */
  frame(dtSeconds: number): void {
    if (!this.running) return;
    this.dynamic.tick(dtSeconds);
    this.core.frame(dtSeconds);
  }

  setEgo(ego: EgoState): void {
    this.dynamic.setEgo(ego);
  }

  setMode(mode: StyleMode): void {
    this.core.setMode(mode);
    this.dynamic.setMode(mode);
    this.inav.setMode(mode);
  }

  /** Enter immersive navigation along a route polyline. */
  enterImmersive(routePath: GeoCoord[]): void {
    const lanes = this.dynamic.spatial.update(
      { ...syntheticCtx(routePath[0]) },
      0
    ).payload.currentLanes;
    this.inav.enter(routePath, lanes);
  }

  exitImmersive(): void {
    this.inav.exit();
  }

  resize(viewport: Viewport): void {
    this.core.resize(viewport);
  }

  dispose(): void {
    this.running = false;
    this.inav.exit();
    this.dynamic.dispose();
    this.core.dispose();
  }

  private bridgeSignal(bus: EventBus<EngineEvents>, event: string, payload: unknown): void {
    // Dimensional signals are free-form; surface tone/guidance as toasts so the
    // existing UI can react without a new event channel in Stage 1.
    if (event === '7d:tone' || event === '5d:guidance') {
      bus.emit('engine:toast', `${event} → ${String(payload)}`);
    }
  }
}

function syntheticCtx(loc: GeoCoord) {
  return {
    time: 0,
    epochMs: Date.now(),
    ego: { location: loc, headingDeg: 0, speedMps: 0 },
    routePath: [] as GeoCoord[],
    mode: 'day' as const
  };
}
