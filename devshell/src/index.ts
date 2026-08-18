/**
 * DevShell — Smart Maps' simulated runtime for Windows and any other
 * non-native host.
 *
 * When `isNativeCoreAvailable()` is false, the app boots against these
 * simulated providers instead of GNSS/IMU hardware. The emitted telemetry
 * matches the native providers field for field (position, accuracy, motion
 * state, confidence, heading, update rate), so no consumer needs a DevShell
 * code path of its own.
 *
 * The iOS and Android native builds never import this module.
 */

export { isNativeCoreAvailable, detectEnvironment } from './env';
export type { SMEnvironment, SMHost } from './env';

export { SimulatedSensorFeed } from './SimulatedSensorFeed';
export { SimulatedLocationProvider } from './SimulatedLocationProvider';
export { SimulatedRoute, buildLoop } from './SimulatedRoute';
export { DevShellRuntime } from './DevShellRuntime';
export type { DevShellEgo, DevShellStatus } from './DevShellRuntime';

export type {
  DevShellImuSample,
  DevShellMotionState,
  DevShellOptions,
  DevShellPosition,
  DevShellSample
} from './types';
