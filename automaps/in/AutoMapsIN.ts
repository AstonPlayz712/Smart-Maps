// automaps/in/AutoMapsIN.ts
//
// AutoMaps IN — Immersive Navigation, A/E. Builds and drives the volumetric
// navigation world: corridors along the route, lane rails on the active lane,
// roundabout discs and junction volumes at decisions, with dynamic lighting,
// occlusion, eased camera transitions, and Sonic voice timing.
//
// It consumes the Dynamic Engine's 3D spatial geometry and 4D/5D context, and
// renders everything through the Zante native core — no DOM, no WebView.

import type { GeoCoord, NativeMesh, Material } from '../../core/zante/native/types';
import { NULL_HANDLE } from '../../core/zante/native/types';
import type { GpuHooks } from '../../engine/pipeline/GpuHooks';
import type { Borough } from '../../engine/3d/boroughMeshes';
import { buildLaneRail, type LaneSpec } from '../../engine/3d/lanes';
import { buildCorridorMesh, buildRoundaboutDisc, buildJunctionVolume } from './meshes';
import { BoroughContinuity, type BoroughCrossing } from './boroughContinuity';
import { DynamicLighting, OcclusionPolicy, CameraTransitions, type CameraPhase } from './lighting';
import { SonicVoiceTiming, type SonicEvent } from './sonicTiming';
import type { IAudioEngine } from '../../core/zante/native/audio/IAudioEngine';

export interface AutoMapsINOptions {
  gpu: GpuHooks;
  boroughs: Borough[];
  origin: GeoCoord;
  audio?: IAudioEngine;
  corridorWidthM?: number;
  corridorHeightM?: number;
}

const CORRIDOR_MAT: Material = {
  shader: NULL_HANDLE,
  baseColor: [0.25, 0.55, 0.95, 0.35],
  emissive: [0.1, 0.3, 0.6],
  blend: 'transparent',
  doubleSided: true
};
const RAIL_MAT: Material = {
  shader: NULL_HANDLE,
  baseColor: [0.4, 0.85, 1, 0.9],
  emissive: [0.3, 0.7, 1],
  blend: 'overlay'
};
const JUNCTION_MAT: Material = {
  shader: NULL_HANDLE,
  baseColor: [1, 0.8, 0.3, 0.3],
  emissive: [0.8, 0.6, 0.2],
  blend: 'transparent'
};

/**
 * Owns the IN scene subtree and presentation state. `enter()` builds the
 * corridor for a route; `update()` advances lighting/continuity/camera and
 * fires Sonic cues; `exit()` tears the subtree down.
 */
export class AutoMapsIN {
  readonly lighting = new DynamicLighting();
  readonly occlusion = new OcclusionPolicy();
  readonly camera = new CameraTransitions();
  readonly sonic?: SonicVoiceTiming;

  private continuity: BoroughContinuity;
  private nodeIds: string[] = [];
  private active = false;

  constructor(private readonly opts: AutoMapsINOptions) {
    this.continuity = new BoroughContinuity(opts.boroughs);
    if (opts.audio) this.sonic = new SonicVoiceTiming(opts.audio);
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  /** Build the immersive corridor for a route polyline and enter follow mode. */
  enter(routePath: GeoCoord[], lanes: LaneSpec[] = []): void {
    this.clearNodes();
    this.active = true;

    const corridor = buildCorridorMesh(
      routePath,
      this.opts.origin,
      this.opts.corridorWidthM ?? 10,
      this.opts.corridorHeightM ?? 6
    );
    this.place(corridor, CORRIDOR_MAT, ['in', 'corridor']);

    for (const lane of lanes) {
      const rail = buildLaneRail(routePath, lane, this.opts.origin);
      this.place(rail, RAIL_MAT, ['in', 'lane-rail', `lane-${lane.index}`]);
    }

    this.camera.to('enter');
    void this.fire('corridor-enter', 0.5);
  }

  /** Add a roundabout disc at a centre point along the route. */
  addRoundabout(center: GeoCoord): void {
    const disc = buildRoundaboutDisc(center, this.opts.origin);
    this.place(disc, JUNCTION_MAT, ['in', 'roundabout']);
  }

  /** Add a volumetric junction over a footprint. */
  addJunction(footprint: GeoCoord[]): void {
    const vol = buildJunctionVolume(footprint, this.opts.origin);
    this.place(vol, JUNCTION_MAT, ['in', 'junction']);
  }

  exit(): void {
    this.camera.to('exit');
    this.clearNodes();
    this.active = false;
  }

  // ─── per-frame ──────────────────────────────────────────────────────────

  /**
   * Advance presentation. `junctionProximity` 0..1 brightens the highlight and
   * flips the camera into junction phase; `currentBoroughId` drives continuity.
   */
  update(
    dt: number,
    junctionProximity: number,
    currentBoroughId?: string
  ): { phase: CameraPhase; crossing: BoroughCrossing | null } {
    if (!this.active) return { phase: this.camera.current(), crossing: null };

    this.lighting.setMode(this.modeHint);
    this.lighting.setJunctionProximity(junctionProximity);
    this.lighting.update(dt);

    const crossing = this.continuity.advance(currentBoroughId);

    let phase = this.camera.current();
    if (junctionProximity > 0.8 && phase !== 'junction') {
      phase = this.camera.to('junction').to;
      void this.fire('junction-approach', 1.2);
    } else if (junctionProximity < 0.3 && phase === 'junction') {
      phase = this.camera.to('follow').to;
    }
    return { phase, crossing };
  }

  isActive(): boolean {
    return this.active;
  }

  private modeHint: 'day' | 'dusk' | 'night' = 'day';
  setMode(mode: 'day' | 'dusk' | 'night'): void {
    this.modeHint = mode;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private place(mesh: NativeMesh, material: Material, tags: string[]): void {
    const id = this.opts.gpu.placeMesh(mesh, material, { layer: 3, tags });
    this.nodeIds.push(id);
  }

  private clearNodes(): void {
    for (const id of this.nodeIds) this.opts.gpu.remove(id);
    this.nodeIds = [];
  }

  private fire(event: SonicEvent, untilVisualSeconds: number): Promise<void> {
    if (!this.sonic) return Promise.resolve();
    return this.sonic.cue({ event, line: `nav.${event}` }, untilVisualSeconds);
  }
}
