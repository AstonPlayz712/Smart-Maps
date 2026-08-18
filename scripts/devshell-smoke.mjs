/**
 * DevShell smoke test — runs in CI on the web build.
 *
 * Asserts the Windows/non-native fallback and the simulation layer:
 *   1. DevShellConfig loads and resolves every mode
 *   2. the fallback engages on a desktop host
 *   3. the first fix is synchronous, and so are the first IMU packet,
 *      ego pose and Always-IN state
 *   4. the telemetry carries every field the native providers emit
 *   5. Always-IN cycles correctly (including the scripted HOLD)
 *   6. the ego pose updates as the journey progresses
 *   7. path playback is deterministic — identical dt sequences produce
 *      identical output
 *
 * Exits non-zero on any failure so CI fails loudly rather than silently.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'devshell-')), 'devshell.mjs');
execFileSync('node_modules/.bin/esbuild', [
  'devshell/src/index.ts', '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=warning'
], { stdio: 'inherit' });

globalThis.window = { addEventListener() {}, clearTimeout, setTimeout };
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' },
  configurable: true
});

const {
  isNativeCoreAvailable, detectEnvironment, DevShellRuntime,
  resolveDevShellConfig, DEFAULT_DEVSHELL_CONFIG, createSimulation, SAMPLE_JOURNEY
} = await import(out);

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const ORIGIN = { lng: -0.1278, lat: 51.5074 };

// ── 1. DevShellConfig ───────────────────────────────────────────────────────
console.log('\n== DevShellConfig ==');
check('default config loads', DEFAULT_DEVSHELL_CONFIG?.mode === 'looped', DEFAULT_DEVSHELL_CONFIG?.mode);
const resolved = resolveDevShellConfig({ mode: 'path', updateRateHz: 20 });
check('overrides merge', resolved.mode === 'path' && resolved.updateRateHz === 20);
check('bad values are clamped', resolveDevShellConfig({ updateRateHz: 9999 }).updateRateHz === 60);
check('unknown mode falls back', resolveDevShellConfig({ mode: 'nonsense' }).mode === 'looped');
for (const mode of ['looped', 'path', 'static', 'chaotic']) {
  const sim = createSimulation(ORIGIN, resolveDevShellConfig({ mode }));
  check(`mode '${mode}' builds a simulation`, sim?.mode === mode, sim?.name);
}

// ── 2–4. fallback + synchronous boot + telemetry ────────────────────────────
console.log('\n== Fallback and boot ==');
const env = detectEnvironment();
check('desktop host is not native', isNativeCoreAvailable() === false, `${env.host}: ${env.reason}`);

const rt = new DevShellRuntime(ORIGIN, { mode: 'looped', updateRateHz: 10 });
const t0 = Date.now();
rt.start();
const bootMs = Date.now() - t0;

check('start() resolves promptly', bootMs < 1000, `${bootMs} ms`);
check('first fix is synchronous', rt.provider.getLast() !== null);
check('first IMU packet is synchronous', rt.getImu() !== null);
check('first ego pose is synchronous', rt.getEgo() !== null);
check('first Always-IN state is synchronous', typeof rt.getINState() === 'string', rt.getINState());

const sample = rt.provider.getLastSample();
for (const field of ['position', 'accuracyM', 'motionState', 'confidence', 'headingDeg', 'updateRateHz']) {
  check(`telemetry carries ${field}`, sample?.[field] !== undefined && sample?.[field] !== null);
}

// ── 6. ego pose evolves ─────────────────────────────────────────────────────
console.log('\n== Ego pose ==');
const ego0 = rt.getEgo();
const egoUpdates = [];
rt.onEgo((e) => egoUpdates.push(e));
await new Promise((r) => setTimeout(r, 2000));
const ego1 = rt.getEgo();
const egoMoved =
  Math.abs(ego1.location.lat - ego0.location.lat) + Math.abs(ego1.location.lng - ego0.location.lng);
check('ego pose updates', egoUpdates.length > 1, `${egoUpdates.length} updates`);
check('ego pose advances', egoMoved > 1e-7, `Δ=${egoMoved.toExponential(2)}`);
check('ego carries heading + speed',
  Number.isFinite(ego1.headingDeg) && Number.isFinite(ego1.speedMps),
  `hdg=${ego1.headingDeg.toFixed(0)}° spd=${ego1.speedMps.toFixed(1)}m/s`);
rt.stop();

// ── 5. Always-IN cycles, including scripted HOLD ────────────────────────────
console.log('\n== Always-IN ==');
const scripted = new DevShellRuntime(ORIGIN, { mode: 'path', updateRateHz: 20 });
scripted.start();
const seen = new Set([scripted.getINState()]);
await new Promise((resolve) => {
  const started = Date.now();
  const iv = setInterval(() => {
    seen.add(scripted.getINState());
    if (Date.now() - started > 38000) { clearInterval(iv); resolve(); }
  }, 100);
});
scripted.stop();
const order = ['OFF', 'PREP', 'ACTIVE', 'HOLD', 'EXIT'];
const missing = order.filter((s) => !seen.has(s));
check('Always-IN cycles OFF→PREP→ACTIVE→HOLD→EXIT', missing.length === 0,
  missing.length ? `missing ${missing.join(',')}` : [...seen].join(' '));

// ── 7. path playback determinism ────────────────────────────────────────────
console.log('\n== Determinism ==');
const cfg = resolveDevShellConfig({ mode: 'path' });
const runPlayback = () => {
  const sim = createSimulation(ORIGIN, cfg);
  const frames = [];
  for (let i = 0; i < 400; i++) {
    const s = sim.advance(0.1);
    // timestampMs is wall-clock by design (the engines judge freshness against
    // Date.now()), so determinism is asserted over the simulated values.
    frames.push([s.position.lat, s.position.lng, s.headingDeg, s.speedMps, s.accuracyM, s.motionState].join(','));
  }
  return frames.join('|');
};
const runA = runPlayback();
const runB = runPlayback();
check('path playback is deterministic', runA === runB,
  runA === runB ? `${runA.length} chars identical` : 'runs diverged');
check('path playback actually moves', new Set(runA.split('|')).size > 10);

if (failures.length) {
  console.error(`\n${failures.length} DevShell check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll DevShell checks passed.');
process.exit(0);
