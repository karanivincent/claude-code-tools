// Stable picture data, fixes 3 to 6: the shoot resets each world right before its shots and freezes
// the browser clock at that moment, a data difference is sorted by looking it up in the world, a
// re-shoot goes into the same round, and review plans and compiles just the re-shot items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextOptions, dataGapItems, freezeClock, runShoot, selectStates, writeShootJson } from '../../lib/picture/shoot.mjs';
import { dateShape, sortDataDifferences } from '../../lib/picture/contract.mjs';
import { batchPrompt, noteOwners, reshotItems, summarise } from '../../lib/picture/review.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import { runRows, runsReport } from '../../lib/retro/runs.mjs';
import reviewCommand from '../../lib/commands/review.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fakeClock } from '../helpers/clock.mjs';

const SEEDED = new Date('2026-01-15T12:00:00.000Z');

function map(over = {}) {
  return {
    schemaVersion: 1, feature: 'widgets', title: 'Widgets', kind: 'redesign', route: '/dashboard/widgets',
    widths: ['desktop'], pageArea: { left: 0, designLeft: 0 },
    worlds: [
      { id: 'design', users: [{ role: 'admin', email: 'delivery+w-design-admin@example.invalid' }] },
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

const textEl = (text) => ({ kind: 'text', text, visible: true, box: { x: 10, y: 10, w: 10, h: 10 } });

/** A Playwright-shaped stub: records context options, clock calls and the order of events. */
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
        async newContext(opts) {
          calls.push(`context ${opts.timezoneId ?? '-'}`);
          return {
            clock: { async setFixedTime(t) { calls.push(`clock ${new Date(t).toISOString()}`); } },
            async newPage() { return page; }, async storageState() {}, async close() {},
          };
        },
        async newPage() { return { async setContent() {}, async evaluate() { return { w: 1, h: 1 }; }, async setViewportSize() {}, async screenshot(o) { writeFileSync(o.path, 'png'); }, async close() {} }; },
        async close() {},
      };
    },
  };
}

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'stable-data-'));
  const outDir = join(root, 'round');
  const designDir = join(root, 'design');
  mkdirSync(designDir, { recursive: true });
  return { root, outDir, designDir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function baseOpts(o) {
  return {
    baseUrl: 'http://localhost:3000', sessionsDir: join(o.outDir, 'sessions'), magicLinkPath: '/auth/confirm',
    auth: { signInHash: async () => 'hash' }, log: () => {}, diffPictures: async () => 0, ...o,
  };
}

test('each world is reset once right before its first shot, again after a data-changing shot, and each browser is frozen at its seed moment in the profile\'s zone', async () => {
  const m = map();
  const { items } = selectStates(m);
  const d = dirs();
  try {
    const calls = [];
    let n = 0;
    const report = await runShoot(baseOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, chromium: fakeChromium({ calls }), timeZone: 'Africa/Nairobi',
      reset: async (world) => { calls.push(`reset ${world}`); return { at: new Date(SEEDED.getTime() + 60000 * n++), rows: [], users: [] }; },
    }));
    // messy only reads, so its group goes first; design is reset once for WL-01 and WL-02 (the
    // write comes last, in the same browser).
    assert.deepEqual(calls.filter((c) => /^(reset|context|clock)/.test(c)), [
      'reset messy', 'context Africa/Nairobi', 'clock 2026-01-15T12:00:00.000Z',
      'reset design', 'context Africa/Nairobi', 'clock 2026-01-15T12:01:00.000Z',
    ]);
    assert.equal(report['WL-01'].clock, '2026-01-15T12:01:00.000Z');
    assert.ok(calls.indexOf('reset design') < calls.indexOf('shoot WL-01.live.png'));
  } finally { d.cleanup(); }
});

test('a world written by one group is reset again before another group shoots it', async () => {
  const m = map();
  m.worlds[0].users.push({ role: 'member', email: 'delivery+w-design-member@example.invalid' });
  m.states.push({ id: 'WL-04', screen: 'Widgets', name: 'member saves', buttons: [], reach: { world: 'design', role: 'member', writes: true, steps: [{ goto: '/dashboard/widgets' }] } });
  const { items } = selectStates(m, ['WL-02', 'WL-04']);
  const d = dirs();
  try {
    const calls = [];
    await runShoot(baseOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, chromium: fakeChromium({ calls }),
      reset: async (world) => { calls.push(`reset ${world}`); return { at: SEEDED, rows: [], users: [] }; },
    }));
    assert.deepEqual(calls.filter((c) => c.startsWith('reset') || c.startsWith('shoot')), ['reset design', 'shoot WL-02.live.png', 'reset design', 'shoot WL-04.live.png']);
  } finally { d.cleanup(); }
});

