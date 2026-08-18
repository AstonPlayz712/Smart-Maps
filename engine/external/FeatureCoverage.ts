// engine/external/FeatureCoverage.ts
//
// The 50% rule. Given an external engine's native feature set, decide whether
// to integrate it whole or extract only the goods and fuse them into the
// native Dynamic Engine.

import type { IExternalEngine, NativeFeature } from './IExternalEngine';
import { REQUIRED_FEATURES } from './IExternalEngine';

export type IntegrationVerdict = 'integrate-whole' | 'extract-goods';

export interface CoverageResult {
  engine: string;
  coverage: number; // 0..1 of REQUIRED_FEATURES provided
  provided: NativeFeature[];
  missing: NativeFeature[];
  verdict: IntegrationVerdict;
}

/**
 * Coverage = (required features the engine provides) / (required features).
 * ≥ 0.5 → integrate whole under engine/external/.
 * < 0.5 → extract only geometry/meshes/terrain/road-graphs/shaders and fuse.
 */
export function evaluateCoverage(
  engine: IExternalEngine,
  required: readonly NativeFeature[] = REQUIRED_FEATURES
): CoverageResult {
  const provided = required.filter((f) => engine.features.includes(f));
  const missing = required.filter((f) => !engine.features.includes(f));
  const coverage = required.length === 0 ? 0 : provided.length / required.length;
  return {
    engine: engine.name,
    coverage,
    provided,
    missing,
    verdict: coverage >= 0.5 ? 'integrate-whole' : 'extract-goods'
  };
}
