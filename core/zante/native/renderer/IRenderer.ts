// core/zante/native/renderer/IRenderer.ts
//
// Clean rendering interface for the Zante native renderer. This is the single
// surface the Dynamic Engine, AutoMaps IN, and the widget host draw through.

import type { Camera, FrameStats, Viewport, StyleMode } from '../types';
import type { ISceneGraph } from '../scene/ISceneGraph';

export type { StyleMode } from '../types';

export interface RendererInitOptions {
  viewport: Viewport;
  /** Atmospheric mode the renderer boots into. */
  mode?: StyleMode;
}

/**
 * The native renderer. It walks a scene graph, culls against the camera,
 * resolves materials, and submits draw items to the GPU device. It owns no
 * scene state itself — the scene graph is injected, keeping render and scene
 * concerns cleanly separable (the Z Build conflated them; A/E splits them).
 */
export interface IRenderer {
  init(opts: RendererInitOptions): void;
  resize(viewport: Viewport): void;
  dispose(): void;

  /** Bind the scene this renderer walks each frame. */
  setScene(scene: ISceneGraph): void;

  setCamera(camera: Camera): void;
  getCamera(): Camera;

  /** Day / dusk / night atmosphere — drives sky, fog, and material tone. */
  setMode(mode: StyleMode): void;
  getMode(): StyleMode;

  /** Render one frame. Returns stats for the HUD / profiler. */
  renderFrame(dtSeconds: number): FrameStats;
}
