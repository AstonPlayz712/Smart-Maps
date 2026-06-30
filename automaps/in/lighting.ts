// automaps/in/lighting.ts
//
// AutoMaps IN presentation: dynamic lighting, occlusion, and camera
// transitions. These shape *how* the immersive corridor reads as the driver
// moves — brightening the active lane, dimming occluded geometry, and easing
// the camera between free / follow / junction states.

import type { Vec3, StyleMode } from '../../core/zante/native/types';

export interface LightingState {
  /** Direction the key light comes from (sun/streetlights blend). */
  keyDirection: Vec3;
  keyIntensity: number;
  ambient: number;
  /** Glow strength on the active junction/exit, 0..1. */
  highlight: number;
  fogDensity: number;
}

const MODE_BASE: Record<StyleMode, LightingState> = {
  day: { keyDirection: [-0.3, -1, -0.4], keyIntensity: 1.0, ambient: 0.5, highlight: 0.4, fogDensity: 0.02 },
  dusk: { keyDirection: [-0.6, -0.4, -0.3], keyIntensity: 0.6, ambient: 0.35, highlight: 0.6, fogDensity: 0.05 },
  night: { keyDirection: [0, -1, 0], keyIntensity: 0.25, ambient: 0.18, highlight: 0.9, fogDensity: 0.08 }
};

/** Lighting rig that interpolates toward the target mode each frame. */
export class DynamicLighting {
  private state: LightingState = MODE_BASE.day;

  setMode(mode: StyleMode): void {
    this.target = MODE_BASE[mode];
  }
  private target: LightingState = MODE_BASE.day;

  /** Raise the highlight as the driver nears a junction (0..1 proximity). */
  setJunctionProximity(p: number): void {
    this.target = { ...this.target, highlight: Math.max(this.target.highlight, p) };
  }

  update(dt: number): LightingState {
    const k = Math.min(1, dt * 3);
    this.state = {
      keyDirection: lerp3(this.state.keyDirection, this.target.keyDirection, k),
      keyIntensity: lerp(this.state.keyIntensity, this.target.keyIntensity, k),
      ambient: lerp(this.state.ambient, this.target.ambient, k),
      highlight: lerp(this.state.highlight, this.target.highlight, k),
      fogDensity: lerp(this.state.fogDensity, this.target.fogDensity, k)
    };
    return this.state;
  }

  current(): LightingState {
    return this.state;
  }
}

/**
 * Occlusion policy — which corridor/building geometry to fade so it never
 * blocks the driver's view of the route ahead. Stage 1 returns a simple
 * distance/height rule the renderer applies as alpha.
 */
export class OcclusionPolicy {
  /** Alpha 0..1 for geometry at `heightM` that is `aheadM` in front of ego. */
  fadeFor(heightM: number, aheadM: number): number {
    if (aheadM < 0) return 1; // behind camera, untouched
    if (heightM > 12 && aheadM < 40) return 0.35; // tall + close → fade
    return 1;
  }
}

export type CameraPhase = 'free' | 'enter' | 'follow' | 'junction' | 'exit';

export interface CameraTransition {
  from: CameraPhase;
  to: CameraPhase;
  durationMs: number;
}

/** Eased phase machine for the IN camera — no bounce, no overshoot. */
export class CameraTransitions {
  private phase: CameraPhase = 'free';

  to(next: CameraPhase): CameraTransition {
    const t: CameraTransition = { from: this.phase, to: next, durationMs: durationFor(this.phase, next) };
    this.phase = next;
    return t;
  }

  current(): CameraPhase {
    return this.phase;
  }
}

function durationFor(from: CameraPhase, to: CameraPhase): number {
  if (to === 'enter') return 1400;
  if (to === 'exit') return 1000;
  if (from === 'follow' && to === 'junction') return 600;
  return 900;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function lerp3(a: Vec3, b: Vec3, k: number): Vec3 {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
