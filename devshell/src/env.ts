/**
 * DevShell environment detection.
 *
 * Smart Maps A/E runs its real engine against native providers — CoreLocation /
 * CoreMotion on iOS, LocationManager / SensorManager on Android. On Windows,
 * Linux, macOS desktop browsers, CI, or any other non-native host, none of
 * that hardware exists, so the boot pipeline would sit waiting for a fix that
 * never arrives.
 *
 * `isNativeCoreAvailable()` is the single check the app uses to decide. When it
 * is false, SM boots in DevShell mode and every hardware feed is served by the
 * simulated providers in this folder.
 *
 * The iOS/Android native paths never call this — they are compiled binaries
 * with real frameworks bound at the adapter layer, and are untouched by
 * DevShell.
 *
 * `DevShellConfig` (which simulation runs, and how) is imported here and
 * re-exported, so callers get the environment check and the simulation
 * selection from one place.
 */

import {
  DEFAULT_DEVSHELL_CONFIG,
  resolveDevShellConfig,
  type DevShellConfig
} from '../sim/config';

export { DEFAULT_DEVSHELL_CONFIG, resolveDevShellConfig };
export type { DevShellConfig };

export type SMHost =
  | 'ios-native'
  | 'android-native'
  | 'browser-desktop'
  | 'browser-mobile'
  | 'headless';

export interface SMEnvironment {
  host: SMHost;
  nativeCore: boolean;
  /** Why the decision went the way it did — surfaced in the DevShell banner. */
  reason: string;
  platform: string;
}

interface NativeCoreBridge {
  /** Present only when a real native SM core is hosting this web view. */
  readonly available?: boolean;
}

declare global {
  interface Window {
    /** Injected by a native host that embeds SM; absent in plain browsers. */
    __SM_NATIVE_CORE__?: NativeCoreBridge;
    /** Manual override for testing DevShell on a native host, and vice versa. */
    __SM_FORCE_DEVSHELL__?: boolean;
  }
}

/**
 * True only when a genuine native SM core is hosting us and the sensor
 * hardware APIs it depends on are actually present.
 */
export function isNativeCoreAvailable(): boolean {
  return detectEnvironment().nativeCore;
}

export function detectEnvironment(): SMEnvironment {
  // No DOM at all (SSR, tests, CI): never native.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      host: 'headless',
      nativeCore: false,
      reason: 'no window/navigator — headless host',
      platform: 'headless'
    };
  }

  const platform = navigator.userAgent || 'unknown';

  // Explicit override always wins: __SM_FORCE_DEVSHELL__ forces
  // isNativeCoreAvailable() to false, so DevShell can be exercised anywhere —
  // including on a device that does have a native core.
  if (window.__SM_FORCE_DEVSHELL__ === true) {
    return {
      host: hostFromUserAgent(platform),
      nativeCore: false,
      reason: 'forced by __SM_FORCE_DEVSHELL__',
      platform
    };
  }

  // A native host injects this bridge. A browser never has it.
  //
  // Platform rule: iOS/Android native core -> true (they use real GNSS + IMU +
  // Always-IN); every browser -> false (DevShell simulation). The bridge is
  // the only thing that can return true, so a web build cannot accidentally
  // claim a native core just because it runs on a phone.
  const bridge = window.__SM_NATIVE_CORE__;
  if (bridge?.available === true) {
    const host = hostFromUserAgent(platform);
    return {
      host: host === 'browser-mobile' ? nativeHostFor(platform) : host,
      nativeCore: true,
      reason: 'native SM core bridge present',
      platform
    };
  }

  // No bridge: decide from the hardware APIs the engine actually needs.
  // Desktop browsers (Windows/macOS/Linux) have no motion sensors and their
  // geolocation is Wi-Fi/IP derived at best — not a navigation-grade feed.
  const hasMotion = 'DeviceMotionEvent' in window;
  const hasGeo = typeof navigator.geolocation !== 'undefined';
  const host = hostFromUserAgent(platform);

  if (host === 'browser-desktop') {
    return {
      host,
      nativeCore: false,
      reason: 'desktop browser — no navigation-grade sensor hardware',
      platform
    };
  }

  if (!hasMotion || !hasGeo) {
    return {
      host,
      nativeCore: false,
      reason: `missing sensor APIs (motion=${hasMotion}, geolocation=${hasGeo})`,
      platform
    };
  }

  // A mobile browser has the APIs but is still not the native core — SM's
  // native engine only exists inside the iOS/Android apps.
  return {
    host,
    nativeCore: false,
    reason: 'mobile browser — sensor APIs present but no native SM core',
    platform
  };
}

/** Which native host we are embedded in, once the bridge has confirmed one. */
function nativeHostFor(ua: string): SMHost {
  return /iphone|ipad|ipod/i.test(ua) ? 'ios-native' : 'android-native';
}

function hostFromUserAgent(ua: string): SMHost {
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'browser-mobile';
  if (/android/.test(s)) return 'browser-mobile';
  if (/windows|macintosh|linux|cros/.test(s)) return 'browser-desktop';
  return 'browser-desktop';
}
