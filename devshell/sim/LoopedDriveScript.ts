/**
 * Looped drive — the default simulation, and the behaviour DevShell shipped
 * with. A vehicle circles a closed loop around the boot origin, cycling
 * cruise → slowing → stopped → accelerating.
 *
 * Always-IN is left to the live engine (`scriptedIN()` returns null), so this
 * mode exercises the real state machine against simulated geometry.
 */

import { SimulatedSensorFeed } from '../src/SimulatedSensorFeed';
import { buildLoop } from '../src/SimulatedRoute';
import type { DevShellConfig } from './config';
import type {
  DevShellImuSample,
  DevShellINState,
  DevShellPosition,
  DevShellSample,
  SimulationScript
} from './types';

export class LoopedDriveScript implements SimulationScript {
  readonly mode = 'looped' as const;
  readonly name = 'Looped drive';
  readonly deterministic = true;

  private feed: SimulatedSensorFeed;
  private readonly loop: [number, number][];

  constructor(
    private readonly origin: DevShellPosition,
    private readonly config: DevShellConfig
  ) {
    this.loop = buildLoop(origin, config.loopSizeM);
    this.feed = this.build();
  }

  advance(dtSeconds: number): DevShellSample {
    return this.feed.advance(dtSeconds);
  }

  imu(): DevShellImuSample {
    return this.feed.imu();
  }

  /** Null → the live Always-IN engine decides. */
  scriptedIN(): DevShellINState | null {
    return null;
  }

  corridor(): [number, number][] {
    return this.loop;
  }

  reset(): void {
    this.feed = this.build();
  }

  private build(): SimulatedSensorFeed {
    return new SimulatedSensorFeed(this.origin, {
      route: this.loop,
      speedMps: this.config.speedMps,
      accuracyM: this.config.accuracyM,
      updateRateHz: this.config.updateRateHz,
      seed: this.config.seed
    });
  }
}
