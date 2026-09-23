// The phase gates compose the other slices' gate-facing functions, recomputed from sources; a
// slice that has not landed is a not-implemented failure line (exit 2), never a crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASS } from '../../lib/core/gate.mjs';
import { notImplementedError } from '../../lib/core/exit.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import * as p0 from '../../lib/gates/phase-0.mjs';
import * as p1 from '../../lib/gates/phase-1.mjs';
import * as p2 from '../../lib/gates/phase-2.mjs';
import * as p3 from '../../lib/gates/phase-3.mjs';
import * as p4 from '../../lib/gates/phase-4.mjs';
import * as p5 from '../../lib/gates/phase-5.mjs';
import * as p6 from '../../lib/gates/phase-6.mjs';
import * as p7 from '../../lib/gates/phase-7.mjs';
import { ctxFor, makeRunRepo, planWith, startRun, unit } from '../run/support.mjs';

const red = (code, message, exit = 1) => ({ ok: false, failures: [{ code, message }], exit });

async function withRun(fn, state = {}) {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, state);
    await fn({ dir, paths });
  } finally { repo.cleanup(); }
}

test('every gate, when the slices it composes have not landed, is red with exit 2 and never throws', async () => {
  await withRun(async ({ dir, paths }) => {
    await writeArtefact(paths, 'plan', planWith());
    const names = ['verifyIntake', 'findEpic', 'preflightGate', 'inventoryGate', 'baselineGate', 'planGate', 'issuesSyncedGate', 'scopeGate',
      'unitGateStatus', 'seedScanGate', 'captureSmokeGate', 'claimsGate', 'waveSyncGate', 'ciStatus', 'checkReady', 'landGate'];
    const deps = Object.fromEntries(names.map((n) => [n, async () => { throw notImplementedError('X', n); }]));
    const { ctx, gh } = await ctxFor(dir, { deps });
    await gh.prCreate({ title: 'widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), base: 'main', head: 'epic/101-widgets' });
    const gates = { p0: p0.gate, p1: p1.gate, p2: p2.gate, p3: p3.gate, p4: p4.gate, p5: p5.gate, p6: p6.gate, p7s: p7.stagingGate };
    for (const [name, g] of Object.entries(gates)) {
      const r = await g(ctx);
      assert.equal(r.ok, false, name);
      assert.equal(r.exit, 2, `${name}: ${JSON.stringify(r)}`);
      assert.ok(r.failures.every((f) => f.code === 'not-implemented'), `${name}: ${JSON.stringify(r.failures)}`);
    }
  });
});

test('phase 0 says a missing epic once, even when verifyIntake also reports it', async () => {
  await withRun(async ({ dir }) => {
    const { ctx } = await ctxFor(dir, { deps: { verifyIntake: async () => red('epic', 'no issue carries the marker (run delivery intake)'), findEpic: async () => null } });
    assert.deepEqual((await p0.gate(ctx)).failures, [{ code: 'epic', message: 'no issue carries the marker (run delivery intake)' }]);
  });
});

test('phase 0: verifyIntake and the epic by marker; a missing epic names its marker', async () => {
  await withRun(async ({ dir }) => {
    const { ctx } = await ctxFor(dir, { deps: { verifyIntake: async () => PASS, findEpic: async () => null } });
    const r = await p0.gate(ctx);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failures, [{ code: 'epic', message: `no issue carries ${makeMarker({ feature: 'widgets', kind: 'epic' })}; run delivery issues sync --epic-only` }]);
    ctx.deps.findEpic = async () => ({ number: 101 });
    assert.deepEqual(await p0.gate(ctx), { ok: true, failures: [] });
    ctx.deps.verifyIntake = async () => red('intake', 'docs/design/widgets does not hash to intent.design.treeSha256');
    assert.equal((await p0.gate(ctx)).failures[0].code, 'intake');
  });
});

test('phase 1: a waived waivable probe no longer blocks; an unwaivable one does, waiver or not', async () => {
  await withRun(async ({ dir }) => {
    const both = { ok: false, failures: [{ code: 'P13', message: 'observer user is not a member' }, { code: 'P2', message: 'safety file differs from origin/main' }], exit: 3 };
    const { ctx } = await ctxFor(dir, { deps: { preflightGate: async () => both } });
    const r = await p1.gate(ctx);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failures.map((f) => f.code), ['P2']);
    assert.equal(r.exit, 3);
    const [part] = await p1.evaluate(ctx);
    assert.deepEqual(part.notes, ['P13 waived: no observer yet']);
    ctx.deps.preflightGate = async () => ({ ok: false, failures: [{ code: 'preflight', message: 'P13 observer user missing' }], exit: 1 });
    assert.deepEqual(await p1.gate(ctx), { ok: true, failures: [] });
  }, { phase: 'preflight', waivers: [{ probe: 'P13', note: 'no observer yet', at: '2026-01-15T20:05:00.000Z' }, { probe: 'P2', note: 'not allowed', at: '2026-01-15T20:05:00.000Z' }] });
});

