// W3 data checks: datacheck (a traced value looked for in the live text, a miss sorted by the
// world), the "none" label and the founder's decisions, the clock rule, the source check, and the
// way NEXT, ready and review carry all of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkItem, dataFaultItems, datacheckRound, lookupOf, writeDatacheck } from '../../lib/picture/datacheck.mjs';
import { captureOrder, runShoot, selectStates } from '../../lib/picture/shoot.mjs';
import { buildContract, contractSummary, decideNone, entryProblem } from '../../lib/picture/contract.mjs';
import { clockProblems, validateMap } from '../../lib/picture/map.mjs';
import { selectColumns, selectedColumns, sourceProblems } from '../../lib/picture/sources.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import { pictureReadiness } from '../../lib/run/ready-compute.mjs';
import { batchPrompt, summarise } from '../../lib/picture/review.mjs';
import contractCommand from '../../lib/commands/contract.mjs';
import datacheckCommand from '../../lib/commands/datacheck.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { sampleMap } from './map.test.mjs';

const SEEDED = new Date('2026-01-15T12:00:00.000Z');

// ---- checkItem ----

const data = (text, over = {}) => ({ text, label: 'data', table: 'contacts', column: 'name', ...over });
const check = (entries, liveLines, extra = {}) => checkItem({ contractState: { texts: entries }, liveLines, rows: null, users: [], now: SEEDED, ...extra });

test('checkItem finds a value exactly, inside a longer text, and case- and space-blind', () => {
  assert.equal(check([data('Amina Otieno')], ['Amina Otieno']).faults.length + check([data('Amina Otieno')], ['Amina Otieno']).page.length, 0);
  const inside = check([data('Amina Otieno')], ['Called Amina Otieno yesterday']);
  assert.deepEqual([inside.checked, inside.faults, inside.page], [1, [], []]);
  const loose = check([data('Amina  Otieno')], ['AMINA OTIENO']);
  assert.deepEqual([loose.faults, loose.page], [[], []]);
  const cut = check([data('Amina Otieno', { value: 'Amina' })], ['Hello Amina']);
  assert.deepEqual([cut.faults, cut.page], [[], []], 'a text that wraps a value is found by the value');
});

test('checkItem ignores fixed and random texts, unlabelled ones and entries that cannot be checked', () => {
  const r = check([{ text: 'Save', label: 'fixed' }, { text: '#A81F', label: 'random' }, { text: 'New', label: null }, { text: 'no table', label: 'data' }, { text: 'Gone', label: 'none' }], []);
  assert.deepEqual([r.checked, r.faults, r.page], [0, [], []]);
  assert.deepEqual(checkItem({ contractState: null, liveLines: ['x'], rows: [] }), { checked: 0, faults: [], page: [] });
  assert.deepEqual(checkItem({ contractState: { texts: [data('x')] }, liveLines: null, rows: [] }), { checked: 0, faults: [], page: [] });
});

test('checkItem looks for a swapped value, in the page and in the rows', () => {
  const swaps = { 'ruth@example.com': 'ruth@example.invalid' };
  const email = data('ruth@example.com', { column: 'email' });
  assert.deepEqual(check([email], ['Contact: ruth@example.invalid'], { swaps }).page, []);
  const design = check([email], ['ruth@example.com'], { swaps });
  assert.equal(design.page.length, 1, 'the page shows the design\'s value, which the world never held: not the swapped one');
  // With rows, holds() also uses the swap: the world has the swapped value, so a miss is a page issue, not a data fault.
  const rows = [{ table: 'contacts', values: { email: 'ruth@example.invalid' } }];
  const withRows = check([email], ['nothing here'], { swaps, rows });
  assert.deepEqual([withRows.faults.length, withRows.page.length], [0, 1]);
  const noSwap = check([email], ['nothing here'], { rows });
  assert.deepEqual([noSwap.faults.length, noSwap.page.length], [1, 0], 'without the swap list the world lacks the design\'s value');
});

test('checkItem finds a count as "8 calls", as a bare token, and never inside another number', () => {
  const count = { text: '8 calls', label: 'data', kind: 'count', table: 'calls' };
  const clean = (lines) => { const r = check([count], lines); return r.faults.length + r.page.length === 0; };
  assert.equal(clean(['8 calls']), true);
  assert.equal(clean(['Calls: 8']), true, 'a bare 8');
  assert.equal(clean(['Showing 8 of 20']), true);
  assert.equal(clean(['18']), false);
  assert.equal(clean(['Calls: 18']), false);
  assert.equal(clean(['18 calls']), false, '"8 calls" is not inside "18 calls"');
  assert.equal(clean(['1,8']), false);
  assert.equal(clean(['3.8']), false);
  const thousand = { text: '1,234 calls', label: 'data', kind: 'count', table: 'calls' };
  assert.equal(check([thousand], ['1234 calls this year']).page.length, 0, 'the grouped and the plain form both count');
  assert.equal(check([thousand], ['21,234']).page.length, 1);
});

test('checkItem compares a date by its shape and a generated value by kind', () => {
  const date = data('Tue 14 Oct', { kind: 'date', column: 'created_at' });
  assert.equal(check([date], ['Wed 3 Sep']).page.length, 0);
  assert.equal(check([date], ['14/10/2026']).page.length, 1);
  const time = data('2 min ago', { kind: 'time', column: 'created_at' });
  assert.equal(check([time], ['15 min ago']).page.length, 0);
  const clock = data('10:38 am', { kind: 'time', column: 'created_at' });
  assert.equal(check([clock], ['New orders · WooCommerce · 10:16 pm']).page.length, 0, 'the other half of the day');
  assert.equal(check([clock], ['10:16 PM']).page.length, 0);
  assert.equal(check([clock], ['10:16']).page.length, 1, 'a 24-hour time is a different shape');
  const num = { text: '92%', label: 'data', kind: 'generated', shape: 'number' };
  assert.equal(check([num], ['score 7']).page.length, 0);
  assert.equal(check([num], ['no digits here']).page.length, 1);
  const txt = { text: 'Asked about renewals', label: 'data', kind: 'generated', shape: 'text' };
  assert.equal(check([txt], ['Something else entirely']).page.length, 0);
  assert.equal(check([txt], ['', '  ']).page.length, 1, 'no text on the page at all');
});

test('checkItem finds a fixture user by name or initials', () => {
  const users = [{ role: 'admin', name: 'Sam Kariuki' }, { role: 'member' }];
  const name = { text: 'Sam Kariuki', label: 'data', user: 'admin' };
  const init = { text: 'SK', label: 'data', user: 'admin', field: 'initials' };
  assert.deepEqual(check([name, init], ['Welcome, Sam Kariuki', 'SK'], { users }).page, []);
  const miss = check([name, init], ['Welcome'], { users });
  assert.deepEqual([miss.faults.length, miss.page.length], [0, 2], 'no rows and no row keys: each miss is a page issue');
  assert.match(miss.page[0].why, /the admin fixture user/);
});

