import { signalBootOk } from './heartbeat';
import { clearCrashCount } from './SafeMode';
import { markBootComplete } from './StartupWatchdog';

export { bootMillis, signalBootOk } from './heartbeat';
export {
  isSafeMode,
  enterSafeMode,
  exitSafeMode,
  recordBootCrash,
  clearCrashCount
} from './SafeMode';
export { default as SafeModeScreen } from './SafeModeScreen';
export { installStartupWatchdog, markBootComplete, isBootComplete } from './StartupWatchdog';

/**
 * Single call to fire when the app is up and the engine is alive:
 *   1. Clears the HTML boot heartbeat overlay.
 *   2. Resets the crash counter (we made it this far cleanly).
 *   3. Tells the watchdog to stop counting future errors as boot crashes.
 */
export function markBootReady(): void {
  signalBootOk();
  clearCrashCount();
  markBootComplete();
}
