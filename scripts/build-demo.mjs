/**
 * Builds the self-contained SmartMapsAE v2 demo page.
 *
 * Bundles the demo entry, inlines every map fixture, and writes one HTML file
 * with no external requests — so it runs anywhere, including inside an
 * artifact viewer with a strict CSP.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bundlePath = '/tmp/sm-demo.js';
execFileSync('node_modules/.bin/esbuild', [
  'scripts/demo-entry.ts', '--bundle', '--format=iife', '--minify',
  `--outfile=${bundlePath}`, '--log-level=warning'
], { stdio: 'inherit' });

// Collect the fixtures, keyed the way TileSource requests them.
const fixtures = {};
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
    else if (name.endsWith('.json')) fixtures[`${prefix}${name}`] = JSON.parse(readFileSync(full, 'utf8'));
  }
};
walk('public/maps', '');

const bundle = readFileSync(bundlePath, 'utf8');
const html = readFileSync('scripts/demo-shell.html', 'utf8')
  .replace('/*__FIXTURES__*/', `window.__SM_FIXTURES__=${JSON.stringify(fixtures)};`)
  .replace('/*__BUNDLE__*/', bundle);

writeFileSync('dist-demo/index.html', html);
const kb = (html.length / 1024).toFixed(0);
console.log(`wrote dist-demo/index.html (${kb} KB, ${Object.keys(fixtures).length} fixtures inlined)`);