test('checkItem with rows: a miss the world lacks is a data fault, one the world holds is for the page', () => {
  const rows = [{ table: 'contacts', values: { name: 'Amina Otieno' } }, { table: 'calls', values: { status: 'done' } }];
  const r = check([data('Amina Otieno'), data('Brian Mwangi'), { text: '8 calls', label: 'data', kind: 'count', table: 'calls' }], ['Nothing'], { rows });
  assert.equal(r.checked, 3);
  assert.deepEqual(r.page.map((p) => p.text), ['Amina Otieno']);
  assert.match(r.page[0].why, /the world holds it \(contacts\.name; found by datacheck\)/);
  assert.deepEqual(r.faults.map((f) => f.text), ['Brian Mwangi', '8 calls']);
  assert.match(r.faults[0].why, /no contacts row has name = "Brian Mwangi".*fix the world file, not the code/);
  assert.match(r.faults[1].why, /1 calls row\(s\), and the design shows 8/);
  const users = check([{ text: 'Sam Kariuki', label: 'data', user: 'admin' }], ['x'], { rows, users: [{ role: 'admin', name: 'Jo Kim' }] });
  assert.match(users.faults[0].why, /the admin fixture user is "Jo Kim"/);
});

test('checkItem without rows: a miss whose row the page otherwise shows is a data fault, else a page issue', () => {
  const entries = [data('Amina Otieno', { row: 'c1' }), data('amina@x.com', { column: 'email', row: 'c1' }), data('Brian Mwangi', { row: 'c2' }), data('Loose')];
  const r = check(entries, ['Amina Otieno', 'other']);
  assert.deepEqual(r.faults.map((f) => f.text), ['amina@x.com'], 'the row is shown, this value of it is not');
  assert.match(r.faults[0].why, /shows the rest of row c1 without it/);
  assert.deepEqual(r.page.map((p) => p.text), ['Brian Mwangi', 'Loose'], 'nothing of the row is shown, or there is no row key');
  assert.match(r.page[0].why, /shows nothing of its row/);
});

test('lookupOf turns a result into the notes the review compiles', () => {
  assert.equal(lookupOf({ checked: 3, faults: [], page: [] }), null);
  assert.deepEqual(lookupOf({ checked: 3, faults: [{ text: 'a', why: 'fa' }], page: [{ text: 'b', why: 'pb' }] }), { dataFault: ['fa'], must: ['pb'] });
});

// ---- datacheckRound, writeDatacheck, dataFaultItems ----

const textEl = (text) => ({ kind: 'text', text, visible: true, box: { x: 10, y: 10, w: 10, h: 10 } });

function widgetsMap(over = {}) {
  return {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [
      { id: 'design', users: [{ role: 'admin', email: 'delivery+w-design-admin@example.invalid', name: 'Sam Kariuki' }] },
      { id: 'messy', users: [{ role: 'admin', email: 'delivery+w-messy-admin@example.invalid' }] },
    ],
    states: [
      { id: 'WL-01', screen: 'Widgets', name: 'list', buttons: [], reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } },
      { id: 'WL-02', screen: 'Widgets', name: 'saved', buttons: [], reach: { world: 'design', role: 'admin', writes: true, steps: [{ goto: '/dashboard/widgets' }] } },
      { id: 'WL-03', screen: 'Widgets', name: 'messy', buttons: [], reach: { world: 'messy', role: 'admin', steps: [{ goto: '/dashboard/widgets' }] } },
    ],
    ...over,
  };
}

function scratch(prefix = 'datacheck-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const CONTRACT = { states: {
  'WL-01': { texts: [
    { text: 'Amina Otieno', label: 'data', table: 'contacts', column: 'name' },
    { text: 'Brian Mwangi', label: 'data', table: 'contacts', column: 'name' },
    { text: 'Widgets', label: 'fixed' },
  ] },
  'WL-02': { texts: [{ text: 'Sam Kariuki', label: 'data', user: 'admin' }] },
  'WL-03': { texts: [{ text: 'Carol', label: 'data', table: 'contacts', column: 'name' }] },
} };

test('datacheckRound reads each reached item\'s live text and its world\'s seeded rows, and skips the rest', () => {
  const d = scratch();
  try {
    writeFileSync(join(d.root, 'seeded.json'), JSON.stringify({ design: { at: SEEDED.toISOString(), rows: [{ table: 'contacts', values: { name: 'Amina Otieno' } }], users: [{ role: 'admin', name: 'Sam Kariuki' }] } }));
    writeFileSync(join(d.root, 'WL-01.live.txt'), 'Widgets\nNothing else\n');
    writeFileSync(join(d.root, 'WL-02.live.txt'), 'Hello, Sam Kariuki\n');
    writeFileSync(join(d.root, 'WL-03.live.txt'), 'x\n'); // not reached: skipped
    const shoot = { states: { 'WL-01': { reached: true }, 'WL-02': { reached: true }, 'WL-03': { reached: false } } };
    const r = datacheckRound({ map: widgetsMap(), contract: CONTRACT, shoot, roundDir: d.root });
    assert.deepEqual(Object.keys(r.items), ['WL-01', 'WL-02']);
    assert.deepEqual([r.checked, r.faults, r.page], [3, 1, 1]);
    assert.deepEqual(r.items['WL-01'].faults.map((f) => f.text), ['Brian Mwangi'], 'the world lacks it');
    assert.deepEqual(r.items['WL-01'].page.map((f) => f.text), ['Amina Otieno'], 'the world holds it, the page does not show it');
    assert.deepEqual(r.items['WL-02'].page, [], 'the fixture user\'s name is on the page');
  } finally { d.cleanup(); }
});

test('datacheckRound without seeded.json sorts by the traced row, and uses the map\'s fixture users', () => {
  const d = scratch();
  try {
    writeFileSync(join(d.root, 'WL-02.live.txt'), 'Hello\n');
    const shoot = { states: { 'WL-02': { reached: true } }, at: SEEDED.toISOString() };
    const r = datacheckRound({ map: widgetsMap(), contract: CONTRACT, shoot, roundDir: d.root });
    assert.equal(r.items['WL-02'].page.length, 1, 'no rows: a row-less miss goes to the reviewers');
    assert.equal(r.faults, 0);
  } finally { d.cleanup(); }
});

