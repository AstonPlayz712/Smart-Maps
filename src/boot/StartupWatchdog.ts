import { recordBootCrash } from './SafeMode';

let installed = false;
let bootCompletedAt = 0;

/**
 * Catches unhandled errors / promise rejections that happen *during boot*.
 *
 * Boot crashes increment the persisted crash counter; after two
 * back-to-back boot crashes the next reload comes up in Safe Mode (see
 * `recordBootCrash`).
 *
 * Errors after `markBootComplete()` are logged but don't escalate — they're
 * runtime crashes, not a boot loop.
 */
export function installStartupWatchdog(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const handler = (kind: 'error' | 'promise', err: unknown) => {
    if (bootCompletedAt > 0) {
      console.error(`[watchdog/${kind}]`, err);
      return;
    }
    const count = recordBootCrash();
    console.error(`[watchdog/${kind}] boot crash #${count}`, err);
  };

  window.addEventListener('error', (e) => handler('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => handler('promise', e.reason));
}

export function markBootComplete(): void {
  bootCompletedAt = Date.now();
}

export function isBootComplete(): boolean {
  return bootCompletedAt > 0;
}
