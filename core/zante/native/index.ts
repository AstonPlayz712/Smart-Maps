// core/zante/native/index.ts
//
// Public barrel for the Zante native core — the promoted Z Build foundation.
// Import the native core from here; deep paths are internal wiring.

export { ZanteNativeCore } from './ZanteNativeCore';
export type { ZanteCoreOptions } from './ZanteNativeCore';

// Renderer
export { ZanteRenderer } from './renderer/ZanteRenderer';
export type { IRenderer, RendererInitOptions } from './renderer/IRenderer';

// GPU
export { ZanteGpuPipeline } from './gpu/ZanteGpuPipeline';
export type { IGpuDevice, GpuBackend, ShaderSource } from './gpu/IGpuDevice';

// Scene
export { SceneGraph } from './scene/SceneGraph';
export { createSceneNode } from './scene/SceneNode';
export type { ISceneGraph } from './scene/ISceneGraph';
export type { ISceneNode, NodeId } from './scene/SceneNode';

// Assets + threading
export { AssetLoader } from './assets/AssetLoader';
export { ThreadPool } from './threading/ThreadPool';
export type {
  IAssetStream,
  AssetKey,
  AssetKind,
  AssetRequest,
  AssetPriority,
  LoadedAsset,
  MeshAsset,
  TextureAsset
} from './assets/IAssetStream';

// Widgets
export { WidgetHost } from './widgets/WidgetHost';
export type { IWidgetHost, IVolumetricWidget, WidgetAnchor, WidgetContext } from './widgets/IWidgetHost';

// Audio
export type { IAudioEngine, VoiceCue, SpatialEmitter, BusId } from './audio/IAudioEngine';

// Interop (external geometry → native)
export { GeometryAdapterRegistry, geoToLocal } from './interop/GeometryAdapter';
export type { IGeometryAdapter, ExternalSourceFormat } from './interop/GeometryAdapter';
export { AssetConverter } from './interop/AssetConverter';
export type { ConvertOptions } from './interop/AssetConverter';
export { toNativeMesh, flipWinding, computeBounds } from './interop/NativeFormat';
export type { ExternalGeometry, InterleavedVertex } from './interop/NativeFormat';

// Native primitive types
export type {
  Vec2,
  Vec3,
  Vec4,
  Mat4,
  GeoCoord,
  AABB,
  NativeMesh,
  Material,
  Camera,
  Viewport,
  StyleMode,
  FrameStats,
  DrawItem,
  TextureDesc,
  MeshHandle,
  MaterialHandle,
  TextureHandle,
  ShaderHandle,
  BufferHandle,
  Handle
} from './types';
export { IDENTITY_MAT4, NULL_HANDLE } from './types';