test('a world that cannot be reset is not pictured: its items are not reached, the others are', async () => {
  const m = map();
  const { items } = selectStates(m);
  const d = dirs();
  try {
    const calls = [];
    const report = await runShoot(baseOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, chromium: fakeChromium({ calls }),
      reset: async (world) => { if (world === 'design') throw new Error('guard no-line does not hold'); return { at: SEEDED, rows: [], users: [] }; },
    }));
    assert.equal(report['WL-01'].reached, false);
    assert.match(report['WL-01'].problems[0], /world design could not be reset to its seed: guard no-line does not hold/);
    assert.equal(report['WL-02'].reached, false);
    assert.equal(report['WL-03'].reached, true);
    assert.ok(!calls.includes('shoot WL-01.live.png'));
  } finally { d.cleanup(); }
});

test('the shoot records each contract data difference sorted by lookup: rows missing is a data gap, rows present a must fix', async () => {
  const m = map();
  const { items } = selectStates(m, ['WL-01']);
  const d = dirs();
  try {
    writeFileSync(join(d.designDir, 'WL-01.png'), 'png');
    writeFileSync(join(d.designDir, 'WL-01.dom.json'), JSON.stringify({ elements: ['Amina Otieno', 'Brian Mwangi', 'Widgets', 'Tue 14 Oct'].map(textEl) }));
    const contract = { states: { 'WL-01': { texts: [
      { text: 'Amina Otieno', label: 'data', table: 'contacts', column: 'name' },
      { text: 'Brian Mwangi', label: 'data', table: 'contacts', column: 'name' },
      { text: 'Widgets', label: 'fixed' },
      { text: 'Tue 14 Oct', label: 'data', kind: 'date', table: 'calls', column: 'created_at' },
    ] } } };
    const rows = [{ table: 'contacts', values: { name: 'Amina Otieno' } }];
    const report = await runShoot(baseOpts({
      map: m, items, outDir: d.outDir, designDir: d.designDir, contract,
      chromium: fakeChromium({ calls: [], liveTexts: ['Widgets', 'Wed 3 Sep'] }),
      reset: async () => ({ at: SEEDED, rows, users: [] }),
    }));
    const l = report['WL-01'].lookup;
    assert.equal(l.must.length, 1);
    assert.match(l.must[0], /"Amina Otieno" and the page does not, though the world holds it/);
    assert.equal(l.dataGap.length, 1);
    assert.match(l.dataGap[0], /"Brian Mwangi": no contacts row has name = "Brian Mwangi"/);
  } finally { d.cleanup(); }
});

test('sortDataDifferences: a date in the design\'s format is no difference; fixed and random texts are not sorted; no rows sorts nothing', () => {
  const contractState = { texts: [
    { text: 'Tue 14 Oct', label: 'data', kind: 'date', table: 'calls', column: 'at' },
    { text: 'Save', label: 'fixed' },
    { text: '#A81F', label: 'random' },
    { text: '8 calls', label: 'data', kind: 'count', table: 'calls', value: '8' },
  ] };
  const design = ['Tue 14 Oct', 'Save', '#A81F', '8 calls'];
  const rows = Array.from({ length: 8 }, () => ({ table: 'calls', values: { at: '2026-01-15' } }));
  const r = sortDataDifferences({ contractState, designTexts: design, liveTexts: ['Wed 3 Sep', '6 calls'], rows, users: [], now: SEEDED });
  assert.deepEqual(r.dataGap, []);
  assert.equal(r.must.length, 1, 'eight rows and the page shows another count: the count query is wrong, not the data');
  assert.match(r.must[0], /"8 calls".*calls rows/);
  assert.deepEqual(sortDataDifferences({ contractState, designTexts: design, liveTexts: [], rows: null, users: [], now: SEEDED }), { dataGap: [], must: [] });
  assert.equal(dateShape('Tue 14 Oct'), dateShape('wed 3 sep'));
  assert.notEqual(dateShape('Tue 14 Oct'), dateShape('14/10/2026'));
});

