// core/zante/native/renderer/ZanteRenderer.ts

import type { IRenderer, RendererInitOptions } from './IRenderer';
import type { ISceneGraph } from '../scene/ISceneGraph';
import type { IGpuDevice } from '../gpu/IGpuDevice';
import type { Camera, FrameStats, StyleMode, Viewport, DrawItem } from '../types';
import { IDENTITY_MAT4 } from '../types';

const DEFAULT_CAMERA: Camera = {
  position: [0, 200, 400],
  forward: [0, -0.4, -1],
  up: [0, 1, 0],
  fovYRadians: (60 * Math.PI) / 180,
  near: 1,
  far: 40000
};

/**
 * Zante renderer — the promoted Z Build rendering core.
 *
 * Responsibilities:
 *   • Own the camera and atmospheric mode.
 *   • Walk the bound scene graph each frame, frustum-cull, and flatten
 *     visible nodes into GPU draw items.
 *   • Hand the batch to the injected `IGpuDevice`.
 *
 * The Z Build drove MapLibre's WebGL context directly. The A/E renderer is
 * backend-agnostic: it talks only to `IGpuDevice`, so the same code path
 * runs on Vulkan, Metal, or the WebGPU dev harness.
 */
export class ZanteRenderer implements IRenderer {
  private scene?: ISceneGraph;
  private camera: Camera = DEFAULT_CAMERA;
  private mode: StyleMode = 'day';
  private viewport?: Viewport;

  constructor(private readonly gpu: IGpuDevice) {}

  init(opts: RendererInitOptions): void {
    this.viewport = opts.viewport;
    this.mode = opts.mode ?? 'day';
    this.gpu.init(opts.viewport);
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    this.gpu.resize(viewport);
  }

  dispose(): void {
    this.gpu.dispose();
    this.scene = undefined;
  }

  setScene(scene: ISceneGraph): void {
    this.scene = scene;
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  getCamera(): Camera {
    return this.camera;
  }

  setMode(mode: StyleMode): void {
    this.mode = mode;
  }

  getMode(): StyleMode {
    return this.mode;
  }

  renderFrame(_dtSeconds: number): FrameStats {
    if (!this.viewport) throw new Error('ZanteRenderer: init() before renderFrame()');
    this.gpu.beginFrame(this.camera);

    const items: DrawItem[] = [];
    if (this.scene) {
      for (const node of this.scene.visibleNodes(this.camera)) {
        if (node.mesh == null || node.material == null) continue;
        items.push({
          mesh: node.mesh,
          material: node.material,
          transform: node.worldTransform ?? IDENTITY_MAT4,
          layer: node.layer
        });
      }
    }

    this.gpu.submit(items);
    return this.gpu.endFrame();
  }
}
