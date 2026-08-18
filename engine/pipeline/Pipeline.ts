// engine/pipeline/Pipeline.ts
//
// The dimensional pipeline. Runs every registered dimension for a tick, in
// dependency order (3D → 4D → 5D → 6D → 7D), collects their layers, and fuses
// the per-dimension scores into a single blended result the router consumes.

import type {
  IDimension,
  DynamicContext,
  DimensionalFrame,
  DimensionLayer,
  DimensionScore,
  DimensionId
} from '../types';
import { DIMENSIONS } from '../types';

/** Default fusion weights — higher dimensions nudge, lower dimensions decide. */
const DEFAULT_FUSION: Record<DimensionId, number> = {
  '3d': 1.0, // geometry is ground truth
  '4d': 0.9, // time/traffic strongly shapes routing
  '5d': 0.6, // context biases
  '6d': 0.5, // learned behaviour biases
  '7d': 0.4 // intent biases
};

export class Pipeline {
  private dims = new Map<DimensionId, IDimension>();
  private fusion: Record<DimensionId, number> = { ...DEFAULT_FUSION };

  register(dim: IDimension): void {
    this.dims.set(dim.id, dim);
  }

  setFusionWeight(id: DimensionId, w: number): void {
    this.fusion[id] = w;
  }

  /** Run one full dimensional tick and fuse the results. */
  run(ctx: DynamicContext, dt: number): DimensionalFrame {
    const layers: Partial<Record<DimensionId, DimensionLayer>> = {};
    for (const id of DIMENSIONS) {
      const dim = this.dims.get(id);
      if (!dim) continue;
      layers[id] = dim.update(ctx, dt);
    }
    return { time: ctx.time, layers, blended: this.fuse(layers) };
  }

  /**
   * Weighted-sum fusion. Each dimension's scores are scaled by its fusion
   * weight and summed per target reason bucket. The router reads `blended`.
   */
  private fuse(layers: Partial<Record<DimensionId, DimensionLayer>>): DimensionScore[] {
    const out: DimensionScore[] = [];
    for (const id of DIMENSIONS) {
      const layer = layers[id];
      if (!layer) continue;
      const k = this.fusion[id] ?? 0.5;
      for (const s of layer.scores) {
        out.push({ ...s, weight: s.weight * k });
      }
    }
    return out;
  }
}