test('contextOptions carries the time zone; freezeClock leaves a Playwright without a clock alone', async () => {
  assert.equal(contextOptions('phone', 'Africa/Nairobi').timezoneId, 'Africa/Nairobi');
  assert.equal(contextOptions('desktop').timezoneId, undefined);
  assert.equal(await freezeClock({}, SEEDED), false);
  assert.equal(await freezeClock({ clock: { async setFixedTime() {} } }, null), false);
});

test('review counts the lookup\'s notes, never twice, and not for a carried item', () => {
  const m = map();
  const shoot = { states: {
    'WL-01': { reached: true, lookup: { dataGap: ['the design shows "B": no row'], must: [] } },
    'WL-02': { reached: true, lookup: { dataGap: [], must: ['the world holds "A"'] } },
    'WL-03': { reached: true, lookup: { dataGap: ['gap'], must: [] } },
  } };
  const notes = { 'WL-01': { must: [], small: [], design: [], dataGap: ['the design shows "B": no row'] } };
  const carried = { 'WL-03': { from: 1, state: { verdict: 'match', must: [], small: [], design: [] } } };
  const s = summarise({ map: m, shoot, notes, pre: { carried } });
  assert.equal(s.states['WL-01'].verdict, 'data-gap');
  assert.equal(s.states['WL-01'].dataGap.length, 1);
  assert.equal(s.states['WL-02'].verdict, 'must');
  assert.equal(s.states['WL-03'].verdict, 'match');
});

test('re-shoot helpers: items shot after the plan, the batch that owns an item\'s notes, the data-gap items, and the prompt\'s sorted lines', async () => {
  const shoot = { states: { A: { at: '2026-01-15T12:10:00Z' }, B: { at: '2026-01-15T11:00:00Z' }, C: {} } };
  assert.deepEqual(reshotItems(shoot, { at: '2026-01-15T12:00:00Z' }), ['A']);
  assert.deepEqual(reshotItems(shoot, null), []);
  const owners = noteOwners({ batches: [{ write: 'review-batch-1.md', items: ['A', 'B'] }, { write: 'review-batch-3.md', items: ['A'] }] }, { auto: { B: {} } });
  assert.equal(owners.get('A'), 'review-batch-3.md');
  assert.equal(owners.get('B'), null);
  assert.deepEqual(dataGapItems({ review: { states: { A: { verdict: 'data-gap' }, B: { verdict: 'match' } } }, shoot: { states: { C: { lookup: { dataGap: ['x'] } } } } }), ['A', 'C']);
  const p = batchPrompt({ pluginRoot: '/p', feature: 'f', worktree: '/w', roundRel: 'r/1', items: ['A'], file: 'x.md', sorted: { A: { dataGap: ['no row'], must: ['held'] } } });
  assert.match(p, /Already sorted by looking the data up in the world[^\n]*\n- A: data gap: no row\n- A: must fix: held/);
  const d = dirs();
  try {
    mkdirSync(d.outDir, { recursive: true });
    await writeShootJson(d.outDir, { baseUrl: 'u', at: 't1', report: { A: { reached: false } } });
    const doc = await writeShootJson(d.outDir, { baseUrl: 'u', at: 't2', report: { A: { reached: true } }, reshot: true });
    assert.equal(doc.at, 't1', 'a re-shoot keeps the round\'s own time');
    assert.deepEqual(doc.reshot, [{ at: 't2', items: ['A'] }]);
    assert.equal(doc.states.A.reached, true);
  } finally { d.cleanup(); }
});

