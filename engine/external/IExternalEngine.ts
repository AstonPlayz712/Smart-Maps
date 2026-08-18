// engine/external/IExternalEngine.ts
//
// Describes an external engine being evaluated for integration, and what it can
// contribute. The Dynamic Engine never depends on these types at runtime for
// its own logic — they exist so the 50% rule (FeatureCoverage) can decide
// between "integrate whole" and "extract only the goods".

import type { NativeMesh } from '../../core/zante/native/types';

/** The native capability surface A/E requires of any engine. */
export type NativeFeature =
  | 'gpu' // owns a native GPU device/pipeline
  | 'renderer' // scene-walking renderer
  | 'geometry' // 3D geometry / meshes
  | 'terrain' // terrain / heightfield system
  | 'streaming' // asset streaming
  | 'roadgraph' // road network graph
  | 'shaders' // shader library
  | 'audio' // native audio
  | 'threading'; // native job system

export const REQUIRED_FEATURES: readonly NativeFeature[] = [
  'gpu',
  'renderer',
  'geometry',
  'terrain',
  'streaming'
];

/** Extractable goods when an engine is NOT integrated whole (<50% rule). */
export interface ExtractableGoods {
  meshes?: () => Iterable<NativeMesh>;
  terrain?: () => Iterable<NativeMesh>;
  roadGraphs?: () => Iterable<unknown>;
  shaders?: () => Iterable<{ name: string; vertex: string; fragment: string }>;
}

export interface IExternalEngine {
  readonly name: string;
  /** Features this engine natively provides. */
  readonly features: readonly NativeFeature[];
  /** Goods to extract if we fuse rather than adopt it whole. */
  readonly goods: ExtractableGoods;
  /** Adopt the engine whole — called only when coverage ≥ 50%. */
  integrateWhole?(): void;
}
