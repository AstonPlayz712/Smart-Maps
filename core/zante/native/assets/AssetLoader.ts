// core/zante/native/assets/AssetLoader.ts

import type {
  IAssetStream,
  AssetRequest,
  AssetKey,
  LoadedAsset,
  AssetPriority
} from './IAssetStream';
import type { ThreadPool } from '../threading/ThreadPool';

const PRIORITY_RANK: Record<AssetPriority, number> = {
  immediate: 0,
  high: 1,
  normal: 2,
  prefetch: 3
};

function keyOf(k: AssetKey): string {
  return `${k.kind}:${k.uri}`;
}

/**
 * Native asset streamer — promoted Z Build loader.
 *
 * Resolves requests through a pluggable `resolve` fn (disk / net / procedural)
 * onto a background `ThreadPool`, caches by residency budget, and evicts
 * least-recently-used when the budget is exceeded. Decoding to the native
 * mesh/texture format happens in `interop/` adapters before caching.
 */
export class AssetLoader implements IAssetStream {
  private cache = new Map<string, LoadedAsset>();
  private lru: string[] = [];
  private inflight = new Map<string, Promise<LoadedAsset>>();
  private usedBytes = 0;

  constructor(
    private readonly resolve: (key: AssetKey) => Promise<LoadedAsset>,
    private readonly pool: ThreadPool,
    private readonly budgetBytes = 512 * 1024 * 1024
  ) {}

  async request<T = unknown>(req: AssetRequest): Promise<LoadedAsset<T>> {
    const id = keyOf(req.key);
    const cached = this.cache.get(id);
    if (cached) {
      this.touch(id);
      return cached as LoadedAsset<T>;
    }
    const existing = this.inflight.get(id);
    if (existing) return existing as Promise<LoadedAsset<T>>;

    const job = this.pool
      .run(PRIORITY_RANK[req.priority ?? 'normal'], () => this.resolve(req.key))
      .then((asset) => {
        this.admit(id, asset);
        this.inflight.delete(id);
        return asset;
      });
    this.inflight.set(id, job);
    return job as Promise<LoadedAsset<T>>;
  }

  prefetch(keys: readonly AssetKey[]): void {
    for (const key of keys) void this.request({ key, priority: 'prefetch' });
  }

  evict(key: AssetKey): void {
    const id = keyOf(key);
    const asset = this.cache.get(id);
    if (!asset) return;
    this.usedBytes -= asset.bytes;
    this.cache.delete(id);
    this.lru = this.lru.filter((x) => x !== id);
  }

  residency(): { usedBytes: number; budgetBytes: number } {
    return { usedBytes: this.usedBytes, budgetBytes: this.budgetBytes };
  }

  private admit(id: string, asset: LoadedAsset): void {
    this.cache.set(id, asset);
    this.usedBytes += asset.bytes;
    this.touch(id);
    while (this.usedBytes > this.budgetBytes && this.lru.length > 1) {
      const victim = this.lru.shift();
      if (!victim || victim === id) continue;
      const v = this.cache.get(victim);
      if (v) {
        this.usedBytes -= v.bytes;
        this.cache.delete(victim);
      }
    }
  }

  private touch(id: string): void {
    this.lru = this.lru.filter((x) => x !== id);
    this.lru.push(id);
  }
}