test('datacheckRound looks for the swapped value of a world', () => {
  const d = scratch();
  try {
    const contract = { states: { 'WL-01': { texts: [{ text: 'ruth@example.com', label: 'data', table: 'contacts', column: 'email' }] } } };
    writeFileSync(join(d.root, 'WL-01.live.txt'), 'ruth@example.invalid\n');
    const shoot = { states: { 'WL-01': { reached: true } } };
    const swaps = { design: { 'ruth@example.com': 'ruth@example.invalid' } };
    assert.deepEqual([datacheckRound({ map: widgetsMap(), contract, shoot, roundDir: d.root, swaps }).faults, datacheckRound({ map: widgetsMap(), contract, shoot, roundDir: d.root, swaps }).page], [0, 0]);
    assert.equal(datacheckRound({ map: widgetsMap(), contract, shoot, roundDir: d.root }).page, 1);
  } finally { d.cleanup(); }
});

test('writeDatacheck writes the counts, the items with a miss and the sources', async () => {
  const d = scratch();
  try {
    const shoot = { states: {
      'WL-01': { lookup: { dataFault: ['gap one'], must: ['must one'] } },
      'WL-02': { lookup: { dataFault: [], must: ['must two'] } },
      'WL-03': { lookup: { dataGap: ['older gap'] } }, // an older round's name
      'WL-04': {},
    } };
    const sources = [{ table: 'calls', column: 'status', states: ['WL-01'], texts: ['Done'], why: 'no query selects status' }];
    const doc = await writeDatacheck(d.root, shoot, '2026-01-15T12:00:00.000Z', sources);
    assert.deepEqual(Object.keys(doc.items), ['WL-01', 'WL-02', 'WL-03']);
    assert.deepEqual([doc.schemaVersion, doc.at, doc.faults, doc.must], [1, '2026-01-15T12:00:00.000Z', 2, 2]);
    assert.deepEqual(doc.items['WL-03'], { dataFault: ['older gap'], must: [] });
    assert.deepEqual(doc.sources, sources);
    assert.deepEqual(JSON.parse(readFileSync(join(d.root, 'datacheck.json'), 'utf8')), doc);
    const none = await writeDatacheck(d.root, { states: {} }, 't');
    assert.equal('sources' in none, false);
    assert.deepEqual([none.faults, none.must, none.items], [0, 0, {}]);
  } finally { d.cleanup(); }
});

test('dataFaultItems lists items with a data fault or an older round\'s data gap', () => {
  const shoot = { states: { A: { lookup: { dataFault: ['x'] } }, B: { lookup: { dataGap: ['y'] } }, C: { lookup: { dataFault: [], must: ['z'] } }, D: {} } };
  assert.deepEqual(dataFaultItems(shoot), ['A', 'B']);
  assert.deepEqual(dataFaultItems(null), []);
});

// ---- shoot: capture order and the reset before each saving state ----

function savesMap() {
  const m = widgetsMap();
  m.states.push({ id: 'WL-04', screen: 'Widgets', name: 'saved again', buttons: [], reach: { world: 'design', role: 'admin', writes: true, steps: [{ goto: '/dashboard/widgets' }] } });
  m.states.push({ id: 'WL-05', screen: 'Widgets', name: 'saved thrice', buttons: [], reach: { world: 'design', role: 'admin', writes: true, steps: [{ goto: '/dashboard/widgets' }] } });
  return m;
}

test('capture order: each saving state is its own entry; the first may join the reading entry; every writing entry but the last re-seeds after', () => {
  const m = savesMap();
  const two = captureOrder(selectStates(m, ['WL-01', 'WL-02', 'WL-04']).items, m);
  assert.deepEqual(two.map((e) => [e.items.map((i) => i.key), e.writes, e.reseedAfter]), [
    [['WL-01', 'WL-02'], ['WL-02'], true],
    [['WL-04'], ['WL-04'], undefined],
  ]);
  const three = captureOrder(selectStates(m, ['WL-02', 'WL-04', 'WL-05']).items, m);
  assert.deepEqual(three.map((e) => [e.items.map((i) => i.key), e.reseedAfter]), [[['WL-02'], true], [['WL-04'], true], [['WL-05'], undefined]]);
});

test('capture order at two widths: saving states of both widths stay separate, desktop first', () => {
  const m = savesMap();
  m.widths = ['desktop', 'phone'];
  const order = captureOrder(selectStates(m, ['WL-02', 'WL-04']).items, m);
  assert.deepEqual(order.map((e) => `${e.width}: ${e.items.map((i) => i.key).join(' ')}`), ['desktop: WL-02', 'desktop: WL-04', 'phone: WL-02@phone', 'phone: WL-04@phone']);
  assert.deepEqual(order.map((e) => e.reseedAfter), [true, true, true, undefined]);
});

/** A Playwright-shaped stub: records the order of events; each page shows `liveTexts`. */
function fakeChromium({ calls, liveTexts = [] }) {
  const page = {
    async goto(u) { page._url = u; },
    url: () => page._url,
    async unrouteAll() {},
    async route() {},
    async setViewportSize() {},
    async waitForTimeout() {},
    async waitForLoadState() {},
    locator() { return { first: () => ({ async isVisible() { return false; } }) }; },
    async evaluate(fn) {
      if (fn.name === 'pageExtract') return { dom: { elements: liveTexts.map(textEl) } };
      return 0;
    },
    async screenshot(opts) { calls.push(`shoot ${opts.path.split('/').pop()}`); writeFileSync(opts.path, 'png'); },
  };
  return {
    async launch() {
      return {
        async newContext() { return { clock: { async setFixedTime() {} }, async newPage() { return page; }, async storageState() {}, async close() {} }; },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

function shootDirs() {
  const s = scratch('datacheck-shoot-');
  const outDir = join(s.root, 'round');
  const designDir = join(s.root, 'design');
  mkdirSync(designDir, { recursive: true });
  return { root: s.root, outDir, designDir, cleanup: s.cleanup };
}

const shootOpts = (o) => ({ baseUrl: 'http://localhost:3000', sessionsDir: join(o.outDir, 'sessions'), magicLinkPath: '/auth/confirm', auth: { signInHash: async () => 'hash' }, log: () => {}, diffPictures: async () => 0, ...o });

test('the world is reset before each saving state, not once for all of them', async () => {
  const m = savesMap();
  const { items } = selectStates(m, ['WL-01', 'WL-02', 'WL-04', 'WL-05']);
  const d = shootDirs();
  try {
    const calls = [];
    await runShoot(shootOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, chromium: fakeChromium({ calls }),
      reset: async (world) => { calls.push(`reset ${world}`); return { at: SEEDED, rows: [], users: [] }; },
    }));
    assert.deepEqual(calls.filter((c) => /^(reset|shoot)/.test(c)), [
      'reset design', 'shoot WL-01.live.png', 'shoot WL-02.live.png',
      'reset design', 'shoot WL-04.live.png',
      'reset design', 'shoot WL-05.live.png',
    ]);
  } finally { d.cleanup(); }
});

test('the shoot saves each item\'s live text and the worlds as seeded, and records its datacheck on the item', async () => {
  const m = widgetsMap();
  const { items } = selectStates(m, ['WL-01', 'WL-03']);
  const d = shootDirs();
  try {
    const rows = [{ table: 'contacts', values: { name: 'Amina Otieno' } }];
    const users = [{ role: 'admin', name: 'Sam Kariuki' }];
    const report = await runShoot(shootOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, contract: CONTRACT,
      chromium: fakeChromium({ calls: [], liveTexts: ['Widgets', 'Amina Otieno'] }),
      reset: async (world) => ({ at: SEEDED, rows: world === 'design' ? rows : [], users }),
    }));
    assert.equal(readFileSync(join(d.outDir, 'WL-01.live.txt'), 'utf8'), 'Amina Otieno\nWidgets\n');
    assert.ok(existsSync(join(d.outDir, 'WL-03.live.txt')));
    const seeded = JSON.parse(readFileSync(join(d.outDir, 'seeded.json'), 'utf8'));
    assert.deepEqual(Object.keys(seeded).sort(), ['design', 'messy']);
    assert.deepEqual(seeded.design, { at: SEEDED.toISOString(), rows, users });
    // WL-01: Amina is shown; Brian is in no world row: one data fault.
    assert.deepEqual(report['WL-01'].datacheck, { checked: 2, faults: 1, page: 0 });
    assert.match(report['WL-01'].lookup.dataFault[0], /"Brian Mwangi": no contacts row has name = "Brian Mwangi"/);
    assert.deepEqual(report['WL-01'].lookup.must, []);
    // WL-03 is in the messy world, whose rows are empty: Carol is missing from the page and the world.
    assert.deepEqual(report['WL-03'].datacheck, { checked: 1, faults: 1, page: 0 });
  } finally { d.cleanup(); }
});

