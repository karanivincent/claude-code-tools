// The data contract (stable picture data, fixes 1 and 2): texts from the design DOM, labels kept
// across rebuilds, and each data value checked against rows before anything is seeded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildContract, contractGaps, contractSummary, designTexts, entryProblem, holds, initials, normalise, stateTexts,
} from '../../lib/picture/contract.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import contractCommand from '../../lib/commands/contract.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { sampleMap } from './map.test.mjs';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function el(text, x, y, extra = {}) {
  return { kind: 'text', text, visible: true, box: { x, y, w: 100, h: 20 }, ...extra };
}
function dom(elements) { return { schemaVersion: 1, elements }; }

test('designTexts: the page area\'s visible texts, once each, top to bottom then left to right', () => {
  const d = dom([
    el('Knowledge', 60, 10), // the sidebar: left of the page area
    el('8 calls', 300, 80),
    el('Amina  Otieno', 260, 40),
    el('hidden', 300, 90, { visible: false }),
    { kind: 'control', text: 'Save', name: 'Save', visible: true, box: { x: 300, y: 5, w: 10, h: 10 } },
    el('8 calls', 500, 200),
  ]);
  assert.deepEqual(designTexts(d, 240), ['Amina Otieno', '8 calls']);
  assert.deepEqual(designTexts(null), []);
});

test('stateTexts reads each state\'s design DOM at every width it is checked at, and skips test-only states', () => {
  const dir = makeTempRepo({ files: {} }).dir;
  const designDir = join(dir, 'design');
  mkdirSync(designDir, { recursive: true });
  const map = sampleMap({ widths: ['desktop', 'phone'] });
  for (const [f, texts] of [['KC-05', ['Amina Otieno']], ['KC-05@phone', ['Amina Otieno', 'Menu']], ['KC-04', ['Add knowledge']], ['KC-01', ['Loading']]]) {
    writeFileSync(join(designDir, `${f}.png`), '');
    writeFileSync(join(designDir, `${f}.dom.json`), JSON.stringify(dom(texts.map((t, i) => el(t, 300, i * 20)))));
  }
  const t = stateTexts(map, designDir);
  assert.deepEqual(t.get('KC-05'), ['Amina Otieno', 'Menu']);
  assert.deepEqual(t.get('KC-04'), ['Add knowledge']);
  assert.equal(t.has('KC-01'), false, 'reached by a component test: never pictured, so no contract');
  assert.equal(t.has('KC-08'), false, 'no design render on disk');
});

test('buildContract keeps labels, lets the labeller\'s file win, spreads "fixed" to every state, and leaves new texts unlabelled', () => {
  const previous = { schemaVersion: 1, states: {
    'KC-05': { texts: [{ text: 'Amina Otieno', label: 'data', table: 'contacts', column: 'name' }, { text: 'Save', label: 'fixed' }], inconsistent: 'counts disagree' },
    'KC-04': { texts: [{ text: 'Old words', label: 'fixed' }] },
  } };
  const labels = { states: { 'KC-04': [{ text: 'Add  knowledge', label: 'fixed' }] }, inconsistent: {} };
  const texts = new Map([['KC-05', ['Amina Otieno', 'Save']], ['KC-04', ['Add knowledge', 'Save', '3 sources']]]);
  const r = buildContract({ texts, previous, labels, at: NOW.toISOString() });
  const s = r.contract.states;
  assert.equal(s['KC-05'].texts[0].table, 'contacts', 'a kept label');
  assert.equal(s['KC-05'].inconsistent, 'counts disagree', 'kept while the texts are unchanged');
  assert.deepEqual(s['KC-04'].texts.map((e) => e.label), ['fixed', 'fixed', null], 'labeller, spread fixed, new');
  assert.deepEqual(r.changed, ['KC-04']);
  assert.equal(r.removed, 1);
  // A changed state drops its inconsistency note: the new export may be the fix.
  const again = buildContract({ texts: new Map([['KC-05', ['Amina Otieno']]]), previous: r.contract, at: NOW.toISOString() });
  assert.equal(again.contract.states['KC-05'].inconsistent, undefined);
});

