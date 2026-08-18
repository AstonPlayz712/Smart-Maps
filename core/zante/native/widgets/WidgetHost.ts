// core/zante/native/widgets/WidgetHost.ts

import type { IWidgetHost, IVolumetricWidget, WidgetContext } from './IWidgetHost';
import type { ISceneGraph } from '../scene/ISceneGraph';
import type { AssetConverter } from '../interop/AssetConverter';
import type { StyleMode } from '../types';

/**
 * Reference widget host. Owns the mounted widget set and ticks them against a
 * shared scene graph + monotonic clock. Mode changes fan out so widgets can
 * re-tone for day/dusk/night.
 */
export class WidgetHost implements IWidgetHost {
  private widgets = new Map<string, IVolumetricWidget>();
  private time = 0;
  private mode: StyleMode = 'day';

  constructor(
    private readonly scene: ISceneGraph,
    private readonly converter: AssetConverter
  ) {}

  private ctx(): WidgetContext {
    return { scene: this.scene, converter: this.converter, mode: this.mode, time: this.time };
  }

  mount(widget: IVolumetricWidget): void {
    if (this.widgets.has(widget.id)) this.unmount(widget.id);
    this.widgets.set(widget.id, widget);
    widget.mount(this.ctx());
  }

  unmount(id: string): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.unmount(this.ctx());
    this.widgets.delete(id);
  }

  get(id: string): IVolumetricWidget | undefined {
    return this.widgets.get(id);
  }

  tick(dt: number): void {
    this.time += dt;
    const ctx = this.ctx();
    for (const w of this.widgets.values()) w.update(ctx, dt);
  }

  setMode(mode: StyleMode): void {
    this.mode = mode;
  }
}
