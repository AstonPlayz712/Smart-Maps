/**
 * SmartMapsAE map + telemetry + routing smoke test.
 *
 * Asserts the v2 engine behaviours that CI must protect:
 *   1. tile schema round-trips and the tile→lng/lat transform is correct
 *   2. POI alignment (the extent/Mercator fix)
 *   3. accuracy ring: metres→pixels, 80 px clamp, indoor suppression
 *   4. debugMode defaults off and gates all internal layers
 *   5. indoor floor clipping
 *   6. multi-floor routing incl. step-free avoidance
 *   7. telemetry fixes: no "driving" while measured stationary, heading hold,
 *      no vertical drift while static
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'sm-map-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'bundle.mjs');

// Bundle the modules under test through one entry point.
execFileSync('node_modules/.bin/esbuild', [
  '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning',
  'scripts/_map-smoke-entry.ts'
], { stdio: 'inherit' });

const m = await import(out);
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

// ── 1–2. schema + projection ────────────────────────────────────────────────
console.log('\n== Tiles and projection ==');
const poiTile = JSON.parse(readFileSync('public/maps/poi/16/32744/21792.json', 'utf8'));
check('POI fixture parses', poiTile.format === 'sm-poi-tile' && poiTile.pois.length > 0);

const coord = poiTile.coord;
const cafe = poiTile.pois.find((p) => p.id === 'poi-cafe');
const ll = m.tileToLngLat(coord, poiTile.extent, cafe.position[0], cafe.position[1]);
check('POI lands near the tile', Math.abs(ll.lat - 51.5074) < 0.02 && Math.abs(ll.lng + 0.1278) < 0.02,
  `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`);

// Round-trip is the real alignment test: forward then inverse must return the
// original tile-local coordinate.
const back = m.lngLatToTile(coord, poiTile.extent, ll);
const roundTripError = Math.hypot(back[0] - cafe.position[0], back[1] - cafe.position[1]);
check('POI alignment round-trips', roundTripError < 0.5, `error ${roundTripError.toExponential(2)} units`);

// A non-default extent must still align — this is what broke on custom tiles.
const ll8192 = m.tileToLngLat(coord, 8192, 2 * cafe.position[0], 2 * cafe.position[1]);
check('alignment holds at a non-4096 extent',
  Math.abs(ll8192.lat - ll.lat) < 1e-9 && Math.abs(ll8192.lng - ll.lng) < 1e-9);

// ── 3. accuracy ring ────────────────────────────────────────────────────────
console.log('\n== Accuracy ring ==');
const basePos = {
  lat: 51.5074, lng: -0.1278, accuracyM: 12, headingDeg: 0, speedMps: 0,
  floorLevel: null, altitudeM: 0, verticalAccuracyM: 3, verticalMotionState: 'static',
  verticalTransitionConfidence: 0, timestampMs: Date.now(), venueId: null, simulated: true
};
const mpp = m.metresPerPixel(51.5074, 16);
check('metres/pixel is latitude-corrected', mpp > 1.4 && mpp < 1.6, `${mpp.toFixed(3)} m/px @z16`);

const ring = m.resolveAccuracyRing(basePos, 16);
check('12 m renders as a sane ring', ring.radiusPx > 5 && ring.radiusPx < 20, `${ring.radiusPx}px`);
const huge = m.resolveAccuracyRing({ ...basePos, accuracyM: 5000 }, 16);
check('huge accuracy is clamped to 80px', huge.radiusPx === 80 && huge.clamped, `${huge.radiusPx}px`);
const indoors = m.resolveAccuracyRing({ ...basePos, floorLevel: 1, accuracyM: 400, verticalAccuracyM: 3 }, 18);
check('indoors uses vertical accuracy', indoors.kind === 'vertical' && indoors.accuracyM === 3);
check('indoors ignores the huge GNSS radius', indoors.radiusPx < 80, `${indoors.radiusPx}px`);

// ── 4. debugMode gate ───────────────────────────────────────────────────────
console.log('\n== debugMode gate ==');
const defaults = m.DEFAULT_RENDERER_CONFIG;
check('debugMode defaults to false', defaults.debugMode === false);
const layer = new m.InternalDebugLayer();
check('debug layer returns null when off',
  layer.build({ position: basePos, ego: null, inState: 'OFF' }, false) === null);
const dbg = layer.build({ position: basePos, ego: null, inState: 'ACTIVE' }, true);
check('debug layer builds when on', dbg !== null && dbg.readout.length > 0);
// Engine-local coordinates must never escape as map coordinates.
const leaked = layer.build(
  { position: basePos, ego: null, inState: 'OFF', gnssCandidates: [{ lng: 4821.4, lat: 9903.2 }] }, true);
check('engine-local coords are rejected', leaked.gnssCandidates.length === 0);

// ── 5. floor clipping ───────────────────────────────────────────────────────
console.log('\n== Floor clipping ==');
const venue = JSON.parse(readFileSync('public/maps/indoors/sm-atrium.json', 'utf8'));
const indoorLayer = new m.IndoorLayer({ venue: async () => venue });
await indoorLayer.enterVenue('sm-atrium', 1);
check('venue entered on level 1', indoorLayer.currentLevel() === 1);
check('outdoor features always pass', indoorLayer.isOnActiveFloor(undefined) === true);
check('same-floor features pass', indoorLayer.isOnActiveFloor(1) === true);
check('other-floor features are clipped', indoorLayer.isOnActiveFloor(2) === false);
let changes = 0;
indoorLayer.onFloorChange(() => changes++);
indoorLayer.setFloor(2);
check('floor change fires listeners', changes === 1 && indoorLayer.currentLevel() === 2);

// ── 6. multi-floor routing ──────────────────────────────────────────────────
console.log('\n== Multi-floor routing ==');
const engine = new m.RoutingEngine();
engine.loadVenue(venue);
const from = venue.floors[0].walkNodes[0].position;
const to = venue.floors[2].walkNodes[2].position;
const route = engine.route({ from, fromFloor: 0, to, toFloor: 2 });
check('route found across floors', route !== null && route.multiFloor);
check('floor sequence is 0->1->2', route.floorSequence.join('->') === '0->1->2');
check('route uses a vertical connector', route.steps.some((s) => s.kind !== 'walk'));
const stepFree = engine.route({ from, fromFloor: 0, to, toFloor: 2, avoid: ['stairs', 'escalator'] });
check('step-free routing avoids stairs',
  stepFree !== null && !stepFree.steps.some((s) => s.kind === 'stairs' || s.kind === 'escalator'));
const flat = engine.route({ from, fromFloor: 0, to: venue.floors[0].walkNodes[2].position, toFloor: 0 });
check('same-floor route is not multiFloor', flat !== null && flat.multiFloor === false);

// ── 7. telemetry fixes ──────────────────────────────────────────────────────
console.log('\n== Telemetry fixes ==');
check('coarse fix is still usable (no boot gate)', m.isUsableFix({ ...basePos, accuracyM: 250 }) === true);
check('coarse fix is graded degraded/coarse',
  ['coarse', 'degraded'].includes(m.positionQuality({ ...basePos, accuracyM: 250 })));

// Driving-while-stationary: measured speed must veto the label.
check('panel never says Driving when measured stationary',
  m.motionLabel('driving', { ...basePos, speedMps: 0.1 }, 0.9) === 'Stationary');
check('panel still says Driving when actually moving',
  m.motionLabel('driving', { ...basePos, speedMps: 14 }, 0.9) === 'Driving');

// Heading hold at low speed.
check('heading held below walking pace', m.stabiliseHeading(90, 270, 0.3) === 90);
const blended = m.stabiliseHeading(90, 100, 5);
check('heading tracks at speed', Math.abs(blended - 100) < 1e-6, `${blended.toFixed(1)}°`);

// Vertical drift: a static subject must not sink.
const tracker = new m.EgoPoseTracker();
let pose;
for (let i = 0; i < 200; i++) {
  pose = tracker.update({ ...basePos, floorLevel: 1, altitudeM: 4.2 }, (i % 2 ? 0.03 : -0.03), 0.1);
}
check('no vertical drift while static', Math.abs(pose.z - 4.2) < 0.05, `z=${pose.z.toFixed(3)}m (anchor 4.2)`);
check('z locks when static', tracker.isVerticallyLocked() === true);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll map/telemetry/routing checks passed.');
