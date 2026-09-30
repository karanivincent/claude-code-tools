// W7: facts files for reviewers, the same top edge for both pictures, bottom bars that spare
// sheets, steers before round 1, and the profile's `picture` block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FACTS_DIR, FACTS_MAX_BYTES, factsFile, renderFacts, textDifferences } from '../../lib/picture/facts.mjs';
import { designAreaTop, isBottomBar, runShoot, selectStates } from '../../lib/picture/shoot.mjs';
import { pictureFacts, pictureNext } from '../../lib/picture/next.mjs';
import { batchPrompt } from '../../lib/picture/review.mjs';
import { carryOver } from '../../lib/lifecycle/update-run.mjs';
import { validateProfile } from '../../lib/core/profile.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import reviewCommand from '../../lib/commands/review.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

const bytes = (s) => Buffer.byteLength(s);

// --- 1. renderFacts ------------------------------------------------------------------------------

test('facts: an item that was not reached says why and stops', () => {
  const out = renderFacts({ key: 'KC-05', rec: { reached: false, problems: ['timeout waiting for the list', 'second problem'] } });
  assert.match(out, /^# KC-05\n/);
  assert.match(out, /Not reached: timeout waiting for the list; second problem/);
  assert.doesNotMatch(out, /Buttons/);
  assert.match(renderFacts({ key: 'KC-05', rec: undefined }), /Not reached: no record/);
  assert.equal(factsFile('KC-05@phone'), `${FACTS_DIR}/KC-05@phone.md`);
});

test('facts: a reached item lists missing and leaked buttons, overflow, the pixel difference, both text differences and the lookup lines', () => {
  const rec = {
    reached: true,
    pixelDiff: 0.1234,
    overflow: 24,
    buttons: [
      { label: 'Add knowledge', shouldBe: 'shown', onPage: false },
      { label: 'Save', shouldBe: 'shown', onPage: true },
      { label: 'Delete', shouldBe: 'hidden', onPage: true, hiddenAt: 'member' },
      { label: 'Export', shouldBe: 'hidden', onPage: true },
      { label: 'Quiet', shouldBe: 'hidden', onPage: false },
    ],
    lookup: { dataFault: ['"Brian" is not in contacts'], must: ['the page lacks "Amina", though the world holds it'] },
  };
  const out = renderFacts({ key: 'KC-05', rec, designTexts: ['Knowledge', 'Only in design'], liveTexts: ['knowledge', 'Only on page'] });
  assert.match(out, /Reached\. Buttons checked: 5\. Pixels differing: 12\.3%\. Scrolls sideways by 24 px/);
  assert.match(out, /Buttons missing:\n- Add knowledge\n/);
  assert.match(out, /Buttons on the page that should be hidden:\n- Delete \(hidden at member\)\n- Export \(hidden from this role\)/);
  assert.match(out, /Texts the design shows and the page does not:\n- Only in design/);
  assert.match(out, /Texts the page shows and the design does not:\n- Only on page/);
  assert.match(out, /Already sorted by datacheck.*\n- data fault: "Brian" is not in contacts\n- must fix: the page lacks "Amina"/);
  assert.doesNotMatch(out, /- Save/);
  assert.doesNotMatch(out, /- Quiet/);
  assert.doesNotMatch(out, /- Knowledge/, 'a text both sides show, differing only in case, is not a difference');
  assert.ok(bytes(out) < FACTS_MAX_BYTES);
});

test('facts: no text section without both sides; an unchanged item says when it was shot last', () => {
  const rec = { reached: true, buttons: [], unchanged: { from: 2 } };
  const one = renderFacts({ key: 'A', rec, designTexts: ['x'], liveTexts: null });
  assert.doesNotMatch(one, /Texts the/);
  assert.match(one, /Not shot again: its route's files did not change since round 2/);
  assert.doesNotMatch(one, /Pixels differing/);
});

test('facts: a huge item (100 texts a side, long lookups) stays under 2000 bytes, lists are cut with a count', () => {
  const designTexts = Array.from({ length: 100 }, (_, i) => `Design only text number ${i} ${'d'.repeat(120)}`);
  const liveTexts = Array.from({ length: 100 }, (_, i) => `Live only text number ${i} ${'l'.repeat(120)}`);
  const long = (p) => Array.from({ length: 30 }, (_, i) => `${p} ${i} ${'x'.repeat(300)}`);
  const rec = {
    reached: true, pixelDiff: 0.5, overflow: 3,
    buttons: Array.from({ length: 40 }, (_, i) => ({ label: `Button ${i} ${'b'.repeat(90)}`, shouldBe: i % 2 ? 'shown' : 'hidden', onPage: i % 2 === 0 ? true : false })),
    lookup: { dataFault: long('fault'), must: long('must') },
  };
  const out = renderFacts({ key: 'HUGE', rec, designTexts, liveTexts });
  assert.ok(bytes(out) <= FACTS_MAX_BYTES, `${bytes(out)} bytes`);
  assert.match(out, /^# HUGE\n/);
  assert.match(out, /Reached\./);
  assert.match(out, /- and \d+ more/);
  assert.ok(out.endsWith('\n'));
});

test('facts: text differences are case- and space-blind and ignore empty texts', () => {
  const d = textDifferences(['  Hello   World ', 'Only D', ''], ['hello world', 'Only L', '   ']);
  assert.deepEqual(d, { onlyDesign: ['Only D'], onlyLive: ['Only L'] });
  assert.deepEqual(textDifferences(null, undefined), { onlyDesign: [], onlyLive: [] });
  assert.deepEqual(textDifferences(['A b'], ['a  B']), { onlyDesign: [], onlyLive: [] });
});

// --- 2. designAreaTop ----------------------------------------------------------------------------

const h1 = (y, x = 300, over = {}) => ({ tag: 'h1', kind: 'text', text: 'Title', visible: true, box: { x, y, w: 200, h: 30 }, ...over });

test('designAreaTop: the design h1 less 24, raised to an open dialog, the live top when there is no h1', () => {
  assert.equal(designAreaTop({ elements: [h1(200)] }, { left: 240 }), 176);
  assert.equal(designAreaTop({ elements: [h1(200)] }, { left: 240, keepHeader: true }), 0);
  assert.equal(designAreaTop({ elements: [h1(200)] }, { left: 240, dialogTop: 100 }), 100);
  assert.equal(designAreaTop({ elements: [h1(200)] }, { left: 240, dialogTop: 500 }), 176, 'a dialog lower than the title does not lower the edge');
  assert.equal(designAreaTop({ elements: [] }, { left: 240, liveTop: 150 }), 150);
  assert.equal(designAreaTop(null, { liveTop: 150 }), 150);
  assert.equal(designAreaTop({ elements: [] }, {}), 0);
  assert.equal(designAreaTop({ elements: [h1(10)] }, {}), 0, 'never negative');
});

test('designAreaTop: an h1 left of the page area, or hidden, is ignored; the first by position wins', () => {
  assert.equal(designAreaTop({ elements: [h1(50, 20), h1(300)] }, { left: 240 }), 276, 'the sidebar heading is left of the page area');
  assert.equal(designAreaTop({ elements: [h1(50, 300, { visible: false }), h1(300)] }, { left: 240 }), 276);
  assert.equal(designAreaTop({ elements: [h1(400), h1(300)] }, { left: 240 }), 276);
  assert.equal(designAreaTop({ elements: [h1(50, 20)] }, { left: 240, liveTop: 90 }), 90, 'only a sidebar h1: the live top');
});

// --- 3. bottom bars ------------------------------------------------------------------------------

test('isBottomBar still holds the rule the page-side function applies', () => {
  assert.equal(isBottomBar({ bottom: 844, width: 390, height: 120 }, 390, 844), true);
  assert.equal(isBottomBar({ bottom: 844, width: 390, height: 300 }, 390, 844), false);
});

// --- 4. runShoot: the design crop, the args the page-side functions get --------------------------

/** A Playwright-shaped stub that records every evaluate(fn, arg) and every clip. */
function fakeShootBrowser({ evaluated, designClips, pageTop = { top: 150, dialogTop: null } }) {
  const page = {
    async goto(u) { page._url = u; },
    url: () => page._url,
    async unrouteAll() {}, async route() {}, async setViewportSize() {}, async waitForTimeout() {}, async waitForLoadState() {},
    locator() { return { first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn, arg) {
      evaluated.push({ name: fn.name, fn, arg });
      if (fn.name === 'pageExtract') return { dom: { elements: [{ kind: 'text', text: 'Widgets', visible: true, box: { x: 10, y: 10, w: 10, h: 10 } }] } };
      if (fn.name === 'pageAreaTop') return pageTop;
      return 0;
    },
    async screenshot(opts) { writeFileSync(opts.path, 'png'); },
  };
  return {
    async launch() {
      return {
        async newContext() { return { clock: { async setFixedTime() {} }, async newPage() { return page; }, async storageState() {}, async close() {} }; },
        async newPage() {
          return {
            async setContent() {}, async evaluate() { return { w: 400, h: 900 }; }, async setViewportSize() {},
            async screenshot(o) { designClips.push(o.clip); writeFileSync(o.path, 'png'); }, async close() {},
          };
        },
        async close() {},
      };
    },
  };
}

function widgetsMap() {
  return {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+w-design-admin@example.invalid' }] }],
    states: [{ id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } }],
  };
}

async function shootWith({ designElements, pageTop, tabBar }) {
  const root = mkdtempSync(join(tmpdir(), 'w7-shoot-'));
  const designDir = join(root, 'design');
  const outDir = join(root, 'round');
  mkdirSync(designDir, { recursive: true });
  try {
    writeFileSync(join(designDir, 'WL-01.png'), 'png');
    writeFileSync(join(designDir, 'WL-01.dom.json'), JSON.stringify({ elements: designElements }));
    const m = widgetsMap();
    const evaluated = [];
    const designClips = [];
    const report = await runShoot({
      map: m, items: selectStates(m).items, baseUrl: 'http://localhost:3000', outDir, designDir,
      sessionsDir: join(outDir, 'sessions'), magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' },
      log: () => {}, diffPictures: async () => 0, parallel: 1,
      reset: async () => ({ at: new Date('2026-01-15T12:00:00.000Z'), rows: [], users: [] }),
      chromium: fakeShootBrowser({ evaluated, designClips, pageTop }),
      ...(tabBar === undefined ? {} : { tabBar }),
    });
    return { report, evaluated, designClips };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('the design picture is cut at designAreaTop of its own dom and the live top', async () => {
  const withTitle = await shootWith({ designElements: [h1(200)], pageTop: { top: 150, dialogTop: null } });
  assert.equal(withTitle.report['WL-01'].reached, true);
  assert.equal(withTitle.report['WL-01'].top, 150);
  assert.equal(withTitle.designClips.length, 1);
  assert.equal(withTitle.designClips[0].y, 176);
  assert.equal(withTitle.designClips[0].height, 900 - 176);
  assert.equal(withTitle.designClips[0].x, 0);

  const raised = await shootWith({ designElements: [h1(200)], pageTop: { top: 100, dialogTop: 100 } });
  assert.equal(raised.report['WL-01'].dialogTop, 100);
  assert.equal(raised.designClips[0].y, 100, 'raised to the live dialog');

  const noTitle = await shootWith({ designElements: [], pageTop: { top: 150, dialogTop: null } });
  assert.equal(noTitle.designClips[0].y, 150, 'no h1 in the design: the live top');
  assert.equal(noTitle.report['WL-01'].dialogTop, undefined);
});

test('the shoot hands hideBottomBars its limit and the profile\'s tab bar selectors, or null', async () => {
  const plain = await shootWith({ designElements: [h1(200)] });
  const hide = plain.evaluated.filter((e) => e.name === 'hideBottomBars');
  assert.ok(hide.length >= 1);
  assert.ok(Number.isInteger(hide[0].arg.max) && hide[0].arg.max > 0);
  assert.equal(hide[0].arg.selectors, null);
  const area = plain.evaluated.find((e) => e.name === 'pageAreaTop');
  assert.deepEqual(area.arg, { left: 0, keepHeader: false });

  const named = await shootWith({ designElements: [h1(200)], tabBar: ['nav.tabs', '[data-tab-bar]'] });
  for (const e of named.evaluated.filter((x) => x.name === 'hideBottomBars')) {
    assert.deepEqual(e.arg.selectors, ['nav.tabs', '[data-tab-bar]']);
    assert.equal(e.arg.max, hide[0].arg.max);
  }
});

// The page-side functions are not exported: take the real ones from what the shoot evaluates, and
// run them in a real browser when there is one.
const PW = process.env.DELIVERY_PLAYWRIGHT_ROOT;
test('in a real browser: a bottom sheet stays, a tab bar goes, and with selectors only the named element goes', { skip: PW ? false : 'DELIVERY_PLAYWRIGHT_ROOT not set', timeout: 60_000 }, async () => {
  const { resolvePlaywright } = await import('../../lib/core/playwright.mjs');
  const { chromium } = await resolvePlaywright({ repoRoot: PW });
  const { evaluated } = await shootWith({ designElements: [h1(200)] });
  const hideBottomBars = evaluated.find((e) => e.name === 'hideBottomBars').fn;
  const pageAreaTop = evaluated.find((e) => e.name === 'pageAreaTop').fn;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const html = `<body style="margin:0"><div style="height:300px"></div><h1 style="margin:0">Title</h1>
      <div id="sheet" role="dialog" style="position:fixed;left:0;bottom:0;width:100%;height:120px;background:#eee">sheet</div>
      <nav id="tabs" style="position:fixed;left:0;bottom:0;width:100%;height:64px;background:#ccc">tabs</nav>
      <div id="other" style="position:fixed;left:0;bottom:0;width:100%;height:50px;background:#aaa">other</div></body>`;
    const vis = () => page.evaluate(() => Object.fromEntries(['sheet', 'tabs', 'other'].map((id) => [id, getComputedStyle(document.getElementById(id)).visibility])));

    await page.setContent(html);
    await page.evaluate(hideBottomBars, { max: 160, selectors: null });
    assert.deepEqual(await vis(), { sheet: 'visible', tabs: 'hidden', other: 'hidden' });

    await page.setContent(html);
    await page.evaluate(hideBottomBars, { max: 160, selectors: ['#tabs'] });
    assert.deepEqual(await vis(), { sheet: 'visible', tabs: 'hidden', other: 'visible' });

    await page.setContent(`<body style="margin:0"><div style="height:300px"></div><h1 style="margin:0">Title</h1></body>`);
    assert.deepEqual(await page.evaluate(pageAreaTop, { left: 0, keepHeader: false }), { top: 276, dialogTop: null });
    assert.deepEqual(await page.evaluate(pageAreaTop, { left: 0, keepHeader: true }), { top: 0, dialogTop: null });
    await page.setContent(html);
    const withDialog = await page.evaluate(pageAreaTop, { left: 0, keepHeader: false });
    assert.equal(withDialog.dialogTop, null, 'a 120 px sheet is under the size of a panel');
  } finally { await browser.close(); }
});

// --- 5. review --plan writes the facts -----------------------------------------------------------

const shootRec = (over = {}) => ({ reached: true, problems: [], buttons: [], factsAgree: false, pixelDiff: 0, liveHash: 'L', designHash: 'D', ...over });
const KEYS = ['KC-05', 'KC-04', 'KC-08'];

test('review --plan writes facts/<ITEM>.md for the batched items only, each under 2000 bytes, and the batch prompt names them', async () => {
  const m = sampleMap();
  const round1 = { states: Object.fromEntries(KEYS.map((k) => [k, shootRec()])) };
  const round2 = { states: Object.fromEntries(KEYS.map((k) => [k, shootRec()])) };
  round2.states['KC-04'].liveHash = 'changed';
  round2.states['KC-04'].buttons = [{ label: 'Add knowledge', shouldBe: 'shown', onPage: false }];
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': { ...m, feature: 'widgets' },
    '.delivery/widgets/rounds/1/shoot.json': round1,
    '.delivery/widgets/rounds/2/shoot.json': round2,
    '.delivery/widgets/rounds/1/review.json': { schemaVersion: 1, round: 1, states: Object.fromEntries(KEYS.map((k) => [k, { verdict: 'must', must: ['x'], small: [], design: [] }])) },
  } });
  const text = (t, i) => ({ kind: 'text', text: t, visible: true, box: { x: 300, y: 10 + i, w: 10, h: 10 } });
  const designTexts = ['Knowledge', '0 Only in the design', ...Array.from({ length: 100 }, (_, i) => `Design filler ${i} ${'d'.repeat(100)}`)];
  repo.write({
    '.delivery/widgets/design/KC-04.png': 'png',
    '.delivery/widgets/design/KC-04.dom.json': { elements: [...designTexts.map(text), { kind: 'text', text: 'In the sidebar', visible: true, box: { x: 10, y: 5, w: 10, h: 10 } }] },
    '.delivery/widgets/rounds/2/KC-04.live.txt': ['knowledge', 'Only on the page', ...Array.from({ length: 100 }, (_, i) => `Live filler ${i} ${'l'.repeat(100)}`)].join('\n'),
  });
  const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
  try {
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const dir = join(repo.dir, '.delivery/widgets/rounds/2');
    const plan = JSON.parse(readFileSync(join(dir, 'review-plan.json'), 'utf8'));
    const batches = JSON.parse(readFileSync(join(dir, 'batches.json'), 'utf8')).batches;
    const sent = batches.flatMap((b) => b.items);
    assert.ok(sent.includes('KC-04'));
    assert.ok(Object.keys(plan.carried).length > 0, 'the unchanged items were carried');
    for (const k of sent) {
      const f = join(dir, 'facts', `${k}.md`);
      assert.ok(existsSync(f), `facts for ${k}`);
      assert.ok(bytes(readFileSync(f, 'utf8')) <= FACTS_MAX_BYTES);
    }
    for (const k of KEYS.filter((x) => !sent.includes(x))) assert.equal(existsSync(join(dir, 'facts', `${k}.md`)), false, `no facts for ${k}, which no reviewer gets`);
    const facts = readFileSync(join(dir, 'facts', 'KC-04.md'), 'utf8');
    assert.match(facts, /^# KC-04\n/);
    assert.match(facts, /Buttons missing:\n- Add knowledge/);
    assert.match(facts, /Texts the design shows and the page does not:\n- 0 Only in the design/);
    assert.match(facts, /Texts the page shows and the design does not:\n- Only on the page/);
    assert.doesNotMatch(facts, /In the sidebar/, 'left of the page area');
    assert.doesNotMatch(facts, /- Knowledge\b/, 'case-blind');
    for (const b of batches) {
      assert.match(readFileSync(join(dir, b.prompt), 'utf8'), /Facts: \S*rounds\/2\/facts\/<ITEM>\.md \(read these, not shoot\.json\)/);
    }
  } finally { repo.cleanup(); }
});

test('batchPrompt names the facts folder of the round', () => {
  const p = batchPrompt({ feature: 'widgets', worktree: '/w', roundRel: '.delivery/widgets/rounds/3', items: ['A', 'B'], file: 'review-batch-1.md', steers: '', sorted: {} });
  assert.match(p, /Facts: \.delivery\/widgets\/rounds\/3\/facts\/<ITEM>\.md/);
});

// --- 6. steers -----------------------------------------------------------------------------------

const nf = (over = {}) => ({ designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], ...over });
const nextOf = (f) => pictureNext(f, { cli: 'node scripts/delivery.mjs' });

test('NEXT asks for steers before round 1, and not once they exist or a round has started', () => {
  const s = nextOf(nf({ steersMissing: true }));
  assert.equal(s.step, 'steers');
  assert.match(s.text, /Role: steers.*briefs\/steers\.md.*docs\/delivery\/<f>\/steers\.md/);
  assert.equal(nextOf(nf({ steersMissing: false })).step, 'build');
  assert.equal(nextOf(nf({ steersMissing: true, rounds: [{ round: 1, shot: false }] })).step, 'shoot');
  assert.equal(nextOf(nf({ steersMissing: true, seedStale: true })).step, 'worlds', 'worlds come first');
});

test('an update run gets steers first, then its shoot', () => {
  assert.equal(nextOf(nf({ update: 'knowledge-page', steersMissing: true })).step, 'steers');
  const after = nextOf(nf({ update: 'knowledge-page', steersMissing: false }));
  assert.equal(after.step, 'shoot');
  assert.match(after.text, /update run from knowledge-page/);
});

test('pictureFacts: steersMissing for a page map, cleared by steers.md, never for a components map', async () => {
  const root = mkdtempSync(join(tmpdir(), 'w7-steers-'));
  try {
    const paths = featurePaths(root, 'widgets');
    mkdirSync(paths.deliveryDir, { recursive: true });
    const page = { ...widgetsMap() };
    writeFileSync(join(paths.deliveryDir, 'map.json'), JSON.stringify(page));
    assert.equal((await pictureFacts(paths)).steersMissing, true);
    writeFileSync(join(paths.deliveryDir, 'steers.md'), 'Phone patterns.\n');
    assert.equal((await pictureFacts(paths)).steersMissing, false);
    rmSync(join(paths.deliveryDir, 'steers.md'));
    writeFileSync(join(paths.deliveryDir, 'map.json'), JSON.stringify({ ...page, kind: 'components' }));
    assert.equal((await pictureFacts(paths)).steersMissing, false, 'a components gallery needs none');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an update run\'s carryOver copies steers.md and swaps.json, and keeps the ones the new run has', async () => {
  const root = mkdtempSync(join(tmpdir(), 'w7-carry-'));
  try {
    const fromDir = join(root, 'docs', 'delivery', 'old');
    const toDir = join(root, 'docs', 'delivery', 'new');
    mkdirSync(fromDir, { recursive: true });
    writeFileSync(join(fromDir, 'map.json'), JSON.stringify({ feature: 'old', states: [] }));
    writeFileSync(join(fromDir, 'steers.md'), 'old steers\n');
    writeFileSync(join(fromDir, 'swaps.json'), JSON.stringify({ worlds: { design: { a: 'b' } } }));
    const copied = await carryOver({ fromDir, toDir, feature: 'new', sentence: 's' });
    assert.ok(copied.includes('steers.md') && copied.includes('swaps.json'));
    assert.equal(readFileSync(join(toDir, 'steers.md'), 'utf8'), 'old steers\n');
    assert.deepEqual(JSON.parse(readFileSync(join(toDir, 'swaps.json'), 'utf8')), { worlds: { design: { a: 'b' } } });

    writeFileSync(join(toDir, 'steers.md'), 'new steers\n');
    writeFileSync(join(toDir, 'swaps.json'), '{"worlds":{}}');
    const again = await carryOver({ fromDir, toDir, feature: 'new', sentence: 's' });
    assert.deepEqual(again, []);
    assert.equal(readFileSync(join(toDir, 'steers.md'), 'utf8'), 'new steers\n');
    assert.equal(readFileSync(join(toDir, 'swaps.json'), 'utf8'), '{"worlds":{}}');

    const bare = join(root, 'docs', 'delivery', 'bare');
    const none = await carryOver({ fromDir: join(root, 'docs', 'delivery', 'new'), toDir: bare, feature: 'bare', sentence: 's' });
    assert.ok(none.includes('steers.md'), 'the copy chains to a third run');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- 7. the profile's picture block --------------------------------------------------------------

test('the profile accepts picture.tabBar and picture.keepPhoneHeader, and rejects unknown keys in picture', () => {
  assert.deepEqual(validateProfile(makeProfile({ picture: { tabBar: ['nav.tabs', '[data-tab-bar]'], keepPhoneHeader: true } })), []);
  assert.deepEqual(validateProfile(makeProfile({ picture: {} })), []);
  assert.deepEqual(validateProfile(makeProfile()), []);
  const unknown = validateProfile(makeProfile({ picture: { tabBar: ['nav'], bottomBar: ['x'] } }));
  assert.ok(unknown.length >= 1 && unknown.some((i) => /bottomBar/.test(i.message) || /picture/.test(i.path)), JSON.stringify(unknown));
  assert.ok(validateProfile(makeProfile({ picture: { keepPhoneHeader: 'yes' } })).length >= 1, 'keepPhoneHeader is a boolean');
  assert.ok(validateProfile(makeProfile({ picture: { tabBar: 'nav' } })).length >= 1, 'tabBar is a list');
});
