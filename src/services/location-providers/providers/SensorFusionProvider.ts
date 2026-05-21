import { BaseLocationProvider } from '../BaseLocationProvider';
import type { ProviderId } from '../types';

const VELOCITY_DAMPING = 0.85;
const ACCURACY_GROWTH_PER_FIX = 0.5;
const SEED_ACCURACY = 50;

/**
 * Sensor-fusion dead reckoning. Uses the device's accelerometer (motion) and
 * compass (orientation alpha) to extrapolate position when no absolute fix is
 * available. The provider has no anchor of its own — it must be *seeded* with
 * an absolute fix from another provider, then it integrates motion to keep
 * the position alive while the other providers are dark.
 *
 * Accuracy degrades over time (drift compounds quickly on phone IMUs), so this
 * is a stopgap, not a primary source. The facade re-seeds the provider every
 * time any other provider produces a fresh fix.
 */
export class SensorFusionProvider extends BaseLocationProvider {
  readonly id: ProviderId = 'sensor-fusion';
  readonly name = 'Sensor Fusion';

  private heading = 0;
  private velX = 0; // east-axis m/s
  private velY = 0; // north-axis m/s
  private lastMotionAt = 0;
  private currentAccuracy = SEED_ACCURACY;

  private orientHandler?: (e: DeviceOrientationEvent) => void;
  private motionHandler?: (e: DeviceMotionEvent) => void;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /**
   * Anchor the dead reckoning to a fresh absolute fix. Called by the facade
   * whenever a non-sensor-fusion fix lands.
   */
  seed(lat: number, lng: number, accuracy?: number): void {
    this.currentAccuracy = accuracy ?? SEED_ACCURACY;
    this.velX = 0;
    this.velY = 0;
    this.publish({
      lat,
      lng,
      accuracy: this.currentAccuracy,
      heading: this.heading,
      source: this.id,
      timestamp: Date.now()
    });
  }

  start(): void {
    if (this.active || !this.isAvailable()) return;
    this.active = true;

    this.orientHandler = (e) => {
      if (e.alpha !== null) {
        // alpha is 0..360, increasing counter-clockwise; convert to compass clockwise-from-north
        this.heading = (360 - e.alpha) % 360;
      }
    };
    window.addEventListener('deviceorientation', this.orientHandler);

    this.motionHandler = (e) => this.handleMotion(e);
    window.addEventListener('devicemotion', this.motionHandler);
  }

  stop(): void {
    if (this.orientHandler) window.removeEventListener('deviceorientation', this.orientHandler);
    if (this.motionHandler) window.removeEventListener('devicemotion', this.motionHandler);
    this.orientHandler = undefined;
    this.motionHandler = undefined;
    this.velX = 0;
    this.velY = 0;
    this.lastMotionAt = 0;
    this.active = false;
  }

  private handleMotion(e: DeviceMotionEvent): void {
    const now = performance.now();
    const dt = this.lastMotionAt ? (now - this.lastMotionAt) / 1000 : 0;
    this.lastMotionAt = now;
    if (!e.acceleration || dt <= 0 || !this.lastFix) return;

    const ax = e.acceleration.x ?? 0;
    const ay = e.acceleration.y ?? 0;

    // Crude integration with damping to keep stationary noise from drifting.
    this.velX = (this.velX + ax * dt) * VELOCITY_DAMPING;
    this.velY = (this.velY + ay * dt) * VELOCITY_DAMPING;
    const speedMps = Math.hypot(this.velX, this.velY);

    const headingRad = (this.heading * Math.PI) / 180;
    const dxEast = Math.sin(headingRad) * speedMps * dt;
    const dyNorth = Math.cos(headingRad) * speedMps * dt;

    // Meters → lat/lng. Roughly 111,111 m per degree of latitude, scaled by cos(lat) for lng.
    const dLat = dyNorth / 111111;
    const dLng = dxEast / (111111 * Math.cos((this.lastFix.lat * Math.PI) / 180));

    this.currentAccuracy = (this.lastFix.accuracy ?? SEED_ACCURACY) + ACCURACY_GROWTH_PER_FIX;

    this.publish({
      lat: this.lastFix.lat + dLat,
      lng: this.lastFix.lng + dLng,
      accuracy: this.currentAccuracy,
      heading: this.heading,
      speed: speedMps,
      source: this.id,
      timestamp: Date.now()
    });
  }
}
