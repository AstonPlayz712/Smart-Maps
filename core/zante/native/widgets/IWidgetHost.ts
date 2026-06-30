// core/zante/native/widgets/IWidgetHost.ts
//
// Native widget host — the promoted Z Build "widget host", rebuilt to render
// volumetric widgets through the Zante renderer rather than DOM/WebView.

import type { ISceneGraph } from '../scene/ISceneGraph';
import type { AssetConverter } from '../interop/AssetConverter';
import type { Vec3, StyleMode } from '../types';

export type WidgetAnchor =
  | { kind: 'screen'; x: number; y: number } // normalized 0..1 overlay space
  | { kind: 'world'; position: Vec3 } // anchored in the scene
  | { kind: 'hud-slot'; slot: string }; // named HUD slot

export interface WidgetContext {
  scene: ISceneGraph;
  /** Upload + place widget geometry on the GPU and into the scene. */
  converter: AssetConverter;
  mode: StyleMode;
  /** Seconds since host start — widgets animate against this. */
  time: number;
}

/**
 * A volumetric widget. Each widget builds/owns a small subtree of scene nodes
 * (its meshes + materials) and updates them per frame. No DOM, no HTML — the
 * geometry is submitted to the GPU like any other scene content.
 */
export interface IVolumetricWidget {
  readonly id: string;
  anchor: WidgetAnchor;

  /** Build scene nodes once the widget is mounted into the host's scene. */
  mount(ctx: WidgetContext): void;
  /** Per-frame update; `dt` is seconds since last frame. */
  update(ctx: WidgetContext, dt: number): void;
  /** Tear down owned scene nodes. */
  unmount(ctx: WidgetContext): void;
}

/**
 * Hosts and ticks volumetric widgets, mounting their geometry into the shared
 * scene graph the Zante renderer walks.
 */
export interface IWidgetHost {
  mount(widget: IVolumetricWidget): void;
  unmount(id: string): void;
  get(id: string): IVolumetricWidget | undefined;
  tick(dt: number): void;
  setMode(mode: StyleMode): void;
}
