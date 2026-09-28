// C2: what repeats becomes a proposal with evidence, a change, a size and a metric.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, median, normaliseEntry, metricValue, idFor, proposalsFromInput, SLOW_ALONE_MINUTES } from '../../lib/retro/compare.mjs';
import { classify } from '../../lib/retro/size.mjs';

const phases = (o = {}) => ({ intake: 5, render: 20, map: 30, seed: 10, build: 90, shoot: 15, review: 40, ci: 25, ...o });
const rec = (feature, p = {}, extra = {}) => ({ schemaVersion: 1, feature, endedAt: '2026-01-01T00:00:00.000Z', pluginVersion: '0.12.0', phases: phases(p), founder: null, rounds: [], reviewers: [], ciAfterPr: [], improvements: [], autoChanges: [], ...extra });

test('median of numbers, ignoring nulls', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, null, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([null]), null);
});

test('a steady run proposes nothing', () => {
  assert.deepEqual(compare([rec('a'), rec('b'), rec('c')], rec('d')), []);
});

test('a phase 30% over the median in two runs (this one included) is a proposal, with evidence', () => {
  const earlier = [rec('a'), rec('b'), rec('c', { shoot: 25 })];
  const cur = rec('d', { shoot: 28 });
  const out = compare(earlier, cur);
  assert.equal(out.length, 1);
  const p = out[0];
  assert.deepEqual(p.evidence.map((e) => [e.feature, e.phase, e.minutesLost]), [['c', 'shoot', 10], ['d', 'shoot', 13]]);
  assert.deepEqual(p.metric, { name: 'phases.shoot', baseline: 15, better: 'lower' });
  assert.equal(p.change.kind, 'other');
  assert.match(p.change.description, /shoot phase took 28 minutes/);
  assert.equal(classify(p.change).size, 'large', 'a change the retro cannot author is left to the founder');
});

test('a slow phase in this run only, but under an hour over, is not yet a proposal; over an hour, it is', () => {
  const earlier = [rec('a'), rec('b'), rec('c')];
  assert.deepEqual(compare(earlier, rec('d', { build: 90 + SLOW_ALONE_MINUTES })), [], 'exactly an hour over is not more than an hour');
  const out = compare(earlier, rec('d', { build: 90 + SLOW_ALONE_MINUTES + 1 }));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].evidence.map((e) => [e.feature, e.phase, e.minutesLost]), [['d', 'build', 61]]);
});

test('an earlier slow run does not count unless this run is slow too', () => {
  assert.deepEqual(compare([rec('a'), rec('b', { shoot: 30 }), rec('c', { shoot: 30 })], rec('d')), []);
});

test('with no earlier run there is no median, so no proposal', () => {
  assert.deepEqual(compare([], rec('a', { build: 500 })), []);
});

test('a null phase in this run or the earlier ones is skipped', () => {
  assert.deepEqual(compare([rec('a', { seed: null }), rec('b', { seed: null })], rec('c', { seed: 400 })), []);
  assert.deepEqual(compare([rec('a'), rec('b')], rec('c', { review: null })), []);
});

test('slow review with room to grow proposes one batch-size step, which is small', () => {
  const out = compare([rec('a'), rec('b', { review: 60 })], rec('c', { review: 80 }));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].change, { kind: 'tunable', key: 'review.maxBatchItems', from: 20, to: 25 });
  assert.equal(out[0].metric.name, 'phases.review');
  assert.equal(classify(out[0].change).size, 'small');
});

test('slow review with the batch size already at its ceiling falls back to a described, large change', () => {
  const tunables = { 'review.maxBatchItems': { value: 40, min: 5, max: 40, step: 5, loosens: 'never' } };
  const out = compare([rec('a'), rec('b', { review: 60 })], rec('c', { review: 80 }), { tunables });
  assert.equal(out[0].change.kind, 'other');
});

