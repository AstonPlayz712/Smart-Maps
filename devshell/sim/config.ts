/**
 * DevShellConfig — selects which simulation drives a DevShell session.
 *
 * Resolution order (first match wins):
 *   1. an explicit object passed to `resolveDevShellConfig()`
 *   2. `window.__SM_DEVSHELL_CONFIG__`      (set before the app boots)
 *   3. `?devshell=looped|path|static|chaotic` in the URL
 *   4. the built-in default — looped drive, i.e. previous behaviour
 *
 * Windows/web only. Native builds never read this.
 */

import type { DevShellMode, DevShellPosition, JourneyScript } from './types';

export interface DevShellConfig {
  /** Which simulation to run. */
  mode: DevShellMode;
  /** Emission rate for the simulated feeds, Hz. */
  updateRateHz: number;
  /** Cruise speed where the mode doesn't specify one, m/s. */
  speedMps: number;
  /** Baseline horizontal accuracy, metres. */
  accuracyM: number;
  /** Seed for deterministic noise. */
  seed: number;
  /** Loop size for the default looped drive, metres. */
  loopSizeM: number;
  /** Journey used by `mode: 'path'`. Defaults to the sample journey. */
  journey?: JourneyScript;
  /** Fixed pose used by `mode: 'static'`. Defaults to the boot origin. */
  staticPose?: {
    position?: DevShellPosition;
    headingDeg?: number;
    /** Static mode normally reports 'still'; override for UI states. */
    motionState?: 'still' | 'walking' | 'driving' | 'unknown';
  };
  /** Extra turbulence for `mode: 'chaotic'`, 0…1. */
  chaos: number;
}

export const DEFAULT_DEVSHELL_CONFIG: DevShellConfig = {
  mode: 'looped',
  updateRateHz: 10,
  speedMps: 12,
  accuracyM: 6,
  seed: 0x5eed,
  loopSizeM: 250,
  chaos: 0.6
};

declare global {
  interface Window {
    /** Optional DevShell overrides, set before the app boots. */
    __SM_DEVSHELL_CONFIG__?: Partial<DevShellConfig>;
  }
}

const MODES: DevShellMode[] = ['looped', 'path', 'static', 'chaotic'];

function isMode(value: unknown): value is DevShellMode {
  return typeof value === 'string' && (MODES as string[]).includes(value);
}

/** Merge the layered sources into one config. Never throws. */
export function resolveDevShellConfig(
  overrides: Partial<DevShellConfig> = {}
): DevShellConfig {
  const fromWindow: Partial<DevShellConfig> =
    typeof window !== 'undefined' && window.__SM_DEVSHELL_CONFIG__
      ? window.__SM_DEVSHELL_CONFIG__
      : {};

  let fromQuery: Partial<DevShellConfig> = {};
  if (typeof window !== 'undefined' && typeof window.location?.search === 'string') {
    try {
      const requested = new URLSearchParams(window.location.search).get('devshell');
      if (isMode(requested)) fromQuery = { mode: requested };
    } catch {
      // A malformed query string must never stop the app booting.
    }
  }

  const merged: DevShellConfig = {
    ...DEFAULT_DEVSHELL_CONFIG,
    ...fromQuery,
    ...fromWindow,
    ...overrides
  };

  // Clamp anything a caller could get wrong, so a bad config degrades rather
  // than producing a dead simulation.
  return {
    ...merged,
    mode: isMode(merged.mode) ? merged.mode : DEFAULT_DEVSHELL_CONFIG.mode,
    updateRateHz: clamp(merged.updateRateHz, 1, 60),
    speedMps: clamp(merged.speedMps, 0, 90),
    accuracyM: clamp(merged.accuracyM, 0.5, 500),
    loopSizeM: clamp(merged.loopSizeM, 40, 20000),
    chaos: clamp(merged.chaos, 0, 1)
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;