test('phase 1 applyWaivers is pure and only drops probes the table marks waivable', () => {
  const probes = [{ id: 'P1', waivable: false }, { id: 'P13', waivable: true }];
  const r = p1.applyWaivers(red('P1', 'bad'), [{ probe: 'P1', note: 'x' }], probes);
  assert.equal(r.result.ok, false);
  assert.deepEqual(p1.applyWaivers(red('P13', 'bad'), [{ probe: 'P13', note: 'ok' }], probes), { result: { ok: true, failures: [] }, waived: ['P13 waived: ok'] });
  assert.equal(p1.probeOf({ code: 'x', message: 'P7: no capture spec' }), 'P7');
});

test('phases 2 and 3 compose their parts in order and keep the worst exit', async () => {
  await withRun(async ({ dir }) => {
    const { ctx } = await ctxFor(dir, {
      deps: {
        inventoryGate: async () => red('inventory', 'candidate C-12 is neither mapped nor excluded'),
        baselineGate: async () => PASS,
        planGate: async () => PASS,
        issuesSyncedGate: async () => red('issues', 'unit U2 has no issue'),
        scopeGate: async () => red('scope', 'Scope issue not snapshotted', 4),
      },
    });
    const two = await p2.evaluate(ctx);
    assert.deepEqual(two.map((p) => [p.id, p.result.ok]), [['inventory', false], ['baseline', true]]);
    const three = await p3.gate(ctx);
    assert.deepEqual(three.failures.map((f) => f.code), ['issues', 'scope']);
    assert.equal(three.exit, 4);
  });
});

test('phase 4: every wave-0 unit gated, the contract unit required, seed scan, smoke and claims', async () => {
  await withRun(async ({ dir, paths }) => {
    const seen = [];
    const deps = {
      unitGateStatus: async (_ctx, id) => { seen.push(id); return id === 'T1' ? red('unit', 'T1 report missing') : PASS; },
      seedScanGate: async () => PASS, captureSmokeGate: async () => PASS, claimsGate: async () => PASS,
    };
    const { ctx } = await ctxFor(dir, { deps });
    assert.deepEqual((await p4.gate(ctx)).failures, [{ code: 'plan', message: 'no docs/delivery/<feature>/plan.json; the plan comes before any unit' }]);
    await writeArtefact(paths, 'plan', planWith([unit('U1', 0), unit('T1', 0, { kind: 'tooling' }), unit('U2', 1)]));
    const r = await p4.gate(ctx);
    assert.deepEqual(seen, ['U1', 'T1']);
    assert.deepEqual(r.failures, [{ code: 'unit', message: 'T1 report missing' }]);
    deps.unitGateStatus = async () => PASS;
    await writeArtefact(paths, 'plan', planWith([unit('T1', 0, { kind: 'tooling' }), unit('U2', 1)]));
    assert.equal((await p4.gate(ctx)).failures[0].code, 'contract-unit');
    await writeArtefact(paths, 'plan', planWith([unit('U1', 0), unit('U2', 1)]));
    deps.claimsGate = async () => red('claims', 'child #7 is in the planner queue');
    assert.deepEqual((await p4.evaluate(ctx)).map((p) => [p.id, p.result.ok]), [['contract-unit', true], ['seed-scan', true], ['capture-smoke', true], ['claims', false]]);
  });
});

test('a part that asks for exit 3 or 5 keeps that exit and is never green, whatever it says about ok', async () => {
  await withRun(async ({ dir, paths }) => {
    await writeArtefact(paths, 'plan', planWith([unit('U1', 0), unit('U2', 1)]));
    const deps = {
      unitGateStatus: async () => PASS, captureSmokeGate: async () => PASS, claimsGate: async () => PASS,
      seedScanGate: async () => ({ ok: true, failures: [], exit: 3 }),
    };
    const { ctx } = await ctxFor(dir, { deps });
    const blocked = await p4.gate(ctx);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.exit, 3);
    assert.deepEqual(blocked.failures, [{ code: 'seed-scan', message: 'seed-scan ended with exit 3 (blocked on the founder) and no failure line' }]);
    deps.seedScanGate = async () => ({ ok: false, failures: [{ code: 'M13', message: 'a seeded row matches a derived predicate' }], exit: 3 });
    deps.claimsGate = async () => ({ ok: true, failures: [], exit: 5 });
    const worst = await p4.gate(ctx);
    assert.equal(worst.exit, 5, 'the inconsistency outranks the founder block');
    assert.deepEqual(worst.failures.map((f) => f.code), ['M13', 'claims']);
  });
});

