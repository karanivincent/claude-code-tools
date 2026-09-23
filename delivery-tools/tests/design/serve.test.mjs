import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepareServeDir, setPropDefaults, writePropCopy, PROP_COPY_PREFIX } from '../../lib/design/serve.mjs';
import { startStaticServer, resolveServedPath, contentTypeFor } from '../../lib/design/server.mjs';
import { parseCdnUrl, resolveVendored, vendorResolver } from '../../lib/design/vendor.mjs';
import { splitDcHtml } from '../../lib/design/claude-dc.mjs';
import { planRenders, isSelector } from '../../lib/design/render.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { makeDesignRepo, widgetsInventory, DC_TEXT, TOYLIB } from './helpers.mjs';
import renderCommand from '../../lib/commands/design-render.mjs';

test('setPropDefaults changes only the named defaults and keeps the attribute escaped', () => {
  const html = setPropDefaults(DC_TEXT(), { empty: true, tone: 'loud' });
  const props = splitDcHtml(html).props.value;
  assert.equal(props.empty.default, true);
  assert.equal(props.tone.default, 'loud');
  assert.equal(props.limit.default, 3);
  assert.deepEqual(props.tone.options, ['calm', 'loud']);
  assert.equal(html.replace(/data-props="[^"]*"/, '').length, DC_TEXT().replace(/data-props="[^"]*"/, '').length, 'nothing else moved');
  assert.throws(() => setPropDefaults(DC_TEXT(), { nope: 1 }), (e) => e.exit === 2 && /no prop "nope"/.test(e.message));
  assert.throws(() => setPropDefaults('<html></html>', { a: 1 }), (e) => e.exit === 2);
});

test('prepareServeDir copies the snapshot, unzips the runtime beside it, and clears stale prop copies', async () => {
  const repo = makeDesignRepo();
  try {
    const snap = join(repo.dir, 'docs/design/widgets');
    const serve = join(repo.dir, '.delivery/widgets/design-serve');
    mkdirSync(serve, { recursive: true });
    writeFileSync(join(serve, `${PROP_COPY_PREFIX}OLD-01.dc.html`), 'stale');
    const r = await prepareServeDir(snap, serve);
    assert.equal(r.dcFile, 'widgets.dc.html');
    assert.deepEqual(r.runtime, ['support.js']);
    assert.ok(existsSync(join(serve, 'support.js')));
    assert.ok(existsSync(join(serve, 'shots/list.png')));
    assert.ok(!existsSync(join(serve, 'runtime.zip')));
    assert.ok(!existsSync(join(serve, `${PROP_COPY_PREFIX}OLD-01.dc.html`)));
    assert.ok(!existsSync(join(snap, 'support.js')), 'the snapshot itself is never written');
    const name = await writePropCopy(serve, r.dcFile, 'WL-02', { empty: true });
    assert.equal(name, `${PROP_COPY_PREFIX}WL-02.dc.html`);
    assert.equal(splitDcHtml(readFileSync(join(serve, name), 'utf8')).props.value.empty.default, true);
  } finally { repo.cleanup(); }
});

test('the static server serves only its root, over loopback', async () => {
  const repo = makeDesignRepo();
  const root = join(repo.dir, 'docs/design/widgets');
  const server = await startStaticServer(root);
  try {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const ok = await fetch(server.url('widgets.dc.html'));
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /text\/html/);
    assert.match(await ok.text(), /<x-dc>/);
    assert.equal((await fetch(`${server.origin}/../../../etc/passwd`)).status, 404);
    assert.equal((await fetch(`${server.origin}/%2e%2e/%2e%2e/secret`)).status, 404);
    assert.equal((await fetch(`${server.origin}/missing.png`)).status, 404);
    assert.equal((await fetch(server.url('shots/list.png'))).headers.get('content-type'), 'image/png');
    assert.equal((await fetch(server.origin + '/widgets.dc.html', { method: 'POST' })).status, 405);
    assert.equal(resolveServedPath('/a/b', '/../c'), null);
    assert.equal(resolveServedPath('/a/b', '/c%00'), null);
    assert.equal(resolveServedPath('/a/b', '/c/d.js?x=1'), '/a/b/c/d.js');
    assert.equal(contentTypeFor('x.woff2'), 'font/woff2');
  } finally { await server.close(); repo.cleanup(); }
});

