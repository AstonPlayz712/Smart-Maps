/**
 * Self-contained SmartMapsAE v2 demo.
 *
 * Runs SM's own renderer against the bundled map fixtures, driven by the
 * DevShell indoor simulation. No external hosts, no third-party map library —
 * everything here is the engine built in this branch.
 */

import { MapRenderer } from '../src/map/MapRenderer';
import { TileSource } from '../src/map/TileSource';
import { Canvas2DBackend } from '../src/map/backends/Canvas2DBackend';
import { DevShellRuntime } from '../devshell/src/DevShellRuntime';
import { motionLabel, floorLabel, verticalLabel } from '../src/live/LiveStatePanel';
import { RoutingEngine } from '../src/routing/RoutingEngine';
import type { IndoorVenue } from '../src/map/types';

declare global {
  interface Window {
    __SM_FIXTURES__: Record<string, unknown>;
  }
}

/** Serve the inlined fixtures instead of hitting the network. */
function fixtureFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const key = url.replace(/^.*\/maps\//, '');
  const payload = window.__SM_FIXTURES__[key];
  if (!payload) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  return Promise.resolve(
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  );
}

const VENUE_ORIGIN = { lng: -0.1281, lat: 51.5071 };

async function boot() {
  const canvas = document.getElementById('sm-canvas') as HTMLCanvasElement;
  const stage = canvas.parentElement as HTMLElement;

  // Fixtures are published at z16; the camera sits deeper, so overzoom
  // serves the covering parent tile rather than blanking the map.
  const tiles = new TileSource({ fetchImpl: fixtureFetch as typeof fetch, maxSourceZoom: 16 });
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const backend = new Canvas2DBackend(canvas, dark);
  const renderer = new MapRenderer({ tiles, backend, tileRadius: 1, buildings3D: true });

  const sizeCanvas = () => {
    backend.resize(stage.clientWidth, stage.clientHeight);
    void renderer.render();
  };
  window.addEventListener('resize', sizeCanvas);
  sizeCanvas();

  await renderer.enterVenue('sm-atrium', 0);

  // Multi-floor route through the venue, shown in the panel.
  const venue = window.__SM_FIXTURES__['indoors/sm-atrium.json'] as IndoorVenue;
  const routing = new RoutingEngine();
  routing.loadVenue(venue);
  const plan = routing.route({
    from: venue.floors[0].walkNodes![0].position,
    fromFloor: 0,
    to: venue.floors[2].walkNodes![2].position,
    toFloor: 2
  });

  // DevShell drives the whole thing — the same simulation CI verifies.
  const sm = new DevShellRuntime(VENUE_ORIGIN, { mode: 'indoor', updateRateHz: 20 });
  sm.start();

  const el = (id: string) => document.getElementById(id)!;
  el('sm-route').textContent = plan
    ? plan.steps.map((s) => s.instruction).join('  →  ')
    : 'no route';

  // Internal engine layers stay off. debugMode is a development flag, not a
  // user-facing control — there is deliberately no UI affordance to enable it.

  const tick = () => {
    const position = sm.getPosition();
    const ego = sm.getEgo();
    const status = sm.status();

    renderer.setPosition(position, ego ?? null);
    renderer.syncFloor(position.floorLevel);
    renderer.setCamera({
      center: { lng: position.lng, lat: position.lat },
      zoom: 17.6,
      bearingDeg: 0
    });
    void renderer.render();

    el('sm-pos').textContent = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    el('sm-acc').textContent = `±${position.accuracyM.toFixed(1)} m`;
    el('sm-motion').textContent = motionLabel(
      status.sample?.motionState === 'driving' ? 'driving'
        : status.sample?.motionState === 'walking' ? 'walking'
        : status.sample?.motionState === 'still' ? 'still' : 'unknown',
      position,
      status.sample?.confidence ?? 0
    );
    el('sm-floor').textContent = floorLabel(position);
    el('sm-vert').textContent = verticalLabel(position);

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void boot();