test('without a contract the shoot still saves live text but records no datacheck', async () => {
  const m = widgetsMap();
  const { items } = selectStates(m, ['WL-01']);
  const d = shootDirs();
  try {
    const report = await runShoot(shootOpts({ map: m, items, outDir: d.outDir, designDir: d.designDir, chromium: fakeChromium({ calls: [], liveTexts: ['Widgets'] }) }));
    assert.ok(existsSync(join(d.outDir, 'WL-01.live.txt')));
    assert.equal(report['WL-01'].datacheck, undefined);
    assert.equal(existsSync(join(d.outDir, 'seeded.json')), false, 'no reset, no worlds to record');
  } finally { d.cleanup(); }
});

// ---- the contract: the "none" label ----

test('entryProblem: a "none" value may carry a decision, and only a known one', () => {
  assert.equal(entryProblem({ text: 'x', label: 'none' }), null);
  assert.equal(entryProblem({ text: 'x', label: 'none', decision: 'drop' }), null);
  assert.equal(entryProblem({ text: 'x', label: 'none', decision: 'build' }), null);
  assert.equal(entryProblem({ text: 'x', label: 'none', decision: 'design' }), null);
  assert.match(entryProblem({ text: 'x', label: 'none', decision: 'maybe' }), /decision "maybe" is not one of build, drop, design/);
});

test('entryProblem: a generated value and a row key are checked', () => {
  assert.equal(entryProblem({ text: 'x', label: 'data', kind: 'generated' }), null, 'a generated value needs no table');
  assert.equal(entryProblem({ text: 'x', label: 'data', kind: 'generated', shape: 'number', table: 'calls' }), null);
  assert.match(entryProblem({ text: 'x', label: 'data', kind: 'generated', shape: 'colour' }), /shape "colour" is not one of text, number/);
  assert.match(entryProblem({ text: 'x', label: 'data', kind: 'generated', table: 'Bad Table' }), /table must be a table name/);
  assert.match(entryProblem({ text: 'x', label: 'data', table: 'calls', column: 'a', row: '' }), /row must be a non-empty string/);
  assert.match(entryProblem({ text: 'x', label: 'data', table: 'calls', column: 'a', row: 5 }), /row must be a non-empty string/);
  assert.equal(entryProblem({ text: 'x', label: 'data', table: 'calls', column: 'a', row: 'r1' }), null);
});

function noneContract() {
  return { states: {
    'KC-05': { texts: [
      { text: 'Lead score 82', label: 'none', why: 'not stored' },
      { text: 'Sentiment', label: 'none' },
      { text: 'Old note', label: 'none', decision: 'design' },
      { text: 'Save', label: 'fixed' },
    ] },
    'KC-04': { texts: [{ text: 'Sentiment', label: 'none' }, { text: 'Streak', label: 'none' }] },
  } };
}

test('contractSummary lists undecided and decided "none" values', () => {
  const s = contractSummary(noneContract());
  assert.equal(s.none, 5);
  assert.deepEqual(s.undecided.map((u) => `${u.state}: ${u.text}`), ['KC-05: Lead score 82', 'KC-05: Sentiment', 'KC-04: Sentiment', 'KC-04: Streak']);
  assert.equal(s.undecided[0].why, 'not stored');
  assert.deepEqual(s.decided, [{ state: 'KC-05', text: 'Old note', why: null, decision: 'design' }]);
  const done = noneContract();
  decideNone(done, { state: 'all', decision: 'drop' });
  const after = contractSummary(done);
  assert.deepEqual([after.undecided.length, after.decided.length], [0, 5]);
});

test('decideNone: one text of a state, the whole state, or all; a bad decision throws', () => {
  const c = noneContract();
  assert.equal(decideNone(c, { state: 'KC-05', text: '  LEAD score 82 ', decision: 'build', note: 'the product gains it' }), 1);
  assert.deepEqual([c.states['KC-05'].texts[0].decision, c.states['KC-05'].texts[0].decisionNote], ['build', 'the product gains it']);
  assert.equal(c.states['KC-05'].texts[1].decision, undefined);
  assert.equal(decideNone(c, { state: 'KC-05', decision: 'drop' }), 1, 'the whole state: only what is undecided, so "Old note" stays');
  assert.equal(c.states['KC-05'].texts[2].decision, 'design');
  assert.equal(c.states['KC-04'].texts[0].decision, undefined);
  assert.equal(decideNone(c, { state: 'all', decision: 'design' }), 2);
  assert.equal(contractSummary(c).undecided.length, 0);
  assert.equal(decideNone(c, { state: 'all', decision: 'design' }), 0, 'nothing left to decide');
  assert.equal(decideNone(c, { state: 'NOPE', decision: 'drop' }), 0);
  assert.throws(() => decideNone(noneContract(), { state: 'all', decision: 'maybe' }), /decision "maybe" is not one of build, drop, design/);
});