test('entryProblem and contractSummary name what cannot be checked', () => {
  assert.equal(entryProblem({ text: 'x', label: 'fixed' }), null);
  assert.match(entryProblem({ text: 'x', label: 'maybe' }), /not one of/);
  assert.match(entryProblem({ text: 'x', label: 'data' }), /names its table/);
  assert.match(entryProblem({ text: 'x', label: 'data', table: 'calls' }), /names its column/);
  assert.match(entryProblem({ text: 'calls', label: 'data', kind: 'count', table: 'calls' }), /needs a number/);
  assert.equal(entryProblem({ text: 'SK', label: 'data', user: 'admin', field: 'initials' }), null);
  const s = contractSummary({ states: { A: { texts: [{ text: 'a', label: null }, { text: 'b', label: 'data' }, { text: 'c', label: 'fixed' }], inconsistent: 'no' } } });
  assert.equal(s.unlabelled.length, 1);
  assert.equal(s.invalid.length, 1);
  assert.deepEqual(s.inconsistent, [{ state: 'A', why: 'no' }]);
});

test('holds: a value, a count, a date by its column only, and a fixture user\'s name or initials', () => {
  const rows = [
    { table: 'contacts', values: { name: 'Amina Otieno', meta: { title: 'Lead' } } },
    { table: 'calls', values: { status: 'done', created_at: '2026-01-15T11:58:00Z' } },
    { table: 'calls', values: { status: 'done', created_at: null } },
    { table: 'calls', values: { status: 'failed' } },
  ];
  const users = [{ role: 'admin', name: 'Sam Kariuki' }, { role: 'member' }];
  assert.equal(holds({ text: 'AMINA otieno', table: 'contacts', column: 'name' }, rows, users, NOW).ok, true);
  assert.equal(holds({ text: 'Called Amina Otieno', value: 'Amina Otieno', table: 'contacts', column: 'name' }, rows, users, NOW).ok, true);
  assert.equal(holds({ text: 'Lead', table: 'contacts', column: 'meta.title' }, rows, users, NOW).ok, true);
  assert.match(holds({ text: 'Brian', table: 'contacts', column: 'name' }, rows, users, NOW).why, /no contacts row has name = "Brian"/);
  assert.equal(holds({ text: '2 calls', kind: 'count', table: 'calls', where: { status: 'done' } }, rows, users, NOW).ok, true);
  const short = holds({ text: '8 calls', kind: 'count', table: 'calls', where: { status: 'done' } }, rows, users, NOW);
  assert.deepEqual([short.ok, short.found], [false, 2], 'a count is exact: 2 rows where the design shows 8');
  assert.equal(holds({ text: '2 min ago', kind: 'time', table: 'calls', column: 'created_at' }, rows, users, NOW).ok, true);
  assert.equal(holds({ text: 'Sam Kariuki', user: 'admin' }, rows, users, NOW).ok, true);
  assert.equal(holds({ text: 'SK', user: 'admin', field: 'initials' }, rows, users, NOW).ok, true);
  assert.match(holds({ text: 'Jo', user: 'member' }, rows, users, NOW).why, /has no name/);
  assert.equal(initials(' amina  wanjiru otieno '), 'AWO');
  assert.equal(normalise('  A B '), 'a b');
});

test('contractGaps checks the seed plan\'s rows (relative times resolved) and skips inconsistent states', () => {
  const map = sampleMap();
  map.worlds[0].users[0].name = 'Sam Kariuki';
  const contract = { states: {
    'KC-05': { texts: [
      { text: 'Amina Otieno', label: 'data', table: 'contacts', column: 'name' },
      { text: 'Brian Mwangi', label: 'data', table: 'contacts', column: 'name' },
      { text: 'Yesterday', label: 'data', kind: 'date', table: 'calls', column: 'created_at' },
      { text: 'Sam Kariuki', label: 'data', user: 'admin' },
      { text: 'New', label: null },
      { text: 'To check', label: 'fixed' },
    ] },
    'KC-04': { texts: [{ text: 'Nope', label: 'data', table: 'contacts', column: 'name' }], inconsistent: 'the design contradicts itself' },
    'GONE-1': { texts: [{ text: 'x', label: 'data', table: 'contacts', column: 'name' }] },
  } };
  const seedPlan = {
    rows: [
      { world: 'design', table: 'contacts', values: { name: 'Amina Otieno' } },
      { world: 'other', table: 'contacts', values: { name: 'Brian Mwangi' } },
      { world: 'design', table: 'calls', values: { created_at: { $rel: 'now-1d' } } },
    ],
    users: [{ world: 'design', role: 'admin', name: 'Sam Kariuki' }],
  };
  const r = contractGaps(contract, map, seedPlan, NOW);
  assert.deepEqual(r.gaps.map((g) => g.text), ['Brian Mwangi'], 'only the value no row of the state\'s own world holds');
  assert.match(r.gaps[0].why, /world design/);
  assert.equal(r.unlabelled, 1);
  assert.deepEqual(r.skipped, ['KC-04']);
});

