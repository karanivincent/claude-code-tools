// A3: stale review batches and carried verdicts. A round whose every item was shot again was
// planned by appending to its old batches, and a label was carried from a round whose reviewers
// were given other steers. Now such a round is planned afresh, and steers.md's hash decides carrying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { carriedItems } from '../../lib/picture/review.mjs';
import { sha256 } from '../../lib/core/hash.mjs';
import { sampleMap } from './map.test.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import reviewCommand from '../../lib/commands/review.mjs';

const KEYS = ['KC-05', 'KC-04', 'KC-08'];
const rec = (over = {}) => ({ reached: true, problems: [], buttons: [], factsAgree: false, pixelDiff: 0.2, liveHash: 'L', designHash: 'D', ...over });
const shootOf = (over = {}) => ({ states: Object.fromEntries(KEYS.map((k) => [k, rec(over)])) });
const reviewOf = (verdict) => ({ states: Object.fromEntries(KEYS.map((k) => [k, { verdict, must: verdict === 'must' ? ['x'] : [], small: [], design: [] }])) });
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('carriedItems carries nothing from a round reviewed under other steers, and carries as before when the hashes agree or were never recorded', () => {
  const base = { keys: KEYS, shoot: shootOf(), prevShoot: shootOf(), prevReview: reviewOf('must'), prevRound: 1 };
  assert.deepEqual(Object.keys(carriedItems({ ...base, steersHash: 'b', prevSteersHash: 'a' })), []);
  assert.deepEqual(Object.keys(carriedItems({ ...base, steersHash: null, prevSteersHash: 'a' })), [], 'steers.md removed since');
  assert.deepEqual(Object.keys(carriedItems({ ...base, steersHash: 'a', prevSteersHash: 'a' })), KEYS);
  assert.deepEqual(Object.keys(carriedItems({ ...base, steersHash: 'a' })), KEYS, 'a round planned before the hash was recorded');
});

test('review --plan records the steers hash, and does not carry labels across a steers change', async () => {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': { ...sampleMap(), feature: 'widgets' },
    'docs/delivery/widgets/steers.md': 'Prices are test data.\n',
    '.delivery/widgets/rounds/1/shoot.json': shootOf(),
    '.delivery/widgets/rounds/2/shoot.json': shootOf(),
  } });
  try {
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    const r1 = join(repo.dir, '.delivery/widgets/rounds/1');
    assert.equal(readJson(join(r1, 'review-plan.json')).steersHash, sha256('Prices are test data.\n'));
    assert.equal(readJson(join(r1, 'batches.json')).steersHash, sha256('Prices are test data.\n'));
    repo.write({ '.delivery/widgets/rounds/1/review.json': { schemaVersion: 1, round: 1, ...reviewOf('must') } });

    // Same pictures, same steers: everything carries.
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const r2 = join(repo.dir, '.delivery/widgets/rounds/2');
    assert.deepEqual(Object.keys(readJson(join(r2, 'review-plan.json')).carried).sort(), [...KEYS].sort());

    // New steers: the round-1 labels were given under other instructions, so every item is reviewed.
    repo.write({ 'docs/delivery/widgets/steers.md': 'Prices are test data.\nThe empty state illustration is out of scope.\n' });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '2']), 0);
    const plan = readJson(join(r2, 'review-plan.json'));
    assert.deepEqual(plan.carried, {});
    assert.deepEqual(readJson(join(r2, 'batches.json')).batches.flatMap((b) => b.items).sort(), [...KEYS].sort());
  } finally { repo.cleanup(); }
});

test('review --plan after every item was shot again plans the whole round afresh instead of appending', async () => {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': { ...sampleMap(), feature: 'widgets' },
    '.delivery/widgets/rounds/1/shoot.json': shootOf({ at: '2026-01-15T19:00:00.000Z' }),
  } });
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets' });
    const dir = join(repo.dir, '.delivery/widgets/rounds/1');
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    const first = readJson(join(dir, 'batches.json'));
    assert.ok(first.batches.length >= 1);
    for (const b of first.batches) repo.write({ [`.delivery/widgets/rounds/1/${b.write}`]: `## ${b.items[0]}\n- must: old note\n` });

    // Every item shot again (shoot --only with every item, or a whole re-shoot into the round).
    repo.write({ '.delivery/widgets/rounds/1/shoot.json': shootOf({ at: '2026-01-15T21:00:00.000Z' }) });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    const again = readJson(join(dir, 'batches.json'));
    assert.equal(again.reshot, undefined, 'not a partial plan');
    assert.equal(again.batches.length, first.batches.length, 'the old batches are replaced, not kept beside the new ones');
    assert.deepEqual(again.batches.flatMap((b) => b.items).sort(), [...KEYS].sort());
    const oldIds = new Set(first.batches.map((b) => b.id));
    for (const b of again.batches) {
      assert.ok(!oldIds.has(b.id), 'new batches are numbered past the old ones');
      assert.equal(existsSync(join(dir, b.write)), false, 'no old review file stands in for a new batch');
      assert.ok(existsSync(join(dir, b.prompt)));
    }
    const prompts = readdirSync(dir).filter((f) => /^batch-\d+\.prompt\.md$/.test(f));
    assert.deepEqual(prompts.sort(), again.batches.map((b) => b.prompt).sort(), 'the old prompt files are deleted');
    assert.match(stdout.text(), /every item was shot again, so the whole round is planned afresh/);
  } finally { repo.cleanup(); }
});
