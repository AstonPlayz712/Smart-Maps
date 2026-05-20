import type { Map as MlMap } from 'maplibre-gl';
import type { CameraPose } from '../../engine/types';
import { easing } from './easing';

export interface FlyOptions {
  duration?: number;
  curve?: number;
  pitch?: number;
  bearing?: number;
  zoom?: number;
}

/**
 * CinematicCamera turns MapLibre's transactional camera API into film-grammar moves:
 * `fly`, `orbit`, `tour`. Every motion is interruptible and cancellable so the user is
 * never trapped in an animation they didn't ask for.
 */
export class CinematicCamera {
  private orbitFrame: number | null = null;
  private tourTimer: number | null = null;

  constructor(private map: MlMap) {}

  fly(pose: Partial<CameraPose> & { center: [number, number] }, opts: FlyOptions = {}): void {
    this.stopOrbit();
    this.map.flyTo({
      center: pose.center,
      zoom: pose.zoom ?? opts.zoom ?? this.map.getZoom(),
      pitch: pose.pitch ?? opts.pitch ?? this.map.getPitch(),
      bearing: pose.bearing ?? opts.bearing ?? this.map.getBearing(),
      duration: opts.duration ?? 2200,
      curve: opts.curve ?? 1.42,
      easing: easing.easeInOutCubic,
      essential: true
    });
  }

  orbit(
    center: [number, number],
    opts: { radiusZoom?: number; pitch?: number; speedDegPerSec?: number } = {}
  ): void {
    this.stopOrbit();
    const zoom = opts.radiusZoom ?? Math.max(this.map.getZoom(), 16);
    const pitch = opts.pitch ?? 68;
    const speed = opts.speedDegPerSec ?? 10;

    this.map.easeTo({ center, zoom, pitch, duration: 1200, easing: easing.easeInOutCubic });

    let bearing = this.map.getBearing();
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      bearing = (bearing + speed * dt) % 360;
      this.map.setBearing(bearing);
      this.orbitFrame = requestAnimationFrame(step);
    };
    this.orbitFrame = requestAnimationFrame(step);
  }

  stopOrbit(): void {
    if (this.orbitFrame !== null) cancelAnimationFrame(this.orbitFrame);
    this.orbitFrame = null;
  }

  tour(poses: CameraPose[], opts: { hold?: number; duration?: number } = {}): void {
    this.stopTour();
    const hold = opts.hold ?? 1400;
    const duration = opts.duration ?? 3200;

    let i = 0;
    const next = () => {
      if (i >= poses.length) {
        this.tourTimer = null;
        return;
      }
      const pose = poses[i++];
      this.fly(pose, { duration, curve: 1.4 });
      this.tourTimer = window.setTimeout(next, duration + hold);
    };
    next();
  }

  stopTour(): void {
    if (this.tourTimer !== null) clearTimeout(this.tourTimer);
    this.tourTimer = null;
  }

  isOrbiting(): boolean {
    return this.orbitFrame !== null;
  }

  isTouring(): boolean {
    return this.tourTimer !== null;
  }

  reset(pose: CameraPose, duration = 1600): void {
    this.stopOrbit();
    this.stopTour();
    this.fly(pose, { duration });
  }
}
