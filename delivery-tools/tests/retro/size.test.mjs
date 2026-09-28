// C3: every rule of the size rule has its own test, including the default (unknown is large).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, changeKey, MAX_SMALL_LINES } from '../../lib/retro/size.mjs';
import { tunable, loadTunables } from '../../lib/retro/tunables.mjs';

const T = loadTunables();
const batch = (to) => ({ kind: 'tunable', key: 'review.maxBatchItems', from: T['review.maxBatchItems'].value, to });
const large = (c, stats, opts) => classify(c, stats, opts);

test('a tunable moved within its bounds, away from loosening, is small', () => {
  const r = classify(batch(25));
  assert.deepEqual(r, { size: 'small', reasons: [] });
});

test('a steer, a brief sentence and a warn-only check are small', () => {
  assert.equal(classify({ kind: 'steer', text: 'Shoot the empty state before the filled one.' }).size, 'small');
  assert.equal(classify({ kind: 'brief-sentence', brief: 'reviewer-picture', text: 'Name the state id in every note.' }).size, 'small');
  assert.equal(classify({ kind: 'warn-check', description: 'warn when a label is longer than its box', onlyWarns: true }, { lines: 30, files: ['lib/checks/label.mjs'] }).size, 'small');
});

test('the default: an unknown kind, no kind, or a non-object is large', () => {
  for (const c of [{ kind: 'refactor' }, {}, null, undefined, 'x', [], { kind: 'tunable' }]) {
    const r = classify(c);
    assert.equal(r.size, 'large', JSON.stringify(c));
    assert.ok(r.reasons.length);
  }
});

test('a classifier that throws is large', () => {
  const r = classify(batch(25), null, { tunables: { get 'review.maxBatchItems'() { throw new Error('boom'); } } });
  assert.equal(r.size, 'large');
  assert.match(r.reasons.join(' '), /could not classify/);
});

