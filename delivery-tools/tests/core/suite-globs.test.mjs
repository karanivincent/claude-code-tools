// The whole-suite command documented in docs/ARCHITECTURE.md must reach every test file in the
// plugin. A skill carries its own script tests beside the script rather than under tests/, so one
// glob was never enough: `skills/design-inventory/scripts/assemble-inventory.test.mjs` sat outside
// `tests/**` and went unrun for the whole build. This fails on any test file neither glob reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTree } from '../../lib/core/hash.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARCH = readFileSync(join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');

/** node's own glob semantics: `**` spans segments and may match none, `*` stays inside one. */
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith('**/', i)) { re += '(?:[^/]*/)*'; i += 2; continue; }
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** The globs of the one `node --test` line in ## Tests that quotes more than one. */
function documentedGlobs() {
  const start = ARCH.indexOf('## Tests');
  assert.ok(start >= 0, 'ARCHITECTURE.md has no "## Tests" section');
  const end = ARCH.indexOf('\n## ', start + 3);
  const section = ARCH.slice(start, end < 0 ? undefined : end);
  for (const m of section.matchAll(/`node --test ((?:'[^']+' ?)+)`/g)) {
    const globs = [...m[1].matchAll(/'([^']+)'/g)].map((g) => g[1]);
    if (globs.length > 1) return globs;
  }
  assert.fail('## Tests documents no whole-suite `node --test` command with more than one glob');
}

test('the documented whole-suite command reaches every test file', async () => {
  const globs = documentedGlobs().map(globToRe);
  const files = (await listTree(ROOT, { ignore: (rel) => rel.startsWith('.delivery/') }))
    .filter((f) => f.endsWith('.test.mjs'));
  assert.ok(files.length > 60, `found only ${files.length} test files`);
  const unreached = files.filter((f) => !globs.some((re) => re.test(f)));
  assert.deepEqual(unreached, [], `test files no documented glob runs: ${unreached.join(', ')}`);
});