test('buildContract keeps a decision when the labeller\'s file labels the text none again without one', () => {
  const previous = { states: { 'KC-05': { texts: [{ text: 'Lead score 82', label: 'none', decision: 'drop', decisionNote: 'cut' }, { text: 'Streak', label: 'none' }] } } };
  const labels = { states: { 'KC-05': [{ text: 'Lead score 82', label: 'none', why: 'not stored' }, { text: 'Streak', label: 'none', why: 'not stored' }] } };
  const r = buildContract({ texts: new Map([['KC-05', ['Lead score 82', 'Streak']]]), previous, labels, at: 't' });
  const [kept, fresh] = r.contract.states['KC-05'].texts;
  assert.deepEqual([kept.label, kept.decision, kept.decisionNote], ['none', 'drop', 'cut']);
  assert.equal(fresh.decision, undefined, 'an undecided one stays undecided');
  // A relabel from data to none is a new question: the old decision belonged to a none label only.
  const was = { states: { 'KC-05': { texts: [{ text: 'Streak', label: 'data', table: 'calls', column: 'n' }] } } };
  const again = buildContract({ texts: new Map([['KC-05', ['Streak']]]), previous: was, labels: { states: { 'KC-05': [{ text: 'Streak', label: 'none' }] } }, at: 't' });
  assert.equal(again.contract.states['KC-05'].texts[0].decision, undefined);
  // The labeller's own decision, when it gives one, wins.
  const own = buildContract({ texts: new Map([['KC-05', ['Lead score 82']]]), previous, labels: { states: { 'KC-05': [{ text: 'Lead score 82', label: 'none', decision: 'build' }] } }, at: 't' });
  assert.equal(own.contract.states['KC-05'].texts[0].decision, 'build');
});

// ---- delivery contract --questions and --decide ----

async function contractSetup(contract) {
  const repo = makeTempRepo({ files: { 'docs/delivery/knowledge-page/map.json': sampleMap(), 'docs/delivery/knowledge-page/contract.json': contract } });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'knowledge-page', clock: fakeClock(SEEDED.toISOString()) });
  const dir = join(repo.dir, 'docs', 'delivery', 'knowledge-page');
  return { repo, ...t, dir };
}

test('contract --questions writes questions.md and questions.json listing the undecided values', async () => {
  const { repo, ctx, stdout, dir } = await contractSetup(noneContract());
  try {
    assert.equal(await contractCommand.run(ctx, ['--questions']), 0);
    const md = readFileSync(join(dir, 'questions.md'), 'utf8');
    assert.match(md, /Values the design shows that the product does not store/);
    assert.match(md, /- KC-05: "Lead score 82" \(not stored\)/);
    assert.match(md, /- KC-04: "Streak"/);
    assert.doesNotMatch(md, /Old note/, 'a decided value is not asked again');
    const q = JSON.parse(readFileSync(join(dir, 'questions.json'), 'utf8'));
    assert.deepEqual(q.values, ['KC-05\0Lead score 82', 'KC-05\0Sentiment', 'KC-04\0Sentiment', 'KC-04\0Streak']);
    assert.match(stdout.text(), /send it to the founder in one message/);
  } finally { repo.cleanup(); }
});

test('contract --questions with nothing to ask says so', async () => {
  const { repo, ctx, dir } = await contractSetup({ states: { 'KC-05': { texts: [{ text: 'Save', label: 'fixed' }] } } });
  try {
    assert.equal(await contractCommand.run(ctx, ['--questions']), 0);
    assert.match(readFileSync(join(dir, 'questions.md'), 'utf8'), /Nothing to ask\./);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'questions.json'), 'utf8')).values, []);
  } finally { repo.cleanup(); }
});

test('contract --decide records the founder\'s answer and exits 0; deciding nothing exits 1', async () => {
  const { repo, ctx, stdout, dir } = await contractSetup(noneContract());
  try {
    assert.equal(await contractCommand.run(ctx, ['--decide', 'drop', '--state', 'KC-05', '--text', 'Lead score 82', '--note', 'not for v1']), 0);
    const written = JSON.parse(readFileSync(join(dir, 'contract.json'), 'utf8'));
    assert.deepEqual([written.states['KC-05'].texts[0].decision, written.states['KC-05'].texts[0].decisionNote], ['drop', 'not for v1']);
    assert.equal(written.states['KC-05'].texts[1].decision, undefined);
    assert.match(stdout.text(), /decided 1 value\(s\): drop; add a cut rule/);
    // Once decided, asking again for that text decides nothing (it is not "undecided"... a named text is decided again, so name one that does not exist).
    assert.equal(await contractCommand.run(ctx, ['--decide', 'drop', '--state', 'KC-05', '--text', 'No such text']), 1);
    assert.equal(await contractCommand.run(ctx, ['--decide', 'build', '--state', 'all']), 0);
    assert.equal(contractSummary(JSON.parse(readFileSync(join(dir, 'contract.json'), 'utf8'))).undecided.length, 0);
    assert.equal(await contractCommand.run(ctx, ['--decide', 'build', '--state', 'all']), 1, 'nothing left undecided');
    assert.match(stdout.text(), /no undecided "none" value in all/);
    await assert.rejects(contractCommand.run(ctx, ['--decide', 'maybe', '--state', 'all']), /--decide takes build, drop, design/);
    await assert.rejects(contractCommand.run(ctx, ['--decide', 'drop']), /--decide needs --state/);
  } finally { repo.cleanup(); }
});

// ---- delivery datacheck, end to end ----

async function datacheckSetup({ live, rows }) {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': widgetsMap(),
    'docs/delivery/widgets/contract.json': CONTRACT,
    '.delivery/widgets/rounds/1/shoot.json': { schemaVersion: 1, at: SEEDED.toISOString(), states: {
      'WL-01': { reached: true, problems: [], buttons: [], lookup: { dataFault: ['stale fault from the shoot'], must: [] } },
      'WL-02': { reached: true, problems: [], buttons: [] },
      'WL-03': { reached: false, problems: ['not reached'], buttons: [] },
    } },
    '.delivery/widgets/rounds/1/seeded.json': { design: { at: SEEDED.toISOString(), rows, users: [{ role: 'admin', name: 'Sam Kariuki' }] } },
    '.delivery/widgets/rounds/1/WL-01.live.txt': live,
    '.delivery/widgets/rounds/1/WL-02.live.txt': 'Hello, Sam Kariuki\n',
  } });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', clock: fakeClock('2026-01-15T13:00:00.000Z') });
  return { repo, ...t, dir: join(repo.dir, '.delivery', 'widgets', 'rounds', '1') };
}

