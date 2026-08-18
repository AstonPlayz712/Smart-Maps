/**
 * Static pose — a fixed position that never moves. For UI debugging: layout,
 * card states, the Live State panel, theming, screenshots.
 *
 * Emits the full telemetry shape at the configured rate so nothing downstream
 * has to special-case it; only the values stop changing. Always-IN is pinned to
 * OFF because nothing is travelling.
 */

import type { DevShellConfig } from './config';
import type {
  DevShellImuSample,
  DevShellINState,
  DevShellMotionState,
  DevShellPosition,
  DevShellSample,
  SimulationScript
} from './types';

export class StaticPoseScript implements SimulationScript {
  readonly mode = 'static' as const;
  readonly name = 'Static pose';
  readonly deterministic = true;

  private readonly position: DevShellPosition;
  private readonly headingDeg: number;
  private readonly motionState: DevShellMotionState;

  constructor(origin: DevShellPosition, private readonly config: DevShellConfig) {
    const pose = config.staticPose ?? {};
    this.position = pose.position ?? origin;
    this.headingDeg = pose.headingDeg ?? 0;
    this.motionState = pose.motionState ?? 'still';
  }

  advance(_dtSeconds: number): DevShellSample {
    return {
      position: { ...this.position },
      accuracyM: this.config.accuracyM,
      motionState: this.motionState,
      // A parked vehicle with a clean fix is a high-confidence state.
      confidence: this.motionState === 'unknown' ? 0 : 0.95,
      headingDeg: this.headingDeg,
      speedMps: this.motionState === 'still' ? 0 : this.config.speedMps,
      updateRateHz: this.config.updateRateHz,
      timestampMs: Date.now(),
      simulated: true
    };
  }

  imu(): DevShellImuSample {
    return { accelMagnitude: 0.01, gyroMagnitude: 0.004, timestampMs: Date.now() };
  }

  /** Pinned: nothing is moving, so Always-IN stays off. */
  scriptedIN(): DevShellINState {
    return 'OFF';
  }

  corridor(): [number, number][] {
    return [];
  }

  reset(): void {
    /* nothing to reset — the pose is constant by definition */
  }
}
