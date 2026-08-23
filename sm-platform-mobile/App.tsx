/**
 * Mobile shell for the Smart-Maps Dynamic Spatial Engine.
 *
 * The counterpart to `sm-platform-web/main.ts`, and deliberately its mirror
 * image: it owns nothing spatial, and makes the same three engine calls —
 * `init`, `updatePosition`, `renderFrame` — with the same sample shapes. Feed
 * both shells the same trace and they produce the same state.
 *
 * The shipping iOS and Android apps in `native/` are Swift and Kotlin, so the
 * host supplies the two things a native platform owns and this file cannot
 * fabricate:
 *
 *   `surface`    the draw target (Metal/SceneKit on iOS, Zante on Android)
 *   `subscribe`  the platform's fused GNSS + IMU stream
 *
 * That keeps this file free of any React Native import, so it compiles and
 * typechecks in the same pass as the rest of the engine.
 */

import { useEffect, useRef, useState } from 'react';
import { DSE } from 'sm-core';
import type { DseState, GnssSample, ImuSample, RenderSurface } from 'sm-core';

export type SampleListener = (gnss: GnssSample, imu: ImuSample) => void;

export interface SmartMapsAppProps {
  /** Draw surface owned by the native shell. */
  surface: RenderSurface;
  /** Subscribe to the platform sensor stream; returns an unsubscribe function. */
  subscribe: (listener: SampleListener) => () => void;
  /** Schedule repeating frames; returns a cancel function. Defaults to rAF. */
  scheduleFrames?: (draw: () => void) => () => void;
  /** Tile root. Relative by default — a packaged app serves tiles locally. */
  tileBaseUrl?: string;
  maxSourceZoom?: number;
  /** Venue to enter on start, for an indoor session. */
  venueId?: string;
  /** Called with a fresh snapshot on every sample, for the host's own UI. */
  onState?: (state: DseState) => void;
}

/**
 * Drives the engine for the lifetime of the component.
 *
 * Renders nothing: the native shell owns the view hierarchy, and the engine
 * draws through `surface`. Returning null keeps this file a driver rather than
 * a second, competing UI.
 */
export function App(props: SmartMapsAppProps): null {
  const { surface, subscribe, scheduleFrames, tileBaseUrl, maxSourceZoom, venueId, onState } = props;
  const dseRef = useRef<DSE | null>(null);
  const [, setReady] = useState(false);

  // Keep the callback in a ref so a host re-rendering with a new closure does
  // not tear the engine down and lose its state.
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let cancelFrames: (() => void) | null = null;

    const dse = new DSE({ surface, tileBaseUrl, maxSourceZoom });
    dseRef.current = dse;

    void (async () => {
      await dse.init();
      if (disposed) return;
      if (venueId) await dse.enterVenue(venueId);
      if (disposed) return;
      setReady(true);

      unsubscribe = subscribe((gnss, imu) => {
        dse.updatePosition(gnss, imu);
        onStateRef.current?.(dse.getState());
      });

      const draw = () => dse.renderFrame();
      cancelFrames = (scheduleFrames ?? defaultScheduler)(draw);
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
      cancelFrames?.();
      dse.dispose();
      dseRef.current = null;
    };
  }, [surface, subscribe, scheduleFrames, tileBaseUrl, maxSourceZoom, venueId]);

  return null;
}

/**
 * Frame scheduling, in order of preference: the host's own scheduler, then
 * requestAnimationFrame, then a 60 Hz timer. A native shell that drives its own
 * display link should pass `scheduleFrames` and skip all of this.
 */
function defaultScheduler(draw: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    let handle = requestAnimationFrame(function tick() {
      draw();
      handle = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(handle);
  }
  const timer: ReturnType<typeof setInterval> = setInterval(draw, 16);
  return () => clearInterval(timer);
}

export default App;