test('delivery datacheck exits 1 with data faults, rewrites the lookups in shoot.json and writes datacheck.json', async () => {
  const { repo, ctx, stdout, dir } = await datacheckSetup({ live: 'Widgets\nAmina Otieno\n', rows: [{ table: 'contacts', values: { name: 'Amina Otieno' } }] });
  try {
    assert.equal(await datacheckCommand.run(ctx, []), 1);
    const shoot = JSON.parse(readFileSync(join(dir, 'shoot.json'), 'utf8'));
    assert.equal(shoot.states['WL-01'].lookup.dataFault.length, 1);
    assert.match(shoot.states['WL-01'].lookup.dataFault[0], /"Brian Mwangi": no contacts row has name = "Brian Mwangi"/);
    assert.notEqual(shoot.states['WL-01'].lookup.dataFault[0], 'stale fault from the shoot', 'the old lookup is replaced');
    assert.deepEqual(shoot.states['WL-01'].datacheck, { checked: 2, faults: 1, page: 0 });
    assert.deepEqual(shoot.states['WL-02'].datacheck, { checked: 1, faults: 0, page: 0 });
    assert.equal(shoot.states['WL-02'].lookup, undefined);
    assert.equal(shoot.states['WL-03'].datacheck, undefined, 'not reached: not checked');
    const doc = JSON.parse(readFileSync(join(dir, 'datacheck.json'), 'utf8'));
    assert.deepEqual([doc.schemaVersion, doc.at, doc.faults, doc.must], [1, '2026-01-15T13:00:00.000Z', 1, 0]);
    assert.deepEqual(Object.keys(doc.items), ['WL-01']);
    // The temp repository has no queries at all, so the traced table has no source.
    assert.deepEqual(doc.sources.map((x) => [x.table, x.column, x.why]), [['contacts', 'name', 'no query in the code reads contacts']]);
    assert.match(stdout.text(), /round 1: 3 traced value\(s\) looked for in 2 item\(s\); 1 data fault\(s\) in 1 item\(s\), 0 value\(s\) the page does not show/);
    assert.match(stdout.text(), /WL-01: data fault: the design shows "Brian Mwangi"/);
    assert.match(stdout.text(), /next: dispatch the seed-writer/);
    assert.deepEqual(dataFaultItems(shoot), ['WL-01']);
  } finally { repo.cleanup(); }
});

test('delivery datacheck exits 0 when every traced value is on the page, and clears an older lookup', async () => {
  const { repo, ctx, stdout, dir } = await datacheckSetup({ live: 'Widgets\nAmina Otieno\nBrian Mwangi\n', rows: [] });
  try {
    assert.equal(await datacheckCommand.run(ctx, ['--round', '1']), 0);
    const shoot = JSON.parse(readFileSync(join(dir, 'shoot.json'), 'utf8'));
    assert.equal(shoot.states['WL-01'].lookup, undefined);
    assert.deepEqual(shoot.states['WL-01'].datacheck, { checked: 2, faults: 0, page: 0 });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'datacheck.json'), 'utf8')).items, {});
    assert.deepEqual(dataFaultItems(shoot), []);
    assert.doesNotMatch(stdout.text(), /next: dispatch the seed-writer/);
  } finally { repo.cleanup(); }
});

test('delivery datacheck sorts a miss the world holds as a must fix, and exits 0', async () => {
  const { repo, ctx, dir } = await datacheckSetup({ live: 'Widgets\n', rows: [{ table: 'contacts', values: { name: 'Amina Otieno' } }, { table: 'contacts', values: { name: 'Brian Mwangi' } }] });
  try {
    assert.equal(await datacheckCommand.run(ctx, []), 0, 'the page is wrong, not the world: no data fault');
    const shoot = JSON.parse(readFileSync(join(dir, 'shoot.json'), 'utf8'));
    assert.equal(shoot.states['WL-01'].lookup.must.length, 2);
    assert.deepEqual(shoot.states['WL-01'].lookup.dataFault, []);
    assert.equal(JSON.parse(readFileSync(join(dir, 'datacheck.json'), 'utf8')).must, 1);
  } finally { repo.cleanup(); }
});

test('delivery datacheck exits 2 without a map, a contract or a shot round', async () => {
  const bare = makeTempRepo({ files: {} });
  try {
    const t = await makeTestCtx({ repoRoot: bare.dir, feature: 'widgets' });
    assert.equal(await datacheckCommand.run(t.ctx, []), 2);
  } finally { bare.cleanup(); }
  const noContract = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': widgetsMap() } });
  try {
    const t = await makeTestCtx({ repoRoot: noContract.dir, feature: 'widgets' });
    assert.equal(await datacheckCommand.run(t.ctx, []), 2);
  } finally { noContract.cleanup(); }
  const noRound = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': widgetsMap(), 'docs/delivery/widgets/contract.json': CONTRACT } });
  try {
    const t = await makeTestCtx({ repoRoot: noRound.dir, feature: 'widgets' });
    await assert.rejects(datacheckCommand.run(t.ctx, []), /no round has been shot yet/);
  } finally { noRound.cleanup(); }
});

// ---- NEXT ----

const BASE = { rulesOwed: false, owedDesignRules: [], designed: 3, hasMap: true, mapError: null, guardsToApprove: [], pageBlockedComponents: [], phoneRenderOwed: false, checklistStale: false, contractMissing: false, contractTodo: 0, seedStale: false, rounds: [] };
const next = (f) => pictureNext({ ...BASE, ...f }, { cli: 'delivery' });
const shot = (over = {}) => ({ round: 1, shot: true, dataFaults: 0, dataFixPasses: 0, reshot: 0, pending: 0, reviews: 0, planned: null, compiled: false, ...over });

test('NEXT asks the founder once about values the product does not store', () => {
  const asked = next({ undecided: 2, questionsAsked: false });
  assert.equal(asked.step, 'questions');
  assert.match(asked.text, /delivery contract --questions.*2 value\(s\) the product does not store.*delivery contract --decide/);
  assert.notEqual(next({ undecided: 2, questionsAsked: true }).step, 'questions');
  assert.equal(next({ undecided: 2, questionsAsked: true }).step, 'build');
  assert.equal(next({ undecided: 0, questionsAsked: false }).step, 'build');
});

test('NEXT sends data faults to the seed-writer before any reviewer sees the round, twice at most', () => {
  const n = next({ rounds: [shot({ dataFaults: 2 })] });
  assert.equal(n.step, 'data-faults');
  assert.match(n.text, /datacheck found data faults in 2 item\(s\) before review.*--only data-faults/);
  assert.equal(next({ rounds: [shot({ dataFaults: 2, dataFixPasses: 1 })] }).step, 'data-faults');
  assert.equal(next({ rounds: [shot({ dataFaults: 2, dataFixPasses: 2 })] }).step, 'review', 'two passes spent: the reviewers see it');
  assert.equal(next({ rounds: [shot({ dataFaults: 2, reviews: 1, planned: 1, pending: 1 })] }).step, 'review', 'a reviewed round is not sent back');
  assert.equal(next({ rounds: [shot({ dataFaults: 0 })] }).step, 'review');
  assert.equal(next({ rounds: [shot({ shot: false })] }).step, 'shoot');
});