test('rule 1: a new command or agent is large', () => {
  assert.match(large({ kind: 'command', name: 'x' }).reasons.join(), /adds a command/);
  assert.match(large({ kind: 'agent', name: 'x' }).reasons.join(), /adds an agent/);
  assert.equal(large({ kind: 'steer', text: 'ok', addsCommand: true }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok', addsAgent: true }).size, 'large');
});

test('rule 2: the seed-safety surface is large, by path or by what the text names', () => {
  for (const p of ['delivery-safety.json', '.claude/delivery-safety.json', 'schemas/safety.schema.json', 'lib/seed/safety.mjs', 'lib/seed/apply.mjs', 'hooks/pre-bash.sh', 'lib/guards/x.mjs', 'docs/never-dial.md']) {
    const r = large({ kind: 'warn-check', description: 'x', onlyWarns: true, paths: [p] });
    assert.equal(r.size, 'large', p);
    assert.match(r.reasons.join(), /seed-safety/, p);
  }
  assert.equal(large({ kind: 'steer', text: 'Edit delivery-safety.json to add the table.' }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'Loosen the never-dial rule.' }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok' }, { lines: 3, files: ['lib/seed/guard.mjs'] }).size, 'large');
});

test('rule 3: deleting or loosening a check or gate is large', () => {
  assert.equal(large({ kind: 'steer', text: 'ok', deletes: true }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok', loosens: true }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'Skip the copy check when the page is a dialog.' }).size, 'large');
  assert.equal(large({ kind: 'brief-sentence', brief: 'builder', text: 'You no longer need to run the gate.' }).size, 'large');
});

test('rule 3: a tunable that loosens is large in the direction its file declares, small the other way', () => {
  const px = T['review.autoMatchMaxDiff'].value;
  const up = large({ kind: 'tunable', key: 'review.autoMatchMaxDiff', from: px, to: px + 0.001 });
  assert.equal(up.size, 'large');
  assert.match(up.reasons.join(), /loosens/);
  assert.equal(classify({ kind: 'tunable', key: 'review.autoMatchMaxDiff', from: px, to: px - 0.001 }).size, 'small');
  const tol = T['review.pixelTolerance'].value;
  assert.equal(large({ kind: 'tunable', key: 'review.pixelTolerance', from: tol, to: tol + 2 }).size, 'large');
  // a tunable whose file says "lower" loosens
  const tunables = { k: { value: 5, min: 1, max: 9, loosens: 'lower' } };
  assert.equal(large({ kind: 'tunable', key: 'k', from: 5, to: 4 }, null, { tunables }).size, 'large');
  assert.equal(classify({ kind: 'tunable', key: 'k', from: 5, to: 6 }, null, { tunables }).size, 'small');
});

test('rule 3: a tunable that does not say which way loosens it is large', () => {
  const tunables = { k: { value: 5, min: 1, max: 9 } };
  assert.match(large({ kind: 'tunable', key: 'k', from: 5, to: 6 }, null, { tunables }).reasons.join(), /which way/);
});

test('a tunable outside its bounds, unknown, stale, not numeric or unchanged is large', () => {
  assert.match(large(batch(T['review.maxBatchItems'].max + 5)).reasons.join(), /highest sane/);
  assert.match(large(batch(T['review.maxBatchItems'].min - 1)).reasons.join(), /lowest sane/);
  assert.match(large({ kind: 'tunable', key: 'nope', from: 1, to: 2 }).reasons.join(), /not a tunable/);
  assert.match(large({ kind: 'tunable', key: 'review.maxBatchItems', from: 3, to: 25 }).reasons.join(), /current value/);
  assert.match(large({ kind: 'tunable', key: 'review.maxBatchItems', from: 20, to: '25' }).reasons.join(), /numbers/);
  assert.match(large(batch(20)).reasons.join(), /does not change/);
});

test('rule 4: changing agent isolation or the model line is large', () => {
  assert.equal(large({ kind: 'steer', text: 'ok', changesIsolation: true }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok', changesModel: true }).size, 'large');
  assert.equal(large({ kind: 'brief-sentence', brief: 'builder', text: 'Run in worktree isolation.' }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok' }, { lines: 1, files: ['agents/delivery-builder.md'] }).size, 'large');
  assert.equal(large({ kind: 'steer', text: 'ok' }, { lines: 1, files: ['lib/commands/status.mjs'] }).size, 'large');
});

test('rule 4: a warn-check that does not say it only warns is large', () => {
  assert.match(large({ kind: 'warn-check', description: 'x' }, { lines: 5, files: [] }).reasons.join(), /only warns/);
  assert.equal(large({ kind: 'warn-check', description: 'x', onlyWarns: false }, { lines: 5, files: [] }).size, 'large');
});

test('files outside the small surface are large', () => {
  assert.match(large(batch(25), { lines: 2, files: ['lib/picture/review.mjs'] }).reasons.join(), /outside the small surface/);
  assert.equal(classify(batch(25), { lines: 2, files: ['tunables.json'] }).size, 'small');
  assert.equal(classify(batch(25), { lines: 2, files: ['delivery-tools/tunables.json'] }).size, 'small');
});

test('rule 5: the diff is at most 50 lines; more, or unknown, is large', () => {
  assert.equal(classify(batch(25), { lines: MAX_SMALL_LINES, files: ['tunables.json'] }).size, 'small');
  assert.match(large(batch(25), { lines: MAX_SMALL_LINES + 1, files: ['tunables.json'] }).reasons.join(), /51 lines/);
  assert.match(large({ kind: 'warn-check', description: 'x', onlyWarns: true }).reasons.join(), /not known/);
  assert.match(large(batch(25), { lines: NaN }).reasons.join(), /not known/);
  assert.match(large({ kind: 'steer', text: Array(60).fill('line').join('\n') }).reasons.join(), /lines/);
});

test('rule 6: reversing an earlier decision is large', () => {
  const key = 'review.maxBatchItems';
  const tunables = { [key]: { value: 20, min: 5, max: 40, loosens: 'never' } };
  const earlier = [{ id: 'a', status: 'kept', change: { kind: 'tunable', key, from: 30, to: 20 } }];
  // it was moved 30 -> 20 earlier; moving it up again is the other way
  const r = large({ kind: 'tunable', key, from: 20, to: 25 }, null, { history: earlier, tunables });
  assert.equal(r.size, 'large');
  assert.match(r.reasons.join(), /other way/);
  // same direction again is fine
  assert.equal(classify({ kind: 'tunable', key, from: 20, to: 15 }, null, { history: earlier, tunables }).size, 'small');
  assert.equal(large(batch(25), null, { history: [{ status: 'reverted', change: batch(25) }] }).size, 'large');
  assert.match(large({ kind: 'steer', text: 'same steer' }, null, { history: [{ status: 'reverted', change: { kind: 'steer', text: 'Same  steer' } }] }).reasons.join(), /reverted/);
  assert.match(large(batch(25), null, { history: [{ decision: 'declined', change: batch(30) }] }).reasons.join(), /declined/);
  assert.equal(large({ kind: 'steer', text: 'ok', reverses: true }).size, 'large');
  // history about another key does not count
  assert.equal(classify(batch(25), null, { history: [{ status: 'reverted', change: { kind: 'tunable', key: 'slots.max', from: 2, to: 3 } }] }).size, 'small');
});

test('changeKey names the same change the same way', () => {
  assert.equal(changeKey({ kind: 'steer', text: ' A  b ' }), changeKey({ kind: 'steer', text: 'a b' }));
  assert.equal(changeKey(batch(25)), 'tunable:review.maxBatchItems');
});

test('the tunables file keeps the numbers the code had, each with a loosening direction', () => {
  assert.equal(tunable('review.maxBatchItems'), 20);
  assert.equal(tunable('review.maxParallelReviewers'), 4);
  assert.equal(tunable('review.autoMatchMaxDiff'), 0.005);
  assert.equal(tunable('review.pixelTolerance'), 16);
  assert.equal(tunable('slots.max'), 2);
  assert.equal(tunable('slots.waitTimeoutMs'), 30 * 60_000);
  assert.equal(tunable('shoot.commandTimeoutMs'), 90 * 60_000);
  assert.equal(tunable('capture.devServerTimeoutMs'), 300_000);
  assert.equal(tunable('capture.prodBuildTimeoutMs'), 900_000);
  for (const [k, t] of Object.entries(T)) {
    assert.ok(['higher', 'lower', 'never'].includes(t.loosens), k);
    assert.ok(t.min <= t.value && t.value <= t.max, k);
  }
  assert.throws(() => tunable('nope'));
});
