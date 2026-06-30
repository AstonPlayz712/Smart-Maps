// engine/DynamicEngine.ts
//
// The Dynamic Engine — the core of Smart Maps A/E. It owns the dimensional
// pipeline (3D→7D), drives it each tick against a single DynamicContext, and
// exposes the fused result plus direct handles to each dimension. It binds to
// the Zante native core for GPU + threading, and emits engine signals out to
// the app event bus.

import type {
  DynamicContext,
  DimensionalFrame,
  DimensionHost,
  EgoState,
  GeoCoord
} from './types';
import { Pipeline } from './pipeline/Pipeline';
import { ThreadModel } from './pipeline/ThreadModel';
import { GpuHooks } from './pipeline/GpuHooks';
import { SpatialEngine, type SpatialState } from './3d/SpatialEngine';
import { TemporalEngine } from './4d/TemporalEngine';
import { ContextEngine } from './5d/ContextEngine';
import { BehaviourEngine } from './6d/BehaviourEngine';
import { IntentEngine } from './7d/IntentEngine';
import type { ZanteNativeCore } from '../core/zante/native';

export interface DynamicEngineOptions {
  core: ZanteNativeCore;
  spatial: SpatialState;
  /** Sink for engine signals — bridge this to the app EventBus. */
  onSignal?: (event: string, payload: unknown) => void;
}

export class DynamicEngine {
  readonly pipeline = new Pipeline();
  readonly threads: ThreadModel;
  readonly gpuHooks: GpuHooks;

  readonly spatial: SpatialEngine;
  readonly temporal: TemporalEngine;
  readonly context: ContextEngine;
  readonly behaviour: BehaviourEngine;
  readonly intent: IntentEngine;

  private ctx: DynamicContext;
  private lastFrame: DimensionalFrame | null = null;

  constructor(opts: DynamicEngineOptions) {
    this.threads = new ThreadModel(opts.core.threads);
    this.gpuHooks = new GpuHooks(opts.core.gpu, opts.core.scene);

    const host: DimensionHost = {
      schedule: (priority, fn) => opts.core.threads.run(priority, fn),
      signal: (event, payload) => opts.onSignal?.(event, payload)
    };

    this.spatial = new SpatialEngine(opts.spatial, this.gpuHooks);
    this.temporal = new TemporalEngine();
    this.context = new ContextEngine();
    this.behaviour = new BehaviourEngine();
    this.intent = new IntentEngine();

    for (const dim of [this.spatial, this.temporal, this.context, this.behaviour, this.intent]) {
      dim.init(host);
      this.pipeline.register(dim);
    }

    this.ctx = {
      time: 0,
      epochMs: Date.now(),
      ego: { location: opts.spatial.roadGraph.origin, headingDeg: 0, speedMps: 0 },
      routePath: [],
      mode: 'day'
    };
  }

  // ─── per-tick driving ───────────────────────────────────────────────────

  setEgo(ego: EgoState): void {
    this.ctx.ego = ego;
  }

  setDestination(dest: GeoCoord | undefined): void {
    this.ctx.destination = dest;
  }

  setRoutePath(path: readonly GeoCoord[]): void {
    this.ctx.routePath = path;
  }

  setMode(mode: DynamicContext['mode']): void {
    this.ctx.mode = mode;
  }

  /** Advance every dimension one tick and return the fused frame. */
  tick(dtSeconds: number): DimensionalFrame {
    this.ctx.time += dtSeconds;
    this.ctx.epochMs = Date.now();
    this.lastFrame = this.pipeline.run(this.ctx, dtSeconds);
    return this.lastFrame;
  }

  frame(): DimensionalFrame | null {
    return this.lastFrame;
  }

  /** The net routing bias across all dimensions, summed per sign. */
  netBias(): number {
    if (!this.lastFrame) return 0;
    return this.lastFrame.blended.reduce((acc, s) => acc + s.weight, 0);
  }

  dispose(): void {
    for (const dim of [this.spatial, this.temporal, this.context, this.behaviour, this.intent]) {
      dim.dispose();
    }
  }
}
