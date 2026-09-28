// A6: review only what changed, and batch it. Unchanged pictures keep their label, an exact match
// under the pixel threshold skips the reviewer, and `delivery review --plan` writes the batches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO_MATCH_MAX_DIFF, MAX_BATCH_ITEMS, batchWaves, canAutoMatch, domFacts, factsAgree, planReview, renderCompare, summarise,
} from '../../lib/picture/review.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import reviewCommand from '../../lib/commands/review.mjs';

/** A shoot record that would match: reached, no problems, facts agree, pixels within the threshold. */
const rec = (over = {}) => ({ reached: true, problems: [], buttons: [], factsAgree: true, pixelDiff: 0, liveHash: 'L', designHash: 'D', ...over });
const shootOf = (keys, over = {}) => ({ states: Object.fromEntries(keys.map((k) => [k, rec(over)])) });
const reviewed = (keys, verdict = 'match') => ({ states: Object.fromEntries(keys.map((k) => [k, { verdict, must: verdict === 'must' ? ['x'] : [], small: [], design: [] }])) });
const KEYS = ['KC-05', 'KC-04', 'KC-08'];

test('an item whose live and design pictures are both unchanged carries its label and is left out of the batches', () => {
  const m = sampleMap();
  const prev = { round: 1, shoot: shootOf(KEYS, { factsAgree: false }), review: reviewed(KEYS, 'must') };
  const now = shootOf(KEYS, { factsAgree: false });
  now.states['KC-04'].liveHash = 'changed'; // only this one changed
  const plan = planReview({ map: m, shoot: now, prev });
  assert.deepEqual(Object.keys(plan.carried).sort(), ['KC-05', 'KC-08']);
  assert.equal(plan.carried['KC-05'].from, 1);
  assert.equal(plan.carried['KC-05'].state.verdict, 'must');
  assert.deepEqual(plan.batches.flatMap((b) => b.items), ['KC-04']);
});

test('a changed design picture is sent too, and so is an item with no hash or no earlier label', () => {
  const m = sampleMap();
  const prev = { round: 1, shoot: shootOf(KEYS, { factsAgree: false }), review: reviewed(['KC-05', 'KC-04']) };
  const now = shootOf(KEYS, { factsAgree: false });
  now.states['KC-05'].designHash = 'new design';
  delete now.states['KC-04'].liveHash;
  const plan = planReview({ map: m, shoot: now, prev });
  assert.deepEqual(Object.keys(plan.carried), []);
  assert.deepEqual(plan.batches.flatMap((b) => b.items), KEYS);
});

test('a carried label reaches review.json (marked carried) and the comparison page', () => {
  const m = sampleMap();
  const prev = { round: 1, shoot: shootOf(KEYS, { factsAgree: false }), review: reviewed(KEYS, 'must') };
  const now = shootOf(KEYS, { factsAgree: false });
  const plan = planReview({ map: m, shoot: now, prev });
  const summary = summarise({ map: m, shoot: now, notes: {}, pre: plan });
  assert.equal(summary.states['KC-05'].verdict, 'must');
  assert.deepEqual(summary.states['KC-05'].carried, { from: 1 });
  assert.equal(summary.counts.must, 3);
  const html = renderCompare({ title: 't', round: 2, beforeRound: 1, map: m, summary, pictures: () => ({ design: null, before: null, now: null }) });
  assert.match(html, /Carried from round 1/);
});

test('text, test ids and buttons that agree exactly, under the pixel threshold, match without a reviewer; one pixel over does not', () => {
  const total = 1440 * 900;
  const atLimit = Math.floor(total * AUTO_MATCH_MAX_DIFF) / total;
  const overByOne = (Math.floor(total * AUTO_MATCH_MAX_DIFF) + 1) / total;
  assert.equal(canAutoMatch(rec({ pixelDiff: atLimit })), true);
  assert.equal(canAutoMatch(rec({ pixelDiff: overByOne })), false);
  const m = sampleMap();
  const under = planReview({ map: m, shoot: shootOf(KEYS, { pixelDiff: atLimit }) });
  assert.deepEqual(Object.keys(under.auto), KEYS);
  assert.deepEqual(under.batches, []);
  const over = planReview({ map: m, shoot: shootOf(KEYS, { pixelDiff: overByOne }) });
  assert.deepEqual(Object.keys(over.auto), []);
  assert.deepEqual(over.batches.flatMap((b) => b.items), KEYS);
  const summary = summarise({ map: m, shoot: shootOf(KEYS, { pixelDiff: 0 }), notes: {}, pre: under });
  assert.equal(summary.states['KC-05'].auto, true);
  assert.equal(summary.states['KC-05'].verdict, 'match');
});

