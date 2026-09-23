// design render in a real browser, on the synthetic widgets design and its stand-in runtime.
// Needs Playwright and Chromium: set DELIVERY_PLAYWRIGHT_ROOT to a directory they resolve from
// (a project with @playwright/test installed), and run it through the machine's heavy-work wrapper.
// Skipped otherwise, so the default test run never starts a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeDesignRepo } from './helpers.mjs';
import renderCommand from '../../lib/commands/design-render.mjs';

const PW = process.env.DELIVERY_PLAYWRIGHT_ROOT;
const skip = PW ? false : 'DELIVERY_PLAYWRIGHT_ROOT not set (a directory Playwright and Chromium resolve from)';

test('design render: click paths, prop copies and set steps, words read from the page, offline', { skip, timeout: 180_000 }, async () => {
  const repo = makeDesignRepo();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), env: { DELIVERY_PLAYWRIGHT_ROOT: PW } });
    const exit = await renderCommand.run(ctx, ['--offline']);
    assert.equal(exit, 0, stdout.text());
    const dir = join(repo.dir, '.delivery/widgets/design');
    const txt = (id) => readFileSync(join(dir, `${id}.txt`), 'utf8').split('\n').filter(Boolean);

    // the default state, as the page shows it: each row cell its own line, CSS uppercase applied
    assert.deepEqual(txt('WL-01'), ['Widgets', 'List', 'Settings', '3 WIDGETS IN STOCK', 'Blue widget', '4 left', 'Red widget', '1 left', 'Green widget', 'Sold out', 'New widget']);
    // a prop-only state from a temporary copy with the prop's default changed
    assert.ok(txt('WL-02').includes('NO WIDGETS YET'));
    assert.ok(!txt('WL-02').includes('Blue widget'));
    // a click path, clicking by exact visible text
    assert.ok(txt('WL-03').includes('About Red widget'));
    // a set step writes the component's own state
    assert.ok(txt('WL-04').includes('Settings for Kim are saved as you type.'));
    assert.ok(txt('WL-04').includes('Widget settings'));
    // an impossible state is skipped, a picture state copied
    assert.ok(!existsSync(join(dir, 'WL-05.png')));
    assert.ok(existsSync(join(dir, 'WL-06.png')) && !existsSync(join(dir, 'WL-06.txt')));
    assert.match(stdout.text(), /skipped WL-05: impossible: the design draws no loading state/);

    const dom = JSON.parse(readFileSync(join(dir, 'WL-01.dom.json'), 'utf8'));
    assert.deepEqual(validateAgainst('dom', dom).errors, []);
    assert.equal(dom.viewport.width, 1440);
    const controls = dom.elements.filter((e) => e.kind === 'control');
    assert.ok(controls.some((c) => c.tag === 'button' && c.name === 'New widget' && c.role === 'button'));
    assert.ok(controls.some((c) => c.tag === 'span' && c.text === 'Settings'), 'a design <span> with a click handler is a control');
    assert.equal(dom.elements.filter((e) => e.testid === 'widget-row').length, 3);
    const stock = dom.elements.find((e) => e.text === '3 WIDGETS IN STOCK');
    assert.equal(stock.style.textTransform, 'uppercase');
    assert.equal(stock.lines, 1);
    assert.ok(readFileSync(join(dir, 'WL-01.png')).subarray(1, 4).toString() === 'PNG');
    assert.ok(!existsSync(join(repo.dir, 'docs/design/widgets/support.js')), 'the snapshot is never unzipped in place');
  } finally { repo.cleanup(); }
});

test('design render: a runtime script the repo cannot answer is aborted offline, and every state says why', { skip, timeout: 120_000 }, async () => {
  const repo = makeDesignRepo({ libVersion: '9.9.9', inventory: undefined });
  try {
    const { ctx, stdout, stderr } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), env: { DELIVERY_PLAYWRIGHT_ROOT: PW } });
    const exit = await renderCommand.run(ctx, ['--offline', '--states', 'WL-01,WL-03']);
    assert.equal(exit, 1);
    const fails = stdout.lines().filter((l) => l.startsWith('FAIL render'));
    assert.equal(fails.length, 2);
    assert.match(fails[0], /WL-01: the design did not boot: toy runtime: failed to load/);
    assert.match(stderr.text(), /offline: aborted requests to https:\/\/cdn\.example\.invalid/);
  } finally { repo.cleanup(); }
});
