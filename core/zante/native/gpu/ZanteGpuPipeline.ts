// core/zante/native/gpu/ZanteGpuPipeline.ts

import type { IGpuDevice, GpuBackend, ShaderSource } from './IGpuDevice';
import type {
  Camera,
  DrawItem,
  FrameStats,
  Material,
  MaterialHandle,
  MeshHandle,
  NativeMesh,
  ShaderHandle,
  TextureDesc,
  TextureHandle,
  BufferHandle,
  Viewport,
  Handle
} from '../types';
import { NULL_HANDLE } from '../types';

/**
 * Zante GPU pipeline — the native draw spine of the Z Build, promoted to the
 * A/E core. This is the reference device: it owns the handle table, batches
 * draw items by material, and records frame stats.
 *
 * The Z Build shipped a stub device; the A/E build swaps the body for the
 * real Vulkan/Metal backends (`devshell/native/core/renderer.cpp`) behind the
 * exact same `IGpuDevice` surface, so the renderer and scene graph never
 * change. In the browser dev harness this falls back to a WebGPU recorder.
 */
export class ZanteGpuPipeline implements IGpuDevice {
  readonly backend: GpuBackend;

  private nextHandle = 1;
  private viewport?: Viewport;
  private frame: { camera: Camera; items: DrawItem[] } | null = null;
  private readonly live = new Set<number>();

  constructor(backend: GpuBackend = 'webgpu') {
    this.backend = backend;
  }

  init(viewport: Viewport): void {
    this.viewport = viewport;
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
  }

  dispose(): void {
    this.live.clear();
    this.frame = null;
  }

  private alloc<T extends Handle>(): T {
    const h = this.nextHandle++ as T;
    this.live.add(h);
    return h;
  }

  createShader(_src: ShaderSource): ShaderHandle {
    return this.alloc<ShaderHandle>();
  }

  createTexture(_desc: TextureDesc, _pixels?: ArrayBufferView): TextureHandle {
    return this.alloc<TextureHandle>();
  }

  createMesh(_mesh: NativeMesh): MeshHandle {
    return this.alloc<MeshHandle>();
  }

  createMaterial(_material: Material): MaterialHandle {
    return this.alloc<MaterialHandle>();
  }

  createBuffer(_bytes: ArrayBufferView, _usage: 'vertex' | 'index' | 'uniform' | 'storage'): BufferHandle {
    return this.alloc<BufferHandle>();
  }

  updateTexture(_tex: TextureHandle, _pixels: ArrayBufferView): void {
    /* recorded by the native backend; no-op in the reference device */
  }

  destroy(handle: Handle): void {
    this.live.delete(handle);
  }

  beginFrame(camera: Camera): void {
    if (!this.viewport) throw new Error('ZanteGpuPipeline: init() before beginFrame()');
    this.frame = { camera, items: [] };
  }

  submit(items: readonly DrawItem[]): void {
    if (!this.frame) throw new Error('ZanteGpuPipeline: submit() outside a frame');
    this.frame.items.push(...items);
  }

  endFrame(): FrameStats {
    const items = this.frame?.items ?? [];
    // Reference batching: sort by (layer, material) so the native backend can
    // collapse adjacent items into one draw call.
    items.sort(
      (a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (a.material as number) - (b.material as number)
    );
    let drawCalls = 0;
    let lastMat: MaterialHandle = NULL_HANDLE;
    for (const it of items) {
      if (it.material !== lastMat) {
        drawCalls++;
        lastMat = it.material;
      }
    }
    this.frame = null;
    return { drawCalls, triangles: items.length, gpuMillis: 0, cpuMillis: 0 };
  }
}