test('NEXT never says ship for a round whose only open items are data', () => {
  const compiled = (counts, f = {}) => next({ rounds: [shot({ reviews: 1, planned: 1, compiled: true, dataFixPasses: 2, counts })], ...f });
  const dataOnly = compiled({ match: 3, small: 0, must: 0, notReached: 0, dataFault: 1, dataGap: 0 }, { open: { must: 0, notReached: 0, data: 1 } });
  assert.equal(dataOnly.step, 'data-faults');
  assert.match(dataOnly.text, /1 state\(s\) have a data fault or gap and nothing else/);
  const fromCounts = compiled({ match: 3, small: 0, must: 0, notReached: 0, dataFault: 0, dataGap: 2 });
  assert.equal(fromCounts.step, 'data-faults', 'read from the round\'s own counts when no latest verdicts are known');
  assert.equal(compiled({ match: 4, small: 0, must: 0, notReached: 0, dataFault: 0, dataGap: 0 }).step, 'ship');
  const mustToo = compiled({ match: 3, small: 0, must: 1, notReached: 0, dataFault: 1, dataGap: 0 }, { open: { must: 1, notReached: 0, data: 1 } });
  assert.equal(mustToo.step, 'fix', 'a code defect is fixed first');
});

test('NEXT sends open needs to the seed-writer', () => {
  const n = next({ needs: 2 });
  assert.equal(n.step, 'worlds');
  assert.match(n.text, /2 open need\(s\).*needs\.json.*seed --need-done/);
  assert.equal(next({ needs: 0 }).step, 'build');
});

// ---- ready ----

