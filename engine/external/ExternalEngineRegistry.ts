// engine/external/ExternalEngineRegistry.ts
//
// Applies the 50% rule across registered external engines and executes the
// verdict: integrate-whole calls the engine's own adopt path; extract-goods
// pulls geometry/terrain/road-graphs/shaders through the Zante interop layer
// into the native scene.

import type { IExternalEngine } from './IExternalEngine';
import { evaluateCoverage, type CoverageResult } from './FeatureCoverage';
import type { AssetConverter } from '../../core/zante/native/interop/AssetConverter';
import type { IGpuDevice, ShaderSource } from '../../core/zante/native/gpu/IGpuDevice';
import { NULL_HANDLE } from '../../core/zante/native/types';

export interface IntegrationReport extends CoverageResult {
  meshesFused: number;
  shadersFused: number;
}

export class ExternalEngineRegistry {
  private engines: IExternalEngine[] = [];

  constructor(
    private readonly converter: AssetConverter,
    private readonly gpu: IGpuDevice
  ) {}

  register(engine: IExternalEngine): void {
    this.engines.push(engine);
  }

  /** Evaluate + integrate every registered engine; returns per-engine reports. */
  integrateAll(): IntegrationReport[] {
    return this.engines.map((e) => this.integrate(e));
  }

  private integrate(engine: IExternalEngine): IntegrationReport {
    const result = evaluateCoverage(engine);
    let meshesFused = 0;
    let shadersFused = 0;

    if (result.verdict === 'integrate-whole') {
      engine.integrateWhole?.();
    } else {
      // Extract only the goods and fuse them into the native engine.
      const { meshes, terrain, shaders } = engine.goods;
      for (const mesh of meshes?.() ?? []) {
        this.converter.place(mesh, {
          material: { shader: NULL_HANDLE, baseColor: [0.5, 0.5, 0.5, 1], blend: 'opaque' },
          tags: ['external', engine.name, 'mesh']
        });
        meshesFused++;
      }
      for (const tile of terrain?.() ?? []) {
        this.converter.place(tile, {
          material: { shader: NULL_HANDLE, baseColor: [0.3, 0.4, 0.3, 1], blend: 'opaque' },
          tags: ['external', engine.name, 'terrain']
        });
        meshesFused++;
      }
      for (const s of shaders?.() ?? []) {
        const src: ShaderSource = { vertex: s.vertex, fragment: s.fragment, label: s.name };
        this.gpu.createShader(src);
        shadersFused++;
      }
    }

    return { ...result, meshesFused, shadersFused };
  }
}
