/**
 * DevShell simulation registry.
 *
 * `createSimulation()` turns a resolved `DevShellConfig` into the script that
 * drives the session. Add a mode by implementing `SimulationScript` and wiring
 * it in here.
 *
 * Windows/web only — nothing under `native/` imports this.
 */

import { resolveDevShellConfig, DEFAULT_DEVSHELL_CONFIG } from './config';
import type { DevShellConfig } from './config';
import { LoopedDriveScript } from './LoopedDriveScript';
import { PathPlaybackScript } from './PathPlaybackScript';
import { StaticPoseScript } from './StaticPoseScript';
import { ChaoticScript } from './ChaoticScript';
import { SAMPLE_JOURNEY } from './journeys/sampleJourney';
import type { DevShellPosition, SimulationScript } from './types';

export { resolveDevShellConfig, DEFAULT_DEVSHELL_CONFIG };
export type { DevShellConfig };
export { LoopedDriveScript, PathPlaybackScript, StaticPoseScript, ChaoticScript };
export { SAMPLE_JOURNEY };
export type {
  DevShellINState,
  DevShellMode,
  GnssPathPoint,
  INPhase,
  JourneyScript,
  MotionPhase,
  SimulationScript
} from './types';

/** Build the simulation for a config. Falls back to the looped drive. */
export function createSimulation(
  origin: DevShellPosition,
  config: DevShellConfig
): SimulationScript {
  switch (config.mode) {
    case 'path':
      return new PathPlaybackScript(config.journey ?? SAMPLE_JOURNEY, config);
    case 'static':
      return new StaticPoseScript(origin, config);
    case 'chaotic':
      return new ChaoticScript(origin, config);
    case 'looped':
    default:
      return new LoopedDriveScript(origin, config);
  }
}