function tmpRun() {
  const root = mkdtempSync(join(tmpdir(), 'delivery-datacheck-run-'));
  const runDir = join(root, '.delivery', 'f');
  const paths = { runDir, deliveryDir: join(root, 'docs', 'delivery', 'f'), designRenders: join(runDir, 'design'), seedplan: join(runDir, 'seedplan.json') };
  mkdirSync(paths.deliveryDir, { recursive: true });
  const round = (n, states) => {
    const dir = join(runDir, 'rounds', String(n));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'shoot.json'), JSON.stringify({ states: {} }));
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ states: Object.fromEntries(Object.entries(states).map(([k, verdict]) => [k, { verdict }])) }));
  };
  const contract = (c) => writeFileSync(join(paths.deliveryDir, 'contract.json'), JSON.stringify(c));
  return { root, paths, round, contract, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('ready: a data-fault verdict keeps it red, even with no fix round left', async () => {
  const r = tmpRun();
  try {
    r.round(1, { 'KC-05': 'data-fault', 'KC-04': 'match' });
    r.round(2, { 'KC-05': 'data-fault' });
    r.round(3, { 'KC-05': 'data-fault' });
    const red = await pictureReadiness(r.paths);
    assert.equal(red.ok, false);
    assert.match(red.detail, /1 state\(s\) have a data fault or gap, not a code defect.*--only data-faults: KC-05 \(round 3\)/);
    r.round(4, { 'KC-05': 'match' });
    assert.equal((await pictureReadiness(r.paths)).ok, true, 'the world fixed and the item re-shot');
  } finally { r.cleanup(); }
});

test('ready: an undecided "none" value keeps it red until the founder decides', async () => {
  const r = tmpRun();
  try {
    r.round(1, { 'KC-05': 'match', 'KC-04': 'small' });
    r.contract(noneContract());
    const red = await pictureReadiness(r.paths);
    assert.equal(red.ok, false);
    assert.match(red.detail, /4 value\(s\) the product does not store wait for the founder's decision: delivery contract --questions, then delivery contract --decide/);
    assert.equal(red.evidence, 'contract.json');
    const c = noneContract();
    decideNone(c, { state: 'all', decision: 'drop' });
    r.contract(c);
    const green = await pictureReadiness(r.paths);
    assert.equal(green.ok, true);
    assert.match(green.detail, /2 state\(s\): 1 match, 1 small differences/);
  } finally { r.cleanup(); }
});

test('ready: an unreached item is reported before an undecided value, and a run with no contract is unaffected', async () => {
  const r = tmpRun();
  try {
    r.round(1, { 'KC-05': 'not-reached' });
    r.contract(noneContract());
    assert.match((await pictureReadiness(r.paths)).detail, /whose newest picture was not reached/);
    const plain = tmpRun();
    try {
      plain.round(1, { 'KC-05': 'match' });
      assert.equal((await pictureReadiness(plain.paths)).ok, true);
    } finally { plain.cleanup(); }
  } finally { r.cleanup(); }
});

// ---- the clock rule ----

const clockMap = () => ({ states: [
  { id: 'S1', clock: true, reach: { world: 'w' } },
  { id: 'S2', reach: { world: 'x' } },
  { id: 'S3', clock: false, reach: { world: 'y' } },
] });
const fixedRows = () => ({ rows: [{ key: 'call-1', values: { called_at: '2026-01-15T09:00:00Z', name: 'Amina', meta: { due: '2026-01-16' }, tags: ['2026-01-17 08:30'] } }] });

test('clockProblems refuses a fixed time in the world of a state that depends on the clock', () => {
  const p = clockProblems(clockMap(), { w: fixedRows(), x: fixedRows(), y: fixedRows() });
  assert.equal(p.length, 3, 'one problem per fixed value; states without clock: true are ignored');
  assert.match(p[0], /world w row "call-1" called_at is a fixed time \("2026-01-15T09:00:00Z"\), and S1 depend\(s\) on the clock/);
  assert.match(p[0], /\{"\$rel": "now-2h"\}/);
  assert.match(p[1], /meta\.due is a fixed time \("2026-01-16"\)/);
  assert.match(p[2], /tags\[0\] is a fixed time/);
  assert.ok(p.every((x) => x.startsWith('world w ')));
});

test('clockProblems lets $rel values, plain text and unread worlds pass', () => {
  const ok = { rows: [{ key: 'r', values: { called_at: { $rel: 'now-2h' }, opens: { $rel: 'today@09:00' }, name: 'Amina', note: 'Called on the 15th' } }] };
  assert.deepEqual(clockProblems(clockMap(), { w: ok }), []);
  assert.deepEqual(clockProblems(clockMap(), { w: null }), []);
  assert.deepEqual(clockProblems(clockMap(), {}), []);
  assert.deepEqual(clockProblems({ states: [{ id: 'S', reach: { world: 'w' } }] }, { w: fixedRows() }), []);
  assert.deepEqual(clockProblems(null, {}), []);
});

test('validateMap refuses a clock that is not true or false', () => {
  const ok = sampleMap();
  ok.states[0].clock = true;
  assert.deepEqual(validateMap(ok, { designed: new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']) }), []);
  const bad = sampleMap();
  bad.states[0].clock = 'yes';
  assert.ok(validateMap(bad, { designed: new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']) }).some((p) => /KC-05 clock must be true or false/.test(p)));
});

// ---- the source check ----

test('selectColumns names the top-level columns a select reads', () => {
  assert.deepEqual([...selectColumns('id, name, members(role), alias:meta->title')].sort(), ['id', 'members', 'meta', 'name']);
  assert.equal(selectColumns('*'), '*');
  assert.equal(selectColumns(''), '*');
  assert.equal(selectColumns(undefined), '*');
  assert.equal(selectColumns('id, *'), '*');
  assert.deepEqual([...selectColumns('id, members(id, role, org(name))')].sort(), ['id', 'members']);
  assert.deepEqual([...selectColumns('created_at::text, meta!inner(x)')].sort(), ['created_at', 'meta']);
});

test('selectedColumns merges the selects of every query, across files, and reads nothing from an insert', () => {
  const a = "const { data } = await supabase.from('calls').select('id, status').eq('org', org);";
  const b = 'const r = await db\n  .from("calls")\n  .select(`started_at, contact:contacts(name)`);';
  const c = "await supabase.from('audit_log').insert({ action: 'x' });";
  const d = "const all = await supabase.from('contacts').select();";
  const e = "const s = await supabase.from('scripts').select('*').order('name');";
  const m = selectedColumns([a, b, c, d, e]);
  assert.deepEqual([...m.get('calls')].sort(), ['contacts', 'id', 'started_at', 'status'], 'a joined table counts by its name');
  assert.equal(m.has('audit_log'), false, 'an insert reads nothing');
  assert.equal(m.get('contacts'), '*');
  assert.equal(m.get('scripts'), '*');
  assert.equal(selectedColumns(["supabase.from('calls').select('id')", "supabase.from('calls').select('*')"]).get('calls'), '*', '* wins the merge');
  assert.equal(selectedColumns([]).size, 0);
});

test('sourceProblems flags a table no query reads and a column none selects, once each, and passes *', () => {
  const contract = { states: {
    'KC-05': { texts: [
      { text: 'Done', label: 'data', table: 'calls', column: 'outcome' },
      { text: 'Amina', label: 'data', table: 'contacts', column: 'name' },
      { text: 'Lead', label: 'data', table: 'contacts', column: 'meta.title' },
      { text: 'Ghost', label: 'data', table: 'ghosts', column: 'name' },
      { text: '8 calls', label: 'data', kind: 'count', table: 'calls', where: {} },
      { text: 'Sam', label: 'data', user: 'admin' },
      { text: 'Fixed', label: 'fixed' },
      { text: 'Gone', label: 'none', table: 'calls', column: 'x' },
    ] },
    'KC-04': { texts: [{ text: 'Failed', label: 'data', table: 'calls', column: 'outcome' }, { text: 'Bad', label: 'data', table: 'calls' }] },
  } };
  const selected = new Map([['calls', new Set(['id', 'status'])], ['contacts', '*']]);
  const p = sourceProblems(contract, selected);
  assert.deepEqual(p.map((x) => `${x.table}.${x.column}`), ['calls.outcome', 'ghosts.name']);
  assert.deepEqual(p[0].states, ['KC-05', 'KC-04']);
  assert.deepEqual(p[0].texts, ['Done', 'Failed']);
  assert.equal(p[0].why, 'the code reads calls but no query selects outcome');
  assert.equal(p[1].why, 'no query in the code reads ghosts');
  const nested = new Map([['contacts', new Set(['id', 'meta'])], ['calls', '*']]);
  assert.deepEqual(sourceProblems({ states: { A: { texts: [{ text: 'Lead', label: 'data', table: 'contacts', column: 'meta.title' }] } } }, nested), [], 'the top-level column is what is selected');
  assert.deepEqual(sourceProblems(null, selected), []);
});

// ---- review ----

function reviewShoot(lookup) {
  return { states: { 'WL-01': { reached: true, ...(lookup ? { lookup } : {}) }, 'WL-02': { reached: true }, 'WL-03': { reached: true } } };
}

test('summarise: a lookup data fault gives verdict data-fault and counts it', () => {
  const s = summarise({ map: widgetsMap(), shoot: reviewShoot({ dataFault: ['the design shows "B": no row'], must: [] }), notes: {} });
  assert.equal(s.states['WL-01'].verdict, 'data-fault');
  assert.deepEqual(s.states['WL-01'].dataFault, ['the design shows "B": no row']);
  assert.equal(s.states['WL-02'].dataFault, undefined);
  assert.equal(s.counts.dataFault, 1);
  assert.equal(s.counts.match, 2);
  assert.equal(s.counts.must, 0);
});

test('summarise: a must note beats a data fault, from the reviewer or from the lookup', () => {
  const notes = { 'WL-01': { must: ['the header is wrong'], small: [], design: [] } };
  const byReviewer = summarise({ map: widgetsMap(), shoot: reviewShoot({ dataFault: ['gap'], must: [] }), notes });
  assert.equal(byReviewer.states['WL-01'].verdict, 'must');
  assert.deepEqual(byReviewer.states['WL-01'].dataFault, ['gap'], 'the fault is still listed');
  const byLookup = summarise({ map: widgetsMap(), shoot: reviewShoot({ dataFault: ['gap'], must: ['the world holds "A"'] }), notes: {} });
  assert.equal(byLookup.states['WL-01'].verdict, 'must');
  assert.equal(byLookup.counts.must, 1);
  assert.equal(byLookup.counts.dataFault, undefined);
});

test('summarise: a data fault beats a data gap and small notes, and a carried item keeps its own', () => {
  const notes = { 'WL-01': { must: [], small: ['a border'], design: [], dataGap: ['older gap'] } };
  const s = summarise({ map: widgetsMap(), shoot: reviewShoot({ dataFault: ['gap'], must: [] }), notes });
  assert.equal(s.states['WL-01'].verdict, 'data-fault');
  const carried = { 'WL-01': { from: 1, state: { verdict: 'match', must: [], small: [], design: [] } } };
  assert.equal(summarise({ map: widgetsMap(), shoot: reviewShoot({ dataFault: ['gap'], must: [] }), notes: {}, pre: { carried } }).states['WL-01'].verdict, 'match');
});

test('batchPrompt lists the values the founder decided, and the datacheck-sorted lines', () => {
  const base = { pluginRoot: '/p', feature: 'f', worktree: '/w', roundRel: 'r/1', items: ['A'], file: 'x.md' };
  const p = batchPrompt({ ...base, decided: [{ state: 'A', text: 'Lead score 82', decision: 'drop' }, { state: 'B', text: 'Streak', decision: 'design' }], sorted: { A: { dataFault: ['no row'], must: ['held'] } } });
  assert.match(p, /Values the product does not store, which the founder has decided[^\n]*\n- A: "Lead score 82" \(decided: drop\)\n- B: "Streak" \(decided: design\)/);
  assert.match(p, /Already sorted by datacheck[^\n]*\n- A: data fault: no row\n- A: must fix: held/);
  const plain = batchPrompt(base);
  assert.doesNotMatch(plain, /decided|Already sorted/);
});
