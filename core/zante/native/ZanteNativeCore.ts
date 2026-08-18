// core/zante/native/ZanteNativeCore.ts
//
// The promoted Z Build, assembled. ZanteNativeCore wires the native
// subsystems — GPU pipeline, renderer, scene graph, asset streamer, widget
// host, audio engine, thread pool — into one boot/teardown unit that the
// Dynamic Engine and the app shell stand on.

import { ZanteGpuPipeline } from './gpu/ZanteGpuPipeline';
import type { IGpuDevice, GpuBackend } from './gpu/IGpuDevice';
import { ZanteRenderer } from './renderer/ZanteRenderer';
import type { IRenderer } from './renderer/IRenderer';
import { SceneGraph } from './scene/SceneGraph';
import type { ISceneGraph } from './scene/ISceneGraph';
import { WidgetHost } from './widgets/WidgetHost';
import type { IWidgetHost } from './widgets/IWidgetHost';
import { ThreadPool } from './threading/ThreadPool';
import { AssetLoader } from './assets/AssetLoader';
import type { IAssetStream, AssetKey, LoadedAsset } from './assets/IAssetStream';
import { GeometryAdapterRegistry } from './interop/GeometryAdapter';
import { AssetConverter } from './interop/AssetConverter';
import type { IAudioEngine } from './audio/IAudioEngine';
import type { Viewport, StyleMode } from './types';

export interface ZanteCoreOptions {
  viewport: Viewport;
  backend?: GpuBackend;
  mode?: StyleMode;
  /** Resolves an asset key to bytes — disk/net/procedural. */
  resolveAsset?: (key: AssetKey) => Promise<LoadedAsset>;
  /** Native audio engine; optional in headless dev. */
  audio?: IAudioEngine;
  /** Asset residency budget in bytes. */
  assetBudgetBytes?: number;
}

/**
 * Native core facade. Everything above (Dynamic Engine, AutoMaps IN, widgets)
 * talks to these handles, never to a graphics/audio API directly. Swapping the
 * GPU backend or asset source is a one-line change here.
 */
export class ZanteNativeCore {
  readonly gpu: IGpuDevice;
  readonly scene: ISceneGraph;
  readonly renderer: IRenderer;
  readonly threads: ThreadPool;
  readonly assets: IAssetStream;
  readonly widgets: IWidgetHost;
  readonly converter: AssetConverter;
  readonly adapters: GeometryAdapterRegistry;
  readonly audio?: IAudioEngine;

  private running = false;

  constructor(opts: ZanteCoreOptions) {
    this.gpu = new ZanteGpuPipeline(opts.backend ?? 'webgpu');
    this.scene = new SceneGraph();
    this.renderer = new ZanteRenderer(this.gpu);
    this.threads = new ThreadPool();
    this.assets = new AssetLoader(
      opts.resolveAsset ?? defaultResolve,
      this.threads,
      opts.assetBudgetBytes
    );
    this.adapters = new GeometryAdapterRegistry();
    this.converter = new AssetConverter(this.gpu, this.scene);
    this.widgets = new WidgetHost(this.scene, this.converter);
    this.audio = opts.audio;

    this.renderer.init({ viewport: opts.viewport, mode: opts.mode });
    this.renderer.setScene(this.scene);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.audio?.start();
  }

  /** Advance one frame: update scene transforms, tick widgets, render. */
  frame(dtSeconds: number): void {
    this.scene.update();
    this.widgets.tick(dtSeconds);
    this.renderer.renderFrame(dtSeconds);
  }

  setMode(mode: StyleMode): void {
    this.renderer.setMode(mode);
    this.widgets.setMode(mode);
  }

  resize(viewport: Viewport): void {
    this.renderer.resize(viewport);
  }

  dispose(): void {
    this.running = false;
    this.audio?.stop();
    this.renderer.dispose();
    this.scene.clear();
  }
}

async function defaultResolve(key: AssetKey): Promise<LoadedAsset> {
  // Headless default: returns an empty asset so the streamer has a stable
  // contract before a real disk/net resolver is wired in.
  return { key, data: null, bytes: 0 };
}
