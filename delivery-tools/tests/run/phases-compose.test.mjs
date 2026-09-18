// The phase table (spec 3.4) and gate-part composition: a missing slice or a crash is a failure
// line, never a crash of advance or status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASES, STEPS, earlierSteps, isPostMerge, nextPhase, phaseIndex, stepOf } from '../../lib/run/phases.mjs';
import { combine, dep, normalise, partsResult, red, safePart } from '../../lib/run/compose.mjs';
import { notImplementedError, UsageError, WaitError } from '../../lib/core/exit.mjs';
import { PASS } from '../../lib/core/gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the phases are the state schema enum, in order, one step each', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'state.schema.json'), 'utf8'));
  assert.deepEqual([...PHASES], schema.properties.phase.enum);
  assert.deepEqual(STEPS.map((s) => s.phase), [...PHASES]);
  assert.deepEqual(STEPS.slice(0, 7).map((s) => s.gate), ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5', 'phase-6']);
  assert.deepEqual(STEPS.slice(7).map((s) => s.gate), ['merge', 'staging', 'epic-closed', null]);
  assert.equal(stepOf('inventory').skill, 'design-inventory');
  assert.equal(stepOf('plan').skill, 'coverage-plan');
  assert.equal(stepOf('build').skill, 'epic-build');
  assert.equal(nextPhase('wave0'), 'build');
  assert.equal(nextPhase('closed'), null);
  assert.throws(() => phaseIndex('shipping'), (e) => e.exit === 2);
});

test('earlier steps: every one before the merge; after it, only from "pr" on', () => {
  assert.deepEqual(earlierSteps('intake'), []);
  assert.deepEqual(earlierSteps('build').map((s) => s.gate), ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4']);
  assert.deepEqual(earlierSteps('ready').map((s) => s.gate), ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5', 'phase-6']);
  assert.equal(isPostMerge('ready'), false);
  assert.equal(isPostMerge('merged'), true);
  assert.deepEqual(earlierSteps('merged').map((s) => s.gate), ['phase-6', 'merge']);
  assert.deepEqual(earlierSteps('closed').map((s) => s.gate), ['phase-6', 'merge', 'staging', 'epic-closed']);
});

test('safePart: a not-implemented slice is a failure line with exit 2, a crash is "internal" exit 2', async () => {
  const ni = await safePart('intake', async () => { throw notImplementedError('A2', 'verifyIntake'); });
  assert.deepEqual(ni, { ok: false, failures: [{ code: 'not-implemented', message: 'not implemented (slice A2): verifyIntake' }], exit: 2 });
  const wait = await safePart('ci', async () => { throw new WaitError('CI pending'); });
  assert.equal(wait.exit, 4);
  assert.equal(wait.failures[0].code, 'ci');
  const crash = await safePart('plan', async () => { throw new TypeError('x is undefined'); });
  assert.deepEqual(crash, { ok: false, failures: [{ code: 'internal', message: 'plan: x is undefined' }], exit: 2 });
  const junk = await safePart('scope', async () => undefined);
  assert.equal(junk.ok, false);
  assert.equal(junk.failures[0].code, 'internal');
  assert.deepEqual(await safePart('x', async () => PASS), { ok: true, failures: [] });
});

test('normalise: ok with failures is red; red with no failures gets one; exit defaults to 1', () => {
  assert.deepEqual(normalise('p', { ok: true, failures: [{ code: 'a', message: 'm' }] }), { ok: false, failures: [{ code: 'a', message: 'm' }], exit: 1 });
  assert.deepEqual(normalise('p', { ok: false, failures: [] }), { ok: false, failures: [{ code: 'p', message: 'p is red' }], exit: 1 });
  assert.equal(normalise('p', { ok: false, failures: [{ code: 'a', message: 'm' }], exit: 3 }).exit, 3);
  assert.deepEqual(normalise('p', { ok: true, failures: [], exit: 0 }), { ok: true, failures: [] });
});

test('normalise: a non-zero exit is never green, even on a result that says ok with no failure line', () => {
  assert.deepEqual(normalise('seed-scan', { ok: true, failures: [], exit: 3 }), { ok: false, failures: [{ code: 'seed-scan', message: 'seed-scan ended with exit 3 (blocked on the founder) and no failure line' }], exit: 3 });
  assert.deepEqual(normalise('checks', { ok: true, failures: [], exit: 5 }), { ok: false, failures: [{ code: 'checks', message: 'checks ended with exit 5 (inconsistency) and no failure line' }], exit: 5 });
  assert.equal(normalise('x', { ok: true, failures: [], exit: 2 }).exit, 2);
});

test('combine keeps the most serious exit and drops exact duplicate lines', () => {
  const r = combine([red('epic', 'no epic'), red('epic', 'no epic'), red('ci', 'pending', 4), PASS]);
  assert.deepEqual(r.failures, [{ code: 'epic', message: 'no epic' }, { code: 'ci', message: 'pending' }]);
  assert.equal(r.exit, 4);
  assert.deepEqual(partsResult([{ id: 'a', result: PASS }]), { ok: true, failures: [] });
  assert.equal(combine([red('a', 'x', 5), red('b', 'y', 2)]).exit, 5);
});

test('dep: ctx.deps replaces a function only in tests', () => {
  const real = () => 'real';
  assert.equal(dep({}, 'f', real)(), 'real');
  assert.equal(dep({ deps: { f: () => 'stub' } }, 'f', real)(), 'stub');
  assert.throws(() => { throw new UsageError('x'); });
});