test('review --plan after a re-shoot plans only the re-shot items in new batches, and compile takes their notes from the new batch only', async () => {
  const m = map();
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': m,
    '.delivery/widgets/rounds/1/shoot.json': { states: {
      'WL-01': { reached: true, problems: [], buttons: [], at: '2026-01-15T12:00:00.000Z' },
      'WL-02': { reached: true, problems: [], buttons: [], at: '2026-01-15T12:00:00.000Z' },
      'WL-03': { reached: true, problems: [], buttons: [], at: '2026-01-15T12:00:00.000Z' },
    } },
  } });
  try {
    const clock = fakeClock('2026-01-15T12:05:00.000Z');
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', clock });
    const dir = join(repo.dir, '.delivery/widgets/rounds/1');
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    writeFileSync(join(dir, 'review-batch-1.md'), '0 match, 2 with problems.\n\n## WL-01\n- must fix: old picture wrong\n\n## WL-03\n- small: a border\n');
    // WL-01 is re-shot after a data fix: its record is newer than the plan.
    const shoot = JSON.parse(readFileSync(join(dir, 'shoot.json'), 'utf8'));
    shoot.states['WL-01'].at = '2026-01-15T12:30:00.000Z';
    writeFileSync(join(dir, 'shoot.json'), JSON.stringify(shoot));
    const next = pictureNext({ rulesOwed: false, owedDesignRules: [], designed: 3, hasMap: true, mapError: null, guardsToApprove: [], pageBlockedComponents: [], phoneRenderOwed: false, checklistStale: false, contractMissing: false, contractTodo: 0, seedStale: false, rounds: [{ round: 1, shot: true, reshot: 1, reviews: 1, planned: 1, pending: 0, compiled: false }] }, { cli: 'delivery' });
    assert.match(next.text, /review --plan --round 1: 1 item\(s\) were re-shot/);
    const t2 = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', clock: fakeClock('2026-01-15T12:40:00.000Z') });
    assert.equal(await reviewCommand.run(t2.ctx, ['--plan', '--round', '1']), 0);
    const b = JSON.parse(readFileSync(join(dir, 'batches.json'), 'utf8'));
    assert.deepEqual(b.batches.map((x) => [x.id, x.items]), [[1, ['WL-01', 'WL-02', 'WL-03']], [2, ['WL-01']]]);
    assert.deepEqual(b.reshot, ['WL-01']);
    writeFileSync(join(dir, 'review-batch-2.md'), '1 match.\n\nMatches: WL-01\n');
    assert.equal(await reviewCommand.run(t2.ctx, ['--round', '1']), 0);
    const review = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8'));
    assert.equal(review.states['WL-01'].verdict, 'match', 'the old picture\'s must-fix note dropped out');
    assert.equal(review.states['WL-03'].verdict, 'small', 'an item not re-shot keeps its notes');
  } finally { repo.cleanup(); }
});

test('delivery runs prints the data gaps per round', () => {
  const rec = { feature: 'scripts', phases: {}, rounds: [{ round: 1, match: 10, small: 0, toFix: 2, notReached: 0, dataGap: 3 }, { round: 2, match: 12, small: 0, toFix: 0, notReached: 0, dataGap: 0 }] };
  assert.deepEqual(runRows([rec])[0].dataGaps, [3, 0]);
  assert.ok(runsReport([rec]).some((l) => /data gaps per round/.test(l)));
  assert.ok(runsReport([rec]).some((l) => /3 > 0$/.test(l)));
});

test('shoot --only: re-shoots into the latest round, says so when there is nothing to re-shoot, and refuses without a round', async () => {
  const shootCommand = (await import('../../lib/commands/shoot.mjs')).default;
  const m = map();
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': m,
    '.delivery/widgets/design/WL-01.png': 'png', '.delivery/widgets/design/WL-02.png': 'png', '.delivery/widgets/design/WL-03.png': 'png',
  } });
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
    await assert.rejects(shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--only', 'WL-01']), /--only re-shoots into a numbered round, and there is none yet/);
    repo.write({ '.delivery/widgets/rounds/1/review.json': { states: { 'WL-01': { verdict: 'match' } } }, '.delivery/widgets/rounds/1/shoot.json': { states: {} } });
    assert.equal(await shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--only', 'data-gaps']), 0);
    assert.match(stdout.text(), /nothing to re-shoot: round 1 has no data gap/);
    await assert.rejects(shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--only', 'WL-01', 'WL-02']), /not as well as a list/);
    await assert.rejects(shootCommand.run(ctx, ['--base-url', 'http://localhost:3000', '--only', 'WL-99']), /not states \(or widths\) in the map: WL-99/);
  } finally { repo.cleanup(); }
});
