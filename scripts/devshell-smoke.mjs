/**
 * DevShell smoke test — runs in CI on the web build.
 *
 * Asserts the Windows/non-native fallback actually works:
 *   1. isNativeCoreAvailable() is false on a desktop host
 *   2. the first fix is available synchronously from start() (no boot hang)
 *   3. the simulated telemetry carries every field the native providers emit
 *   4. the simulation advances (position/heading move, engines are driven)
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

const { isNativeCoreAvailable, detectEnvironment, DevShellRuntime } = await import(out);

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const env = detectEnvironment();
check('desktop host is not native', isNativeCoreAvailable() === false, `${env.host}: ${env.reason}`);

const rt = new DevShellRuntime({ lng: -0.1278, lat: 51.5074 }, { updateRateHz: 10 });
const t0 = Date.now();
rt.start();
const bootMs = Date.now() - t0;

check('start() resolves promptly', bootMs < 1000, `${bootMs} ms`);
check('first fix is synchronous', rt.provider.getLast() !== null);

const sample = rt.provider.getLastSample();
for (const field of ['position', 'accuracyM', 'motionState', 'confidence', 'headingDeg', 'updateRateHz']) {
  check(`telemetry carries ${field}`, sample?.[field] !== undefined && sample?.[field] !== null);
}

await new Promise((r) => setTimeout(r, 2000));
const later = rt.provider.getLastSample();
const moved =
  Math.abs(later.position.lat - sample.position.lat) + Math.abs(later.position.lng - sample.position.lng);
check('simulation advances', moved > 1e-7, `Δ=${moved.toExponential(2)}`);
check('Always-IN engaged', ['PREP', 'ACTIVE'].includes(rt.status().inState), rt.status().inState);

rt.stop();

if (failures.length) {
  console.error(`\n${failures.length} DevShell check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll DevShell checks passed.');