test('NEXT asks for the contract once the map is valid, then for the labeller while texts are unlabelled', () => {
  const base = { rulesOwed: false, owedDesignRules: [], designed: 3, hasMap: true, mapError: null, guardsToApprove: [], pageBlockedComponents: [], phoneRenderOwed: false, rulesProblem: null, checklistStale: false, rounds: [] };
  assert.equal(pictureNext({ ...base, contractMissing: true, seedStale: true }, { cli: 'delivery' }).step, 'contract');
  const todo = pictureNext({ ...base, contractMissing: false, contractTodo: 4, seedStale: true }, { cli: 'delivery' });
  assert.equal(todo.step, 'contract');
  assert.match(todo.text, /Role: contract/);
  assert.equal(pictureNext({ ...base, contractMissing: false, contractTodo: 0, seedStale: true }, { cli: 'delivery' }).step, 'worlds');
});

async function commandSetup() {
  const map = sampleMap();
  const files = { 'docs/delivery/knowledge-page/map.json': map };
  const repo = makeTempRepo({ files });
  const design = join(repo.dir, '.delivery', 'knowledge-page', 'design');
  mkdirSync(design, { recursive: true });
  writeFileSync(join(design, 'KC-05.png'), '');
  writeFileSync(join(design, 'KC-05.dom.json'), JSON.stringify(dom([el('Everything', 300, 10), el('Amina Otieno', 300, 40)])));
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'knowledge-page', profile: makeProfile(), clock: fakeClock(NOW.toISOString()) });
  return { repo, ...t, deliveryDir: join(repo.dir, 'docs', 'delivery', 'knowledge-page') };
}

test('delivery contract writes contract.json from the design DOM, exits 1 while texts are unlabelled, and 0 once the labeller\'s file covers them', async () => {
  const { ctx, stdout, deliveryDir } = await commandSetup();
  assert.equal(await contractCommand.run(ctx, []), 1);
  const written = JSON.parse(readFileSync(join(deliveryDir, 'contract.json'), 'utf8'));
  assert.deepEqual(written.states['KC-05'].texts.map((e) => e.text), ['Everything', 'Amina Otieno']);
  assert.match(stdout.text(), /2 to label/);
  writeFileSync(join(deliveryDir, 'contract-labels.json'), JSON.stringify({ schemaVersion: 1, states: { 'KC-05': [
    { text: 'Everything', label: 'fixed' },
    { text: 'Amina Otieno', label: 'data', table: 'contacts', column: 'name' },
  ] }, inconsistent: {} }));
  assert.equal(await contractCommand.run(ctx, []), 0);
  assert.match(stdout.text(), /next: delivery seed --plan/);
  assert.ok(existsSync(join(deliveryDir, 'contract.json')));
});

test('delivery contract names a label it cannot check, and exits 2 with no map', async () => {
  const { ctx, stdout, deliveryDir } = await commandSetup();
  writeFileSync(join(deliveryDir, 'contract-labels.json'), JSON.stringify({ states: { 'KC-05': [
    { text: 'Everything', label: 'fixed' }, { text: 'Amina Otieno', label: 'data' },
  ] } }));
  assert.equal(await contractCommand.run(ctx, []), 1);
  assert.match(stdout.text(), /"Amina Otieno": a data text names its table/);
  const bare = makeTempRepo({ files: {} });
  const t = await makeTestCtx({ repoRoot: bare.dir, feature: 'knowledge-page', profile: makeProfile() });
  assert.equal(await contractCommand.run(t.ctx, []), 2);
});
