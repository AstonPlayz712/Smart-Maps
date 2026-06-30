// engine/widgets/volumetric/widgets.ts
//
// The volumetric widget set, rendered through the Zante native renderer (no
// DOM). Each is an IVolumetricWidget that builds a small scene subtree on
// mount and animates it on update. These are the Stage-1 foundations the
// Stage-2 UI/UX layer styles and binds to live data.

import type {
  IVolumetricWidget,
  WidgetAnchor,
  WidgetContext
} from '../../../core/zante/native/widgets/IWidgetHost';
import type { NodeId } from '../../../core/zante/native/scene/SceneNode';
import type { Material, StyleMode } from '../../../core/zante/native/types';
import { NULL_HANDLE } from '../../../core/zante/native/types';
import { sphere, ring, ribbon, box, transformYRotate } from './primitives';

function emissiveMat(rgb: [number, number, number], alpha = 1): Material {
  return {
    shader: NULL_HANDLE,
    baseColor: [rgb[0], rgb[1], rgb[2], alpha],
    emissive: rgb,
    blend: alpha < 1 ? 'transparent' : 'opaque'
  };
}

/** Base class wiring the mount/unmount node bookkeeping every widget shares. */
abstract class BaseWidget implements IVolumetricWidget {
  abstract readonly id: string;
  anchor: WidgetAnchor;
  protected nodes: NodeId[] = [];
  protected spin = 0;

  constructor(anchor: WidgetAnchor) {
    this.anchor = anchor;
  }

  abstract mount(ctx: WidgetContext): void;
  abstract update(ctx: WidgetContext, dt: number): void;

  unmount(ctx: WidgetContext): void {
    for (const id of this.nodes) ctx.scene.remove(id);
    this.nodes = [];
  }

  protected place(ctx: WidgetContext, mat: Material, mesh = sphere(1), layer = 10): NodeId {
    const id = ctx.converter.place(mesh, { material: mat, layer, tags: ['widget', this.id] });
    this.nodes.push(id);
    return id;
  }
}

/** Weather Orb — a glowing sphere whose tone tracks the current sky. */
export class WeatherOrb extends BaseWidget {
  readonly id = 'weather-orb';
  private orb?: NodeId;

  mount(ctx: WidgetContext): void {
    this.orb = this.place(ctx, emissiveMat(toneFor(ctx.mode), 0.85), sphere(1, 18, 28));
  }
  update(ctx: WidgetContext, dt: number): void {
    this.spin += dt * 0.5;
    if (this.orb) {
      const n = ctx.scene.get(this.orb);
      if (n) {
        n.localTransform = transformYRotate(this.spin);
        ctx.scene.markDirty(this.orb);
      }
    }
  }
}

/** Calendar Ring — a ring segmented into the day's events. */
export class CalendarRing extends BaseWidget {
  readonly id = 'calendar-ring';
  mount(ctx: WidgetContext): void {
    this.place(ctx, emissiveMat([0.5, 0.7, 1], 0.9), ring(0.78, 1, 64));
  }
  update(ctx: WidgetContext, dt: number): void {
    this.spin += dt * 0.15;
    for (const id of this.nodes) {
      const n = ctx.scene.get(id);
      if (n) {
        n.localTransform = transformYRotate(this.spin);
        ctx.scene.markDirty(id);
      }
    }
  }
}

/** Navigation Ribbon — a flowing strip pointing toward the next maneuver. */
export class NavigationRibbon extends BaseWidget {
  readonly id = 'navigation-ribbon';
  mount(ctx: WidgetContext): void {
    this.place(ctx, emissiveMat([0.3, 0.85, 1], 0.8), ribbon(4, 0.6, 32), 11);
  }
  update(_ctx: WidgetContext, _dt: number): void {
    /* flow animation is a shader uniform in Stage 2; geometry is static */
  }
}

/** Flight Widget — a small box "boarding card" that gently bobs. */
export class FlightWidget extends BaseWidget {
  readonly id = 'flight-widget';
  private t = 0;
  mount(ctx: WidgetContext): void {
    this.place(ctx, emissiveMat([0.9, 0.6, 0.3], 0.95), box(1.6, 0.9, 0.08), 12);
  }
  update(ctx: WidgetContext, dt: number): void {
    this.t += dt;
    const y = Math.sin(this.t * 1.5) * 0.05;
    for (const id of this.nodes) {
      const n = ctx.scene.get(id);
      if (n) {
        n.localTransform = transformYRotate(0, 0, y, 0);
        ctx.scene.markDirty(id);
      }
    }
  }
}

/** Reminder Strips — a stack of thin cells, one per pending reminder. */
export class ReminderStrips extends BaseWidget {
  readonly id = 'reminder-strips';
  constructor(anchor: WidgetAnchor, private count = 3) {
    super(anchor);
  }
  mount(ctx: WidgetContext): void {
    for (let i = 0; i < this.count; i++) {
      const id = ctx.converter.place(box(1.8, 0.18, 0.05), {
        material: emissiveMat([0.6, 0.6, 0.7], 0.85),
        layer: 10,
        tags: ['widget', this.id],
        transform: transformYRotate(0, 0, -i * 0.28, 0)
      });
      this.nodes.push(id);
    }
  }
  update(_ctx: WidgetContext, _dt: number): void {
    /* strips are static until bound to live reminders in Stage 2 */
  }
}

function toneFor(mode: StyleMode): [number, number, number] {
  return mode === 'night' ? [0.4, 0.5, 0.9] : mode === 'dusk' ? [0.9, 0.6, 0.5] : [0.6, 0.8, 1];
}
