// Runs test262 files through hi-host. Usage: node host/test262.mjs <hi-host> <test262 dir> <test paths...>
// Each test runs in sloppy and strict mode unless its flags say otherwise; both must pass.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [host, root, ...paths] = process.argv.slice(2);
const walk = (p) => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => walk(join(p, f))) : p.endsWith('.js') ? [p] : [];
const list = (meta, key) => {
  const m = meta.match(new RegExp(`^${key}:\\s*\\[(.*)\\]`, 'm')) ?? meta.match(new RegExp(`^${key}:\\s*\\n((?:\\s+- .*\\n)+)`, 'm'));
  if (!m) return [];
  return m[1].includes('- ') && !m[0].includes('[') ? m[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : m[1].split(',').map((s) => s.trim()).filter(Boolean);
};

// The host is a bare Hermes runtime: no $262.createRealm.
const UNSUPPORTED = ['cross-realm'];
const EXPECTED = new Set(readFileSync(new URL('./test262-expected-failures.txt', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
let pass = 0;
const failures = [], skipped = [];
const unexpectedPasses = new Set();
let expectedFailures = 0;
for (const file of paths.flatMap((p) => walk(join(root, p)))) {
  const src = readFileSync(file, 'utf8');
  const meta = src.match(/\/\*---([\s\S]*?)---\*\//)?.[1] ?? '';
  const flags = list(meta, 'flags');
  const missing = list(meta, 'features').filter((f) => UNSUPPORTED.includes(f));
  if (missing.length) { skipped.push(`${relative(root, file)} (${missing})`); continue; }
  const harness = ['assert.js', 'sta.js', ...(flags.includes('async') ? ['doneprintHandle.js'] : []), ...list(meta, 'includes')]
    .map((h) => join(root, 'harness', h));
  const modes = flags.includes('onlyStrict') ? [true] : flags.includes('noStrict') || flags.includes('raw') ? [false] : [false, true];
  const negative = /negative:/.test(meta);
  for (const strict of modes) {
    let out = '', ok;
    try {
      out = execFileSync(host, [...(strict ? ['--strict'] : []), ...(flags.includes('raw') ? [] : harness), file], { encoding: 'utf8', stdio: 'pipe' });
      ok = !negative && (!flags.includes('async') || out.includes('Test262:AsyncTestComplete'));
    } catch (e) {
      out = (e.stdout ?? '') + (e.stderr ?? '');
      ok = negative;
    }
    const rel = relative(root, file);
    if (ok) {
      pass++;
      if (EXPECTED.has(rel)) unexpectedPasses.add(rel);
    } else if (EXPECTED.has(rel)) {
      expectedFailures++;
    } else {
      failures.push(`${rel}${strict ? ' (strict)' : ''}\n    ${out.trim().split('\n')[0]}`);
    }
  }
}
for (const f of failures) console.log('FAIL', f);
for (const s of skipped) console.log('SKIP', s);
for (const u of unexpectedPasses) console.log('UNEXPECTED PASS (remove from test262-expected-failures.txt)', u);
console.log(`\n${pass} passed, ${failures.length} failed, ${expectedFailures} expected failures, ${skipped.length} skipped`);
process.exitCode = failures.length || unexpectedPasses.size ? 1 : 0;
