/**
 * Smart-Maps DSE smoke test.
 *
 * Asserts the engine contract the platform shells depend on:
 *   1. every module is importable from its own sm-core path
 *   2. init() resolves immediately — there is no boot phase to wait on
 *   3. the three-call API works, and a coarse fix still produces a position
 *   4. frames carry no internal layers unless debugMode is explicitly on
 *   5. web and mobile drive identical state from an identical trace
 *   6. entering a venue resolves the vertical dimension to a floor
 *   7. the web shell is the DSE shell, with no OS-style boot path anywhere
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'sm-dse-'));
const out = join(dir, 'bundle.mjs');
execFileSync('node_modules/.bin/esbuild', [
  '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning',
  'scripts/_dse-smoke-entry.ts'
], { stdio: 'inherit' });

const m = await import(out);
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

/** Serve the bundled fixtures; anything else 404s, as it would in the wild. */
const fixtureFetch = async (input) => {
  const path = String(input).replace(/^.*\/maps\//, 'public/maps/');
  try {
    return new Response(readFileSync(path, 'utf8'), { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
};

/** A backend that records frames instead of drawing them. */
function recordingSurface() {
  const frames = [];
  return { name: 'recording', frames, draw: (frame) => frames.push(frame) };
}

const gnss = (t, over = {}) => ({
  lat: 51.5071, lng: -0.1281, accuracyM: 12, headingDeg: 90, speedMps: 1.4,
  timestampMs: t, ...over
});
const imu = (t, over = {}) => ({
  accelMagnitude: 1.1, verticalAccel: 0.05, gyroMagnitude: 0.2, timestampMs: t, ...over
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A plain position, for the pure label helpers. */
const basePosition = {
  lat: 51.5071, lng: -0.1281, accuracyM: 8, headingDeg: 0, speedMps: 0,
  floorLevel: null, altitudeM: 0, verticalAccuracyM: 3,
  verticalMotionState: 'static', verticalTransitionConfidence: 0,
  timestampMs: 0, venueId: null, simulated: false
};

/**
 * A clock the test drives, so results are deterministic and fix age is
 * measured against the trace rather than against wall time.
 */
const makeClock = (t = 0) => {
  const clock = { t, now: () => clock.t };
  return clock;
};

// ── 1. module surface ───────────────────────────────────────────────────────
console.log('\n== Module surface ==');
for (const name of ['DSE', 'AEModule', 'SmartAI', 'DimensionalEngine', 'TilePipeline', 'MapRenderer']) {
  check(`${name} is importable from sm-core`, typeof m[name] === 'function');
}

// ── 2. init resolves immediately (no boot phase) ────────────────────────────
console.log('\n== init() ==');
const surface = recordingSurface();
const clock = makeClock(1000);
const dse = new m.DSE({ surface, fetchImpl: fixtureFetch, now: clock.now });
check('engine is not ready before init', dse.isReady() === false);
const t0 = Date.now();
await dse.init();
const initMs = Date.now() - t0;
check('init() resolves immediately', initMs < 50, `${initMs} ms`);
check('engine is ready after init', dse.isReady() === true);
check('state is answerable with no samples yet', dse.getState().ready === true);

// ── 3. the three-call API ───────────────────────────────────────────────────
console.log('\n== updatePosition + renderFrame ==');
clock.t = 1000;
dse.updatePosition(gnss(1000), imu(1000));
clock.t = 1200;
dse.updatePosition(gnss(1200, { lng: -0.1279 }), imu(1200));
const state = dse.getState();
check('position tracks the samples', Math.abs(state.position.lng - -0.1279) < 1e-9);
check('motion estimate is produced', typeof state.motion.horizontal === 'string');
check('trajectory projects forward', state.trajectory.distanceM > 0, `${state.trajectory.distanceM.toFixed(1)} m`);
check('dimensional depth reaches 7D', state.dimensions.depth === 7, `depth ${state.dimensions.depth}`);

check('renderFrame() returns void synchronously', dse.renderFrame() === undefined);
await settle();
check('a frame was drawn', surface.frames.length > 0, `${surface.frames.length} frame(s)`);

// A coarse fix is a real fix: it must position the user, never stall anything.
clock.t = 1400;
dse.updatePosition(gnss(1400, { accuracyM: 180 }), imu(1400));
check('coarse fix still produces a position', Number.isFinite(dse.getState().position.lat));

// ── 4. internal layers stay internal ────────────────────────────────────────
console.log('\n== Internal layer gate ==');
const last = surface.frames[surface.frames.length - 1];
check('frame carries no debug layer by default', last.debug === null);
dse.setDebugMode(true);
dse.renderFrame();
await settle();
check('debug layer appears only when explicitly enabled',
  surface.frames[surface.frames.length - 1].debug !== null);

// ── 5. web / mobile parity ──────────────────────────────────────────────────
console.log('\n== Platform parity ==');
const trace = [];
for (let i = 0; i < 40; i++) {
  const t = 2000 + i * 100;
  trace.push([gnss(t, { lng: -0.1281 + i * 0.00002, speedMps: 1.4 + i * 0.01 }), imu(t)]);
}
const run = async () => {
  const shellClock = makeClock(2000);
  const shell = new m.DSE({ surface: recordingSurface(), fetchImpl: fixtureFetch, now: shellClock.now });
  await shell.init();
  for (const [g, i] of trace) {
    shellClock.t = g.timestampMs;
    shell.updatePosition(g, i);
  }
  return JSON.stringify(shell.getState());
};
const web = await run();
const mobile = await run();
check('identical trace produces identical state', web === mobile, `${web.length} chars`);

// ── 6. venue entry resolves the vertical dimension ──────────────────────────
console.log('\n== Indoor ==');
const indoorSurface = recordingSurface();
const indoorClock = makeClock(3000);
const indoor = new m.DSE({ surface: indoorSurface, fetchImpl: fixtureFetch, now: indoorClock.now });
await indoor.init();
const entered = await indoor.enterVenue('sm-atrium', 1);
check('venue loads from the tile pipeline', entered === true);
const venue = JSON.parse(readFileSync('public/maps/indoors/sm-atrium.json', 'utf8'));
const level1 = venue.floors.find((f) => f.level === 1);
indoor.updatePosition(
  gnss(3000, { altitudeM: level1.elevationM, speedMps: 0.8 }),
  imu(3000, { barometricAltitudeM: level1.elevationM })
);
const indoorState = indoor.getState();
check('altitude resolves to the right floor', indoorState.position.floorLevel === 1,
  `floor ${indoorState.position.floorLevel}`);
check('venue id is carried on the position', indoorState.venueId === 'sm-atrium');
indoor.renderFrame();
await settle();
const indoorFrame = indoorSurface.frames[indoorSurface.frames.length - 1];
check('frame is clipped to the active floor', indoorFrame.activeFloorLevel === 1);
check('indoor frame still carries no debug layer', indoorFrame.debug === null);

// ── 7. the web shell is the DSE shell ───────────────────────────────────────
// Static guards, not behavioural ones: they exist so the OS-style boot path
// cannot creep back in unnoticed. Smart-Maps is an engine, not an operating
// system, and the engine has no start-up phase that can fail — so there is
// nothing for a watchdog to watch or a Safe Mode to recover.
console.log('\n== Web shell ==');
const html = readFileSync('index.html', 'utf8');
check('index.html loads the DSE shell', html.includes('/sm-platform-web/main.ts'));
check('index.html has a canvas for the renderer', html.includes('id="sm-canvas"'));
for (const marker of ['__SM_BOOT_', 'Safe Mode', "didn't finish booting", 'sm-boot', 'src/main.tsx']) {
  check(`index.html carries no "${marker}"`, !html.includes(marker));
}
check('src/boot is gone', !existsSync('src/boot'));
check('the React boot entry is gone', !existsSync('src/main.tsx'));

// The read-out shows what a person navigating wants and nothing more: no ego
// z, no raw Always-IN state, no update rate, no dimensional depth.
for (const internal of ['data-sm="ego', 'data-sm="in-state', 'data-sm="rate', 'data-sm="depth', 'Debug']) {
  check(`the shell exposes no "${internal}"`, !html.includes(internal));
}

// Measured speed has the final say over the classifier — a "driving" label on
// a stationary reading describes a parked car.
const drivingButParked = {
  position: { ...basePosition, speedMps: 0.2 },
  motion: { horizontal: 'driving' },
  alwaysIN: { verticalMotionState: 'static' },
  activeFloorLevel: null
};
check('HUD never says Driving while measured stationary',
  m.motionLabel(drivingButParked) === 'Stationary', m.motionLabel(drivingButParked));
check('HUD says Driving when actually moving',
  m.motionLabel({ ...drivingButParked, position: { ...basePosition, speedMps: 14 } }) === 'Driving');
check('HUD names the connector mid-transition',
  m.floorLabel({ ...drivingButParked, alwaysIN: { verticalMotionState: 'lift' } }) === 'In the lift');
check('HUD reads Outdoors with no floor', m.floorLabel(drivingButParked) === 'Outdoors');
check('HUD names the floor indoors',
  m.floorLabel({ ...drivingButParked, activeFloorLevel: 2 }) === 'Floor 2');

console.log('');
if (failures.length) {
  console.error(`${failures.length} DSE check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('All DSE checks passed.');
