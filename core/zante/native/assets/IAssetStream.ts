// core/zante/native/assets/IAssetStream.ts
//
// Native asset streaming interface. The Z Build bundled every asset into the
// web payload; A/E streams them on demand off a background thread pool so
// borough-scale geometry never blocks the render loop.

import type { NativeMesh, TextureDesc } from '../types';

export type AssetKind = 'mesh' | 'texture' | 'shader' | 'audio' | 'roadgraph' | 'terrain-tile';

export interface AssetKey {
  kind: AssetKind;
  /** Stable id, e.g. `terrain-tile/14/8190/5443` or `mesh/borough/camden`. */
  uri: string;
}

export type AssetPriority = 'immediate' | 'high' | 'normal' | 'prefetch';

export interface AssetRequest {
  key: AssetKey;
  priority?: AssetPriority;
}

export interface LoadedAsset<T = unknown> {
  key: AssetKey;
  data: T;
  bytes: number;
}

export type MeshAsset = LoadedAsset<NativeMesh>;
export type TextureAsset = LoadedAsset<{ desc: TextureDesc; pixels: ArrayBufferView }>;

/**
 * Streaming asset source. Implementations resolve a key to bytes (disk,
 * network, or procedural), decode to a native format, and cache by residency
 * budget. All methods are async and cancellable via the returned handle.
 */
export interface IAssetStream {
  request<T = unknown>(req: AssetRequest): Promise<LoadedAsset<T>>;

  /** Warm the cache without awaiting — fire-and-forget prefetch. */
  prefetch(keys: readonly AssetKey[]): void;

  /** Drop an asset from residency (the GPU copy is released separately). */
  evict(key: AssetKey): void;

  /** Current resident bytes vs. the configured budget. */
  residency(): { usedBytes: number; budgetBytes: number };
}
