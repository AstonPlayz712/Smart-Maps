/**
 * Web shell for the Smart-Maps Dynamic Spatial Engine.
 *
 * This file is a *shell*: it owns a canvas, subscribes to the browser's
 * sensors, and drives a frame loop. Every spatial decision belongs to the
 * engine, which is why the whole file amounts to three calls —
 * `init`, `updatePosition`, `renderFrame` — and no engine internals appear
 * anywhere in it.
 *
 * `sm-platform-mobile/App.tsx` makes the same three calls with the same sample
 * shapes, so the two platforms behave identically.
 */

import { DSE } from 'sm-core';
import type { GnssSample, ImuSample } from 'sm-core';
import { Canvas2DBackend } from 'sm-core/renderer';

export interface WebShellOptions {
  /** Canvas to draw into. Looked up as `#sm-canvas` when omitted. */
  canvas?: HTMLCanvasElement;
  /** Tile root. Relative by default, which is what a packaged WebView needs. */
  tileBaseUrl?: string;
  /** Deepest zoom the tile source publishes; deeper requests overzoom. */
  maxSourceZoom?: number;
  /** Venue to enter on start, for an indoor session. */
  venueId?: string;
  dark?: boolean;
}

export interface WebShell {
  readonly dse: DSE;
  stop(): void;
}

/** Start the engine against a canvas. Resolves once the engine is live. */
export async function startSmartMaps(options: WebShellOptions = {}): Promise<WebShell> {
  const canvas =
    options.canvas ?? (document.getElementById('sm-canvas') as HTMLCanvasElement | null);
  if (!canvas) throw new Error('startSmartMaps: no canvas (pass one, or add #sm-canvas)');

  const backend = new Canvas2DBackend(canvas, options.dark ?? prefersDark());
  const dse = new DSE({
    surface: backend,
    tileBaseUrl: options.tileBaseUrl,
    maxSourceZoom: options.maxSourceZoom
  });

  await dse.init();
  if (options.venueId) await dse.enterVenue(options.venueId);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    backend.resize(rect.width, rect.height);
    dse.renderFrame();
  };
  resize();
  window.addEventListener('resize', resize);

  // ── sensors ───────────────────────────────────────────────────────────────
  // The IMU is optional: plenty of browsers expose no motion events at all, and
  // the engine is built to run on GNSS alone. A still sample is the honest
  // stand-in — it claims no motion rather than inventing some.
  let imu: ImuSample = stillSample(Date.now());

  const onMotion = (event: DeviceMotionEvent) => {
    const a = event.acceleration ?? event.accelerationIncludingGravity;
    const r = event.rotationRate;
    imu = {
      accelMagnitude: a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : 0,
      verticalAccel: a?.z ?? 0,
      gyroMagnitude: r ? toRadians(Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0)) : 0,
      timestampMs: Date.now()
    };
  };
  window.addEventListener('devicemotion', onMotion);

  let watchId: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (fix) => dse.updatePosition(toGnssSample(fix), imu),
      // A geolocation error is not a failure state for the engine — it simply
      // means no new fix, and the last one stands.
      (err) => console.warn('[sm-platform-web] geolocation', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15_000 }
    );
  }

  // ── frame loop ────────────────────────────────────────────────────────────
  let raf = 0;
  const frame = () => {
    dse.renderFrame();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    dse,
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('devicemotion', onMotion);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      dse.dispose();
    }
  };
}

function toGnssSample(fix: GeolocationPosition): GnssSample {
  const c = fix.coords;
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracyM: c.accuracy,
    headingDeg: c.heading,
    speedMps: c.speed,
    altitudeM: c.altitude,
    verticalAccuracyM: c.altitudeAccuracy,
    timestampMs: fix.timestamp
  };
}

function stillSample(timestampMs: number): ImuSample {
  return { accelMagnitude: 0, verticalAccel: 0, gyroMagnitude: 0, timestampMs };
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