test('any missing or doubtful data sends the item to a reviewer', () => {
  assert.equal(canAutoMatch(rec({ pixelDiff: undefined })), false, 'pixels not measured');
  assert.equal(canAutoMatch(rec({ pixelDiff: null })), false);
  assert.equal(canAutoMatch(rec({ factsAgree: false })), false);
  assert.equal(canAutoMatch(rec({ factsAgree: null })), false, 'no facts on one side');
  assert.equal(canAutoMatch(rec({ reached: false })), false);
  assert.equal(canAutoMatch(rec({ overflow: 12 })), false);
  assert.equal(canAutoMatch(rec({ problems: ['timeout'] })), false);
  assert.equal(canAutoMatch(rec({ buttons: [{ label: 'Add', onPage: false, shouldBe: 'shown' }] })), false);
  assert.equal(canAutoMatch(undefined), false);
});

test('facts agree only when text, test ids and buttons are all equal', () => {
  const dom = (over = {}) => ({ elements: [
    { kind: 'text', text: 'Knowledge', testid: null, visible: true, box: { x: 300 } },
    { kind: 'control', name: 'Add', text: 'Add', testid: 'kb-add', visible: true, box: { x: 500 } },
    { kind: 'text', text: 'Sidebar', testid: null, visible: true, box: { x: 10 } },
    ...(over.extra ?? []),
  ] });
  const a = domFacts(dom(), 240);
  assert.deepEqual(a.text, ['Knowledge']); // the sidebar is left of the page area
  assert.deepEqual(a.buttons, ['Add']);
  assert.deepEqual(a.testids, ['kb-add']);
  assert.equal(factsAgree(a, domFacts(dom(), 240)), true);
  assert.equal(factsAgree(a, domFacts(dom({ extra: [{ kind: 'text', text: 'New', visible: true, box: { x: 400 } }] }), 240)), false);
  assert.equal(factsAgree(a, domFacts(dom({ extra: [{ kind: 'text', text: 'x', testid: 'extra-id', visible: true, box: { x: 400 } }] }), 240)), false);
  assert.equal(factsAgree(a, null), false);
  assert.equal(factsAgree({ text: [], testids: [], buttons: [] }, { text: [], testids: [], buttons: [] }), false, 'an empty page never agrees');
});

/** A map of `n` states on one screen, each at desktop and phone. */
function bigMap(n) {
  const base = sampleMap();
  return {
    ...base,
    widths: ['desktop', 'phone'],
    states: Array.from({ length: n }, (_, i) => ({
      id: `S-${String(i + 1).padStart(2, '0')}`, screen: 'Big', name: `State ${i + 1}`,
      reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge' }] }, buttons: [],
    })),
  };
}

test('batches hold at most 20 items, and a state\'s desktop and phone items stay together', () => {
  const m = bigMap(11); // 22 items
  const keys = m.states.flatMap((s) => [s.id, `${s.id}@phone`]);
  const plan = planReview({ map: m, shoot: shootOf(keys, { factsAgree: false }) });
  assert.equal(plan.batches.length, 2);
  assert.ok(plan.batches.every((b) => b.items.length <= MAX_BATCH_ITEMS));
  assert.equal(plan.batches[0].items.length, 20);
  for (const b of plan.batches) {
    for (const k of b.items) {
      const id = k.replace('@phone', '');
      assert.ok(b.items.includes(id) && b.items.includes(`${id}@phone`), `${k} travels with its other width`);
    }
  }
  assert.deepEqual(plan.batches.flatMap((b) => b.items).sort(), [...keys].sort());
});

test('a screen that fits is not split across batches; small screens share one', () => {
  const m = bigMap(0);
  const mk = (screen, n, from) => Array.from({ length: n }, (_, i) => ({ id: `${screen}-${from + i}`, screen, name: 'x', reach: { world: 'design', role: 'admin', steps: [{ goto: '/x' }] }, buttons: [] }));
  m.widths = ['desktop'];
  m.states = [...mk('A', 12, 1), ...mk('B', 12, 1), ...mk('C', 4, 1)];
  const keys = m.states.map((s) => s.id);
  const plan = planReview({ map: m, shoot: shootOf(keys, { factsAgree: false }) });
  assert.deepEqual(plan.batches.map((b) => b.screens), [['A'], ['B', 'C']]);
});

