// core/zante/native/types.ts
//
// Native primitive types for the Zante renderer core — the promoted Z Build
// foundation. These are the lingua franca every native subsystem speaks:
// renderer, scene graph, asset streamer, GPU pipeline, widget host, and the
// Dynamic Engine that sits on top.
//
// Everything here is plain data (tuples / typed arrays) so it can cross the
// JS ⇄ native (JNI / Obj-C++) boundary without an allocation-heavy object
// graph, and so the GPU pipeline can upload it directly.

/** Column-major-friendly numeric vectors, stored as fixed tuples. */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

/** 4×4 transform, row-major, 16 floats. Identity is the default everywhere. */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export const IDENTITY_MAT4: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

/** Geographic coordinate. `alt` is metres above the WGS84 ellipsoid. */
export interface GeoCoord {
  lat: number;
  lng: number;
  alt?: number;
}

/** Axis-aligned bounding box in world (local-tangent-plane) metres. */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/**
 * Native mesh — interleaved-free SoA layout. Positions are required; the rest
 * are optional channels the GPU pipeline binds when present. Indices are
 * 32-bit so borough-scale meshes don't overflow a 16-bit buffer.
 */
export interface NativeMesh {
  positions: Float32Array; // xyz triples
  normals?: Float32Array;  // xyz triples
  uvs?: Float32Array;      // uv pairs
  colors?: Float32Array;   // rgba quads, linear 0..1
  indices: Uint32Array;
  bounds?: AABB;
}

export type Handle = number & { readonly __handle: unique symbol };
export const NULL_HANDLE = 0 as Handle;

/** Opaque GPU resource handles, owned by the Zante GPU pipeline. */
export type BufferHandle = Handle;
export type TextureHandle = Handle;
export type ShaderHandle = Handle;
export type MaterialHandle = Handle;
export type MeshHandle = Handle;

export type TextureFormat = 'rgba8' | 'rgba16f' | 'r8' | 'rg16f' | 'depth24';

export interface TextureDesc {
  width: number;
  height: number;
  format: TextureFormat;
  mips?: boolean;
  label?: string;
}

export interface Material {
  shader: ShaderHandle;
  baseColor: Vec4;
  metallic?: number;
  roughness?: number;
  emissive?: Vec3;
  albedoMap?: TextureHandle;
  /** Render order bucket: opaque < cutout < transparent < overlay. */
  blend?: 'opaque' | 'cutout' | 'transparent' | 'overlay';
  doubleSided?: boolean;
}

export interface Camera {
  position: Vec3;
  /** Look direction, normalized. */
  forward: Vec3;
  up: Vec3;
  fovYRadians: number;
  near: number;
  far: number;
  /** Cached view·projection, recomputed by the renderer each frame. */
  viewProj?: Mat4;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

/** A single thing to draw this frame. The renderer batches these by material. */
export interface DrawItem {
  mesh: MeshHandle;
  material: MaterialHandle;
  transform: Mat4;
  /** Higher = drawn later (overlays, widgets). */
  layer?: number;
}

export interface FrameStats {
  drawCalls: number;
  triangles: number;
  gpuMillis: number;
  cpuMillis: number;
}

/** Atmospheric / lighting mode that drives sky, fog and material tone. */
export type StyleMode = 'day' | 'dusk' | 'night';