test('a CDN script is answered from node_modules only for the same package at the same version', () => {
  assert.deepEqual(parseCdnUrl('https://cdn.example.invalid/react@18.3.1/umd/react.production.min.js'), { pkg: 'react', version: '18.3.1', file: 'umd/react.production.min.js' });
  assert.deepEqual(parseCdnUrl('https://cdn.example.invalid/npm/@scope/lib@2.0.0/dist/x.js'), { pkg: '@scope/lib', version: '2.0.0', file: 'dist/x.js' });
  assert.equal(parseCdnUrl('https://fonts.example.invalid/css2?family=Sans'), null);
  assert.equal(parseCdnUrl('https://cdn.example.invalid/a@1.0.0/../../etc/passwd'), null);
  const repo = makeDesignRepo();
  try {
    const hit = resolveVendored('https://cdn.example.invalid/toylib@1.2.3/dist/toylib.js', [join(repo.dir, 'apps/web/e2e')]);
    assert.ok(hit, 'found from a directory below the package');
    assert.deepEqual(readFileSync(hit.path), TOYLIB());
    assert.equal(resolveVendored('https://cdn.example.invalid/toylib@1.2.4/dist/toylib.js', [repo.dir]), null, 'another version is not the same bytes');
    assert.equal(resolveVendored('https://cdn.example.invalid/toylib@1.2.3/dist/missing.js', [repo.dir]), null);
    const r = vendorResolver([repo.dir]);
    assert.equal(r('https://cdn.example.invalid/toylib@1.2.3/dist/toylib.js').version, '1.2.3');
  } finally { repo.cleanup(); }
});

test('planRenders: impossible states are skipped, pictures copied, unspecified and prop-less states refused', () => {
  const plan = planRenders(widgetsInventory(), { states: null, adapter: 'claude-design' });
  const by = Object.fromEntries(plan.map((p) => [p.id, p]));
  assert.equal(by['WL-01'].action, 'render');
  assert.deepEqual(by['WL-02'].props, { empty: true });
  assert.deepEqual(by['WL-03'].steps, [{ click: 'Red widget' }]);
  assert.equal(by['WL-05'].action, 'skip');
  assert.equal(by['WL-06'].action, 'shot');
  const inv = widgetsInventory([
    { id: 'XX-01', screen: 's', name: 'n', reach: { kind: 'unspecified', unspecified: 'error' }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'XX-02', screen: 's', name: 'n', reach: { kind: 'prop' }, shots: [], render: { status: 'ok' }, controls: [] },
    { id: 'XX-03', screen: 's', name: 'n', reach: { kind: 'shot-only' }, shots: [], render: { status: 'ok' }, controls: [] },
  ]);
  assert.deepEqual(planRenders(inv, { adapter: 'claude-design' }).map((p) => p.action), ['fail', 'fail', 'fail']);
  assert.deepEqual(planRenders(widgetsInventory(), { adapter: 'image-folder', states: ['WL-01'] }), [{ id: 'WL-01', action: 'shot', shot: 'shots/list.png' }]);
  assert.ok(isSelector('text="Scripts"'));
  assert.ok(isSelector('css=.x'));
  assert.ok(!isSelector('Red widget'));
});

test('design render: an image-folder design copies pictures without a browser; unknown states are refused', async () => {
  const repo = makeDesignRepo();
  try {
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(renderCommand.run(ctx, ['--states', 'WL-01,NOPE-01']), (e) => e.exit === 2 && /not in the inventory: NOPE-01/.test(e.message));
    await assert.rejects(renderCommand.run(ctx, ['--width', 'wide']), (e) => e.exit === 2);
    // only picture states: no browser is started
    const exit = await renderCommand.run(ctx, ['--states', 'WL-05,WL-06']);
    assert.equal(exit, 0);
    assert.ok(existsSync(join(repo.dir, '.delivery/widgets/design/WL-06.png')));
    assert.ok(!existsSync(join(repo.dir, '.delivery/widgets/design/WL-06.txt')));
  } finally { repo.cleanup(); }
});
