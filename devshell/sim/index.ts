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
import { IndoorJourneyScriptRunner } from './IndoorJourneyScriptRunner';
import { INDOOR_JOURNEY } from './journeys/indoorJourney';
import { SAMPLE_JOURNEY } from './journeys/sampleJourney';
import type { DevShellPosition, SimulationScript } from './types';

export { resolveDevShellConfig, DEFAULT_DEVSHELL_CONFIG };
export type { DevShellConfig };
export { LoopedDriveScript, PathPlaybackScript, StaticPoseScript, ChaoticScript, IndoorJourneyScriptRunner };
export { SAMPLE_JOURNEY };
export { INDOOR_JOURNEY };
export type {
  DevShellINState,
  DevShellMode,
  GnssPathPoint,
  INPhase,
  IndoorJourneyScript,
  IndoorPhase,
  JourneyScript,
  MotionPhase,
  SimulationScript,
  VerticalConnector
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
    case 'indoor':
      return new IndoorJourneyScriptRunner(config.indoorJourney ?? INDOOR_JOURNEY, config);
    case 'looped':
    default:
      return new LoopedDriveScript(origin, config);
  }
}