test('phase 5: every unit, the wave sync, and CI on the run PR (pending waits, conflicting is red)', async () => {
  await withRun(async ({ dir, paths }) => {
    await writeArtefact(paths, 'plan', planWith([unit('U1', 0), unit('U2', 1), unit('U3', 2)]));
    const gated = [];
    const deps = {
      unitGateStatus: async (_c, id) => { gated.push(id); return PASS; },
      waveSyncGate: async () => PASS,
      ciStatus: async (_c, { pr, wait }) => { assert.equal(pr, 7); assert.equal(wait, false); return { state: 'pending', headSha: 'a'.repeat(40), detail: '3 checks running' }; },
    };
    const { ctx, gh } = await ctxFor(dir, { deps });
    await gh.prCreate({ title: 'x', body: 'y', base: 'main', head: 'epic/101-widgets' });
    for (let i = 0; i < 5; i++) await gh.issueCreate({ title: `filler ${i}`, body: '' });
    await gh.prCreate({ title: 'widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), base: 'main', head: 'epic/101-widgets' });
    const r = await p5.gate(ctx);
    assert.deepEqual(gated, ['U1', 'U2', 'U3']);
    assert.deepEqual(r, { ok: false, failures: [{ code: 'ci', message: 'CI is pending on PR #7: 3 checks running' }], exit: 4 });
    assert.equal(p5.ciResult(7, { state: 'conflicting' }).exit, 1);
    assert.match(p5.ciResult(7, { state: 'conflicting' }).failures[0].message, /mergeable: CONFLICTING/);
    assert.deepEqual(p5.ciResult(7, { state: 'green' }), PASS);
    assert.equal(p5.ciResult(7, { state: 'weird' }).exit, 2);
  });
});

test('phase 6: checkReady on the run PR; mergedGate waits on the founder until the PR is merged', async () => {
  await withRun(async ({ dir }) => {
    const calls = [];
    const deps = { checkReady: async (_c, { pr }) => { calls.push(pr); return { ok: true, failures: [], headSha: 'a'.repeat(40) }; } };
    const { ctx, gh } = await ctxFor(dir, { deps });
    assert.deepEqual((await p6.gate(ctx)).failures[0].code, 'ready');
    const pr = await gh.prCreate({ title: 'widgets', body: 'x', base: 'main', head: 'epic/101-widgets' });
    const { ctx: c2 } = await ctxFor(dir, { deps, gh });
    const { updateState } = await import('../../lib/core/state.mjs');
    await updateState(c2.requirePaths(), (s) => ({ ...s, pr: pr.number }), { at: '2026-01-15T20:10:00.000Z', event: 'claims open | exit=0' });
    assert.deepEqual(await p6.gate(c2), { ok: true, failures: [] });
    assert.deepEqual(calls, [pr.number]);
    const m = await p6.mergedGate(c2);
    assert.deepEqual(m, { ok: false, failures: [{ code: 'merge', message: `PR #${pr.number} is not merged yet; the merge is the founder's` }], exit: 3 });
    gh.merge(pr.number);
    assert.deepEqual(await p6.mergedGate(c2), { ok: true, failures: [] });
  });
});

test('phase 7: landGate for the run epic, then the epic closed on GitHub', async () => {
  await withRun(async ({ dir }) => {
    const epics = [];
    const deps = { landGate: async (_c, { epic }) => { epics.push(epic); return PASS; } };
    const { ctx, gh } = await ctxFor(dir, { deps });
    const epic = await gh.issueCreate({ title: 'Widgets', body: makeMarker({ feature: 'widgets', kind: 'epic' }) });
    const { updateState } = await import('../../lib/core/state.mjs');
    await updateState(ctx.requirePaths(), (s) => ({ ...s, epic: epic.number }), { at: '2026-01-15T20:10:00.000Z', event: 'intake | exit=0' });
    assert.deepEqual(await p7.stagingGate(ctx), { ok: true, failures: [] });
    assert.deepEqual(epics, [epic.number]);
    const open = await p7.epicClosedGate(ctx);
    assert.match(open.failures[0].message, new RegExp(`epic #${epic.number} is still open`));
    await gh.issueClose(epic.number);
    assert.deepEqual(await p7.gate(ctx), { ok: true, failures: [] });
  });
});
