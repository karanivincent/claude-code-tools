// A4: stopping the loop on states that are not this run's. A map state marked `later` is a shell
// the run will not build: never shot, verdict `later`, never open, listed with its reason. And a
// picture item can be waived (`delivery waive <ITEM> --why`): the home-page run could not get ready
// green because eight test-data gaps the safety rules create on purpose could not be waived.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMap } from '../../lib/picture/map.mjs';
import { selectStates } from '../../lib/picture/shoot.mjs';
import { summarise } from '../../lib/picture/review.mjs';
import { openByRound, renderStuck } from '../../lib/picture/stop.mjs';
import { pictureReadiness } from '../../lib/run/ready-compute.mjs';
import { pictureFacts } from '../../lib/picture/next.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import waive from '../../lib/commands/waive.mjs';
import reviewCommand from '../../lib/commands/review.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';

const LATER = { id: 'KC-09', screen: 'Calling hours', name: 'Hours editor', later: 'calling hours are built in the next run', buttons: [] };
const laterMap = () => ({ ...sampleMap(), feature: 'widgets', states: [...sampleMap().states, { ...LATER }] });
const designed = new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01', 'KC-09']);
const rec = { reached: true, problems: [], buttons: [] };

test('a later state needs no reach, and later must say why', () => {
  assert.deepEqual(validateMap(laterMap(), { designed }), []);
  const bad = laterMap();
  bad.states.at(-1).later = '  ';
  assert.ok(validateMap(bad, { designed }).some((p) => /KC-09 later must say why/.test(p)));
});

test('a later state is never shot, gets verdict later with its reason, and is not counted as not reached', () => {
  const { items } = selectStates(laterMap(), []);
  assert.ok(!items.some((i) => i.id === 'KC-09'), 'not shot');
  const shoot = { states: { 'KC-05': rec, 'KC-04': rec, 'KC-08': rec } };
  const s = summarise({ map: laterMap(), shoot, notes: {} });
  assert.equal(s.states['KC-09'].verdict, 'later');
  assert.equal(s.states['KC-09'].later, 'calling hours are built in the next run');
  assert.equal(s.counts.later, 1);
  assert.equal(s.counts.notReached, 0);
});

test('stuck.md lists deferred states and waived items with their reasons', () => {
  const md = renderStuck([], { why: 'the count has not fallen' }, { deferred: [{ key: 'KC-09', why: 'next run' }], waived: { 'KC-05': { why: 'a gap the safety rules make', verdict: 'data-gap' } } });
  assert.match(md, /## Deferred to a later run[\s\S]*- KC-09: next run/);
  assert.match(md, /## Waived[\s\S]*- KC-05 \(data-gap\): a gap the safety rules make/);
});

async function roundRepo() {
  const review = {
    schemaVersion: 1, round: 1, counts: { match: 1, small: 0, must: 1, notReached: 0, testOnly: 1, backToDesign: 0, dataGap: 1, later: 1 },
    states: {
      'KC-05': { verdict: 'data-gap', must: [], small: [], design: [], dataGap: ['the fixture org has no phone number'] },
      'KC-04': { verdict: 'must', must: ['the add menu is missing'], small: [], design: [] },
      'KC-08': { verdict: 'match', must: [], small: [], design: [] },
      'KC-01': { verdict: 'test-only', must: [], small: [], design: [] },
      'KC-09': { verdict: 'later', later: 'calling hours are built in the next run', must: [], small: [], design: [] },
    },
  };
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': laterMap(),
    '.delivery/widgets/rounds/1/shoot.json': { states: { 'KC-05': rec, 'KC-04': rec, 'KC-08': rec } },
    '.delivery/widgets/rounds/1/review.json': review,
  } });
  const t = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
  return { repo, paths: featurePaths(repo.dir, 'widgets'), ...t };
}

test('delivery waive <ITEM> --why records a picture item; it keeps its verdict and is not open', async () => {
  const { repo, ctx, stdout, paths } = await roundRepo();
  try {
    assert.equal((await pictureReadiness(paths)).ok, false, 'the data gap keeps ready red before the waiver');
    assert.equal(openByRound(paths).at(-1).open, 1, 'KC-04 is open');
    assert.equal(await waive.run(ctx, ['KC-05', '--why', 'the safety rules keep phone numbers out of fixtures']), 0);
    const doc = JSON.parse(readFileSync(join(paths.runDir, 'waived.json'), 'utf8'));
    assert.equal(doc.items['KC-05'].verdict, 'data-gap');
    assert.equal(doc.items['KC-05'].why, 'the safety rules keep phone numbers out of fixtures');
    assert.match(stdout.text(), /waived KC-05 \(data-gap, round 1\)/);

    await waive.run(ctx, ['KC-04', '--why', 'the founder takes the add menu as it is']);
    assert.equal(openByRound(paths).at(-1).open, 0, 'a waived must fix is not open for the stop rule');
    const f = await pictureFacts(paths);
    assert.deepEqual(f.open, { must: 0, notReached: 0, data: 0 });
    const r = await pictureReadiness(paths);
    assert.equal(r.ok, true, r.detail);
    assert.match(r.detail, /1 deferred to a later run \(map later\): KC-09/);
    assert.match(r.detail, /2 waived: KC-05: the safety rules keep phone numbers out of fixtures; KC-04: the founder takes the add menu as it is/);
  } finally { repo.cleanup(); }
});

test('waive refuses a matching item, an unknown item and a missing reason; a probe id still waives a probe', async () => {
  const { repo, ctx, paths } = await roundRepo();
  try {
    await assert.rejects(waive.run(ctx, ['KC-08', '--why', 'x']), /KC-08 is match; only an item that is must, not-reached, data-fault, data-gap can be waived/);
    await assert.rejects(waive.run(ctx, ['ZZ-01', '--why', 'x']), /ZZ-01 is neither a preflight probe nor an item of the map/);
    await assert.rejects(waive.run(ctx, ['KC-05']), /--why/);
    await assert.rejects(waive.run(ctx, ['P13', '--note', 'x']), /no run|state|preflight/i, 'a probe goes the probe way');
    assert.equal(existsSync(join(paths.runDir, 'waived.json')), false);
  } finally { repo.cleanup(); }
});

test('review --round lists deferred states and waived items for the PR body', async () => {
  const { repo, ctx, stdout, paths } = await roundRepo();
  try {
    await waive.run(ctx, ['KC-05', '--why', 'a gap the safety rules make']);
    repo.write({ '.delivery/widgets/rounds/1/review-plan.json': { schemaVersion: 1, round: 1, at: '2026-01-15T19:00:00.000Z', batches: 0, carried: {}, auto: {} } });
    await reviewCommand.run(ctx, ['--round', '1']);
    assert.match(stdout.text(), /deferred to a later run \(map later; list them in the PR body\): KC-09 \(calling hours are built in the next run\)/);
    assert.match(stdout.text(), /waived \(not open; list them in the PR body\): KC-05: a gap the safety rules make/);
    const review = JSON.parse(readFileSync(join(paths.runDir, 'rounds/1/review.json'), 'utf8'));
    assert.equal(review.states['KC-09'].verdict, 'later');
  } finally { repo.cleanup(); }
});