test('the same improvement in two runs proposes a steer, however it is worded around the numbers', () => {
  const a = rec('a', {}, { improvements: ['Shoot the empty state first (2 rounds lost)'] });
  const b = rec('b', {}, { improvements: ['unrelated'] });
  const c = rec('c', {}, { improvements: ['shoot the empty state first, 3 rounds lost'] });
  assert.equal(normaliseEntry('Shoot the Empty state first (2 rounds lost)'), normaliseEntry('shoot the empty state first, 3 rounds lost'));
  const out = compare([a, b], c);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].change, { kind: 'steer', text: 'shoot the empty state first, 3 rounds lost' });
  assert.deepEqual(out[0].evidence.map((e) => e.feature).sort(), ['a', 'c']);
  assert.equal(classify(out[0].change).size, 'small');
});

test('an improvement seen once, or only in earlier runs, proposes nothing', () => {
  assert.deepEqual(compare([rec('a', {}, { improvements: ['x thing'] })], rec('b', {}, { improvements: ['other thing'] })), []);
  assert.deepEqual(compare([rec('a', {}, { improvements: ['x thing'] }), rec('b', {}, { improvements: ['x thing'] })], rec('c')), []);
});

test('a proposal already in the ledger (any status) is not proposed again', () => {
  const earlier = [rec('a'), rec('b', { review: 60 })];
  const cur = rec('c', { review: 80 });
  const [p] = compare(earlier, cur);
  assert.deepEqual(compare(earlier, cur, { history: [{ id: p.id, status: 'applied' }] }), []);
  assert.deepEqual(compare(earlier, cur, { history: [{ id: p.id, status: 'reverted' }] }), []);
});

test('this feature\'s own earlier line is not treated as an earlier run', () => {
  const out = compare([rec('a'), rec('b'), rec('c', { build: 400 })], rec('c', { build: 400 }));
  assert.equal(out.length, 1);
});

test('ids are stable, and differ by target value', () => {
  const a = { kind: 'tunable', key: 'review.maxBatchItems', from: 20, to: 25 };
  assert.equal(idFor(a), idFor({ ...a }));
  assert.notEqual(idFor(a), idFor({ ...a, to: 30 }));
  assert.match(idFor(a), /^[a-z0-9][a-z0-9-]*$/);
  assert.match(idFor({ kind: 'steer', text: 'Shoot the empty state first' }), /^steer-shoot-the-empty-state-first-[0-9a-f]{8}$/);
});

test('metricValue reads what a change names', () => {
  const r = rec('a', { review: 44 }, { ciAfterPr: [{ check: 'x', cause: 'y' }], founder: { waitMinutes: 12, questions: 1 }, rounds: [{ round: 1, match: 1, small: 0, toFix: 3, notReached: 0, dataGap: 0, carried: 0 }, { round: 2, match: 1, small: 0, toFix: 2, notReached: 0, dataGap: 0, carried: 0 }] });
  assert.equal(metricValue(r, 'phases.review'), 44);
  assert.equal(metricValue(r, 'ciFailures'), 1);
  assert.equal(metricValue(r, 'founder.waitMinutes'), 12);
  assert.equal(metricValue(r, 'rounds.toFix'), 5);
  assert.equal(metricValue(r, 'rounds.count'), 2);
  assert.equal(metricValue(r, 'nope'), null);
  assert.equal(metricValue(rec('b'), 'rounds.toFix'), null);
  assert.equal(metricValue(null, 'phases.review'), null);
});

test('a proposal handed in from a file is checked for shape, and gets an id', () => {
  const [p] = proposalsFromInput({ change: { kind: 'steer', text: 'Name the state' } });
  assert.match(p.id, /^steer-/);
  assert.deepEqual(p.metric, { name: 'rounds.toFix', baseline: null, better: 'lower' });
  const two = proposalsFromInput([{ id: 'mine-1', change: { kind: 'command', name: 'x' }, metric: { name: 'ciFailures', baseline: 2, better: 'lower' }, evidence: [{ feature: 'a', phase: 'ci', minutesLost: 5 }] }]);
  assert.equal(two[0].id, 'mine-1');
  assert.equal(two[0].metric.baseline, 2);
  assert.throws(() => proposalsFromInput({ nothing: 1 }), /needs a change/);
  assert.throws(() => proposalsFromInput([null]), /needs a change/);
});
