/**
 * The Smart-Maps web app.
 *
 * This is a *shell*: it owns a canvas, picks a sample source, and drives a
 * frame loop. Every spatial decision belongs to the engine, which is why the
 * whole file amounts to three calls — `init`, `updatePosition`, `renderFrame`.
 *
 * There is no bootloader, no watchdog, no deadline and no failure screen. The
 * engine has no start-up phase to fail: `init()` wires its modules and
 * resolves, and from that point every call is answerable. A tile that has not
 * loaded or a fix that has not landed is missing data, not a broken app, and
 * the map keeps drawing around it.
 *
 * `sm-platform-mobile/App.tsx` makes the same three calls with the same sample
 * shapes, so the two platforms derive identical state from identical traces.
 */

import { DSE } from 'sm-core';
import { Canvas2DBackend } from 'sm-core/renderer';
import { createSampleSource, type SampleSource } from './sensors';
import { createHud } from './hud';

export interface WebShellOptions {
  /** Canvas to draw into. Looked up as `#sm-canvas` when omitted. */
  canvas?: HTMLCanvasElement;
  /** Tile root. Relative by default, which is what a packaged WebView needs. */
  tileBaseUrl?: string;
  /** Deepest zoom the tile source publishes; deeper requests overzoom. */
  maxSourceZoom?: number;
  /** Venue to enter on start, for an indoor session. */
  venueId?: string;
  /** Override where samples come from. Defaults to hardware, then simulation. */
  source?: SampleSource;
  dark?: boolean;
}

export interface WebShell {
  readonly dse: DSE;
  readonly source: SampleSource;
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
    // debugMode is omitted on purpose. It defaults to false, and the shell
    // exposes no way to turn it on — internal layers are a development tool,
    // not a user-facing control.
  });

  await dse.init();
  if (options.venueId) await dse.enterVenue(options.venueId);

  const hud = createHud();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    backend.resize(rect.width, rect.height);
    dse.renderFrame();
  };
  resize();
  window.addEventListener('resize', resize);

  const source = options.source ?? createSampleSource();
  source.start((gnss, imu) => {
    dse.updatePosition(gnss, imu);
    hud.update(dse.getState());
  });

  let raf = requestAnimationFrame(function frame() {
    dse.renderFrame();
    raf = requestAnimationFrame(frame);
  });

  return {
    dse,
    source,
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      source.stop();
      dse.dispose();
    }
  };
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Auto-start when this module is the page's entry and the shell markup is
 * present. Importing it from a test or another host does nothing, because the
 * canvas will not be there.
 */
function autoStart(): void {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('sm-canvas')) return;
  void startSmartMaps({ maxSourceZoom: 16 }).catch((err) => {
    // Nothing here is recoverable by the user, so there is no recovery screen
    // to show them: a shell that cannot find its own canvas is a build error.
    console.error('[sm-platform-web] shell failed to start', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoStart, { once: true });
} else {
  autoStart();
}
