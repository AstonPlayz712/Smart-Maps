// core/zante/native/gpu/IGpuDevice.ts
//
// The native GPU device abstraction the Zante renderer draws through. One
// implementation per backend (Vulkan on Android, Metal on iOS, WebGPU in the
// browser dev harness). Nothing above this line touches a graphics API
// directly — the renderer, scene graph and widget host only see handles.

import type {
  BufferHandle,
  MaterialHandle,
  MeshHandle,
  Material,
  NativeMesh,
  ShaderHandle,
  TextureDesc,
  TextureHandle,
  DrawItem,
  Viewport,
  Camera,
  FrameStats
} from '../types';

export type GpuBackend = 'vulkan' | 'metal' | 'webgpu';

export interface ShaderSource {
  /** SPIR-V / MSL / WGSL — the device picks the right field for its backend. */
  vertex: string;
  fragment: string;
  label?: string;
}

/**
 * Low-level native GPU surface. Resource creation is synchronous and returns
 * opaque handles; destruction is explicit (no GC on the GPU heap). All draw
 * submission funnels through `beginFrame` / `submit` / `endFrame`.
 */
export interface IGpuDevice {
  readonly backend: GpuBackend;

  init(viewport: Viewport): void;
  resize(viewport: Viewport): void;
  dispose(): void;

  // ─── resource creation ──────────────────────────────────────────────────
  createShader(src: ShaderSource): ShaderHandle;
  createTexture(desc: TextureDesc, pixels?: ArrayBufferView): TextureHandle;
  createMesh(mesh: NativeMesh): MeshHandle;
  createMaterial(material: Material): MaterialHandle;
  createBuffer(bytes: ArrayBufferView, usage: 'vertex' | 'index' | 'uniform' | 'storage'): BufferHandle;

  // ─── resource updates / teardown ────────────────────────────────────────
  updateTexture(tex: TextureHandle, pixels: ArrayBufferView): void;
  destroy(handle: ShaderHandle | TextureHandle | MeshHandle | MaterialHandle | BufferHandle): void;

  // ─── frame submission ───────────────────────────────────────────────────
  beginFrame(camera: Camera): void;
  submit(items: readonly DrawItem[]): void;
  endFrame(): FrameStats;
}