test('at most four reviewers are stated at once', () => {
  const waves = batchWaves(Array.from({ length: 9 }, (_, i) => ({ id: i + 1 })));
  assert.deepEqual(waves, [[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
});

// --- the command: `delivery review --plan` -----------------------------------------------------

async function planCtx({ steers = null } = {}) {
  const m = bigMap(11);
  const keys = m.states.flatMap((s) => [s.id, `${s.id}@phone`]);
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': { ...m, feature: 'widgets' },
    '.delivery/widgets/rounds/1/shoot.json': shootOf(keys, { factsAgree: false }),
    '.delivery/widgets/rounds/2/shoot.json': shootOf(keys, { factsAgree: false }),
  } });
  repo.write({ '.delivery/widgets/rounds/1/review.json': { schemaVersion: 1, round: 1, states: reviewed(keys, 'must').states } });
  if (steers) repo.write({ 'docs/delivery/widgets/steers.md': steers });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
  return { repo, keys, ...t };
}

test('review --plan writes batches.json and one prompt file per batch, and carries unchanged items', async () => {
  const { repo, ctx, keys } = await planCtx();
  try {
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    // Round 2 is identical to round 1, so everything carries and nothing is dispatched.
    const dir = join(repo.dir, '.delivery/widgets/rounds/2');
    const plan = JSON.parse(readFileSync(join(dir, 'review-plan.json'), 'utf8'));
    assert.equal(plan.batches, 0);
    assert.equal(Object.keys(plan.carried).length, keys.length);
    // With the plan saying zero batches, review compiles without any reviewer file.
    assert.equal(await reviewCommand.run(ctx, ['--round', '2']), 1); // carried must-fix items are still open
    const review = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8'));
    assert.deepEqual(review.states['S-01'].carried, { from: 1 });
  } finally { repo.cleanup(); }
});

test('steers.md text lands in every prompt file, and batches.json names the files', async () => {
  const { repo, ctx, keys } = await planCtx({ steers: 'Ignore the empty-state illustration.\nPrices are test data.\n' });
  try {
    // Change every live picture so all items go to reviewers, in two batches.
    const f = join(repo.dir, '.delivery/widgets/rounds/2/shoot.json');
    const shoot = JSON.parse(readFileSync(f, 'utf8'));
    for (const k of keys) shoot.states[k].liveHash = 'new';
    repo.write({ '.delivery/widgets/rounds/2/shoot.json': shoot });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const dir = join(repo.dir, '.delivery/widgets/rounds/2');
    const b = JSON.parse(readFileSync(join(dir, 'batches.json'), 'utf8'));
    assert.equal(b.batches.length, 2);
    assert.equal(b.maxParallel, 4);
    assert.deepEqual(b.waves, [[1, 2]]);
    for (const batch of b.batches) {
      assert.ok(existsSync(join(dir, batch.prompt)));
      const text = readFileSync(join(dir, batch.prompt), 'utf8');
      assert.match(text, /Ignore the empty-state illustration\./);
      assert.match(text, /Prices are test data\./);
      assert.match(text, new RegExp(`Write: ${batch.write}`));
      assert.match(text, /briefs\/reviewer-picture\.md/);
      assert.match(text, new RegExp(`States: ${batch.items.join(' ').replace(/[@]/g, '@')}`));
    }
  } finally { repo.cleanup(); }
});

test('without a steers.md the prompts carry no steers block', async () => {
  const { repo, ctx, keys } = await planCtx();
  try {
    const shoot = JSON.parse(readFileSync(join(repo.dir, '.delivery/widgets/rounds/2/shoot.json'), 'utf8'));
    for (const k of keys) shoot.states[k].liveHash = 'new';
    repo.write({ '.delivery/widgets/rounds/2/shoot.json': shoot });
    await reviewCommand.run(ctx, ['--plan', '--round', '2']);
    assert.doesNotMatch(readFileSync(join(repo.dir, '.delivery/widgets/rounds/2/batch-1.prompt.md'), 'utf8'), /Steers/);
  } finally { repo.cleanup(); }
});
