// Playwright resolution from the target repo, MANIFEST.sha256, and the zip helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlaywright, playwrightSearchDirs } from '../../lib/core/playwright.mjs';
import { buildManifest, verifyManifest, parseManifest, MANIFEST_FILE } from '../../lib/core/manifest.mjs';
import { readZip, writeZip, crc32 } from '../../lib/core/zip.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakePackage(dir, name) {
  const pkg = join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version: '9.9.9', main: 'index.js' }));
  writeFileSync(join(pkg, 'index.js'), `exports.chromium = { fake: ${JSON.stringify(name)} };`);
}

test('Playwright resolves from the target repo, preferring the e2e package, never imported at load', async () => {
  const t = makeTempDir();
  try {
    await assert.rejects(resolvePlaywright({ repoRoot: t.dir }), (e) => e.exit === 2 && /Playwright not found/.test(e.message));
    fakePackage(join(t.dir, 'apps', 'web'), '@playwright/test');
    const r = await resolvePlaywright({ repoRoot: t.dir, e2eDir: 'apps/web/e2e' });
    assert.equal(r.name, '@playwright/test');
    assert.deepEqual(r.chromium, { fake: '@playwright/test' });
    assert.deepEqual(playwrightSearchDirs(t.dir, 'apps/web/e2e'), [t.dir, join(t.dir, 'apps/web/e2e'), join(t.dir, 'apps/web'), join(t.dir, 'apps')]);
  } finally { t.cleanup(); }
  const src = readdirSync(join(ROOT, 'lib'), { recursive: true }).filter((f) => f.endsWith('.mjs'));
  for (const f of src) {
    const text = readFileSync(join(ROOT, 'lib', f), 'utf8');
    assert.doesNotMatch(text, /^import .*['"](@playwright\/test|playwright|playwright-core)['"]/m, `${f} imports Playwright at top level`);
  }
});

test('manifest: absent passes, exact passes, changed, missing and unlisted code fail', async () => {
  const t = makeTempDir();
  try {
    mkdirSync(join(t.dir, 'lib'), { recursive: true });
    mkdirSync(join(t.dir, 'docs'), { recursive: true });
    writeFileSync(join(t.dir, 'lib', 'a.mjs'), 'export const a = 1;\n');
    writeFileSync(join(t.dir, 'docs', 'x.md'), '# x\n');
    assert.deepEqual(await verifyManifest(t.dir), { present: false, ok: true, manifestSha256: null, mismatches: [] });
    const text = await buildManifest(t.dir);
    assert.deepEqual([...parseManifest(text).keys()], ['docs/x.md', 'lib/a.mjs']);
    writeFileSync(join(t.dir, MANIFEST_FILE), text);
    const v = await verifyManifest(t.dir);
    assert.equal(v.ok, true); assert.match(v.manifestSha256, /^[0-9a-f]{64}$/);
    writeFileSync(join(t.dir, 'lib', 'a.mjs'), 'export const a = 2;\n');
    writeFileSync(join(t.dir, 'lib', 'injected.mjs'), 'x');
    writeFileSync(join(t.dir, 'docs', 'notes.md'), 'unlisted docs are fine');
    const bad = await verifyManifest(t.dir);
    assert.deepEqual(bad.mismatches, [{ file: 'lib/a.mjs', reason: 'changed' }, { file: 'lib/injected.mjs', reason: 'not in manifest' }]);
  } finally { t.cleanup(); }
});

test('zip: round trip, deterministic bytes, path traversal refused', () => {
  const entries = [{ name: 'support.js', data: 'console.log(1)' }, { name: '_ds/tokens.css', data: Buffer.alloc(3000, 97) }];
  const z1 = writeZip(entries);
  assert.deepEqual(z1, writeZip(entries));
  assert.deepEqual(readZip(z1).map((e) => [e.name, e.data.length]), [['support.js', 14], ['_ds/tokens.css', 3000]]);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const evil = writeZip([{ name: '../escape.txt', data: 'x' }]);
  assert.throws(() => readZip(evil), /unsafe path/);
  assert.throws(() => readZip(Buffer.from('not a zip at all, just text')), (e) => e.exit === 2);
});
