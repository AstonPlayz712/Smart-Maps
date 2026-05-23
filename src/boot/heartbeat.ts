/**
 * Bootstrap heartbeat hand-off.
 *
 * The inline script in index.html sets `window.__SM_BOOT_*` flags and a
 * deadline timer that fires a Safe-Mode-style fallback after 8 s. Once the
 * React app has mounted and the engine is alive, call `signalBootOk()` to
 * clear the deadline and fade the overlay.
 */

declare global {
  interface Window {
    __SM_BOOT_START__?: number;
    __SM_BOOT_OK__?: boolean;
    __SM_BOOT_DEADLINE__?: number;
  }
}

export function signalBootOk(): void {
  if (typeof window === 'undefined') return;
  window.__SM_BOOT_OK__ = true;
  if (window.__SM_BOOT_DEADLINE__ !== undefined) {
    window.clearTimeout(window.__SM_BOOT_DEADLINE__);
    window.__SM_BOOT_DEADLINE__ = undefined;
  }
  const boot = document.getElementById('sm-boot');
  if (boot) {
    boot.classList.add('sm-boot-hidden');
    window.setTimeout(() => {
      boot.parentNode?.removeChild(boot);
    }, 240);
  }
}

export function bootMillis(): number {
  if (typeof window === 'undefined' || !window.__SM_BOOT_START__) return 0;
  return Date.now() - window.__SM_BOOT_START__;
}
