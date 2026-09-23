// advance (spec 11.2): every earlier gate re-runs from its sources, then the gate of the phase being
// left; only then is the phase recorded. A red earlier gate moves the run back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import advance from '../../lib/commands/advance.mjs';
import { loadState, parseEvent } from '../../lib/core/state.mjs';
import { PASS } from '../../lib/core/gate.mjs';
import { ctxFor, greenGates, makeRunRepo, redGate, startRun } from './support.mjs';

async function runCommand(ctx, argv) {
  try {
    const code = await advance.run(ctx, argv);
    return ctx.out.finish(code);
  } catch (err) {
    if (typeof err.exit !== 'number') throw err;
    for (const f of err.failures) ctx.out.fail(f.code, f.message);
    return ctx.out.finish(err.exit);
  }
}

/** Gate stubs that record which gates ran, in order. */
function spyGates(overrides = {}) {
  const ran = [];
  const deps = greenGates();
  for (const k of Object.keys(deps)) {
    const inner = overrides[k] ?? deps[k];
    deps[k] = async (ctx) => { ran.push(k.slice(5)); return inner(ctx); };
  }
  return { deps, ran };
}

async function setup(state, overrides) {
  const { repo, dir } = makeRunRepo();
  const paths = await startRun(dir, state);
  const spy = spyGates(overrides);
  const t = await ctxFor(dir, { deps: spy.deps });
  return { repo, dir, paths, ...t, ran: spy.ran };
}

test('advance re-runs every earlier gate, then the one being left, and records the phase', async () => {
  const s = await setup({ phase: 'wave0' });
  try {
    assert.equal(await runCommand(s.ctx, ['build']), 0);
    assert.deepEqual(s.ran, ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4']);
    const state = await loadState(s.paths.state);
    assert.equal(state.phase, 'build');
    assert.deepEqual(parseEvent(state.journal.at(-1).event), { command: 'advance build', exit: 0, counts: { from: 'wave0', gates: '5' } });
    assert.match(s.stdout.text(), /advanced to build/);
  } finally { s.repo.cleanup(); }
});

test('advance refuses to skip a phase, to go back, an unknown phase, and a closed run (exit 2)', async () => {
  const s = await setup({ phase: 'plan' });
  try {
    assert.equal(await runCommand(s.ctx, ['build']), 2);
    assert.match(s.stdout.text(), /one phase at a time; the run is at plan, and the next phase is wave0/);
    assert.equal(await runCommand(s.ctx, ['preflight']), 2);
    assert.equal(await runCommand(s.ctx, ['shipped']), 2);
    assert.equal(await runCommand(s.ctx, []), 2);
    assert.deepEqual(s.ran, []);
    assert.equal((await loadState(s.paths.state)).phase, 'plan');
  } finally { s.repo.cleanup(); }
  const c = await setup({ phase: 'closed' });
  try {
    assert.equal(await runCommand(c.ctx, ['closed']), 2);
    assert.match(c.stdout.text(), /the run is closed/);
  } finally { c.repo.cleanup(); }
});

test('a run whose pull request was closed without a merge closes from any phase, and only then', async () => {
  // The widgets rehearsal's PR was closed at phase pr, and "one phase at a time" left no way to
  // close the run: the session-start hook would have told every later session to resume it.
  const s = await setup({ phase: 'pr' });
  try {
    const pr = await s.gh.prCreate({ title: 'Widgets', body: '', base: 'main', head: 'epic/101-widgets' });
    const st = JSON.parse(readFileSync(s.paths.state, 'utf8'));
    st.pr = pr.number;
    writeFileSync(s.paths.state, JSON.stringify(st, null, 2) + '\n');
    assert.equal(await runCommand(s.ctx, ['closed']), 2, 'an open PR cannot be skipped past');
    s.gh.close(pr.number);
    assert.equal(await runCommand(s.ctx, ['closed']), 0);
    const state = await loadState(s.paths.state);
    assert.equal(state.phase, 'closed');
    assert.deepEqual(parseEvent(state.journal.at(-1).event), { command: 'advance closed', exit: 0, counts: { from: 'pr', abandoned: 'true' } });
    assert.match(s.stdout.text(), /closed without a merge/);
    assert.deepEqual(s.ran, [], 'no gate is asked about a run nobody will land');
  } finally { s.repo.cleanup(); }
});

test('a red earlier gate moves the run back to that phase (exit 1); exit 3 too', async () => {
  const s = await setup({ phase: 'build' }, { 'gate:phase-2': redGate('candidate C-04 is neither mapped nor excluded', { part: 'inventory' }) });
  try {
    assert.equal(await runCommand(s.ctx, ['pr']), 1);
    assert.deepEqual(s.ran, ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5']);
    const state = await loadState(s.paths.state);
    assert.equal(state.phase, 'inventory');
    assert.deepEqual(parseEvent(state.journal.at(-1).event).counts, { from: 'build', back: 'inventory', red: '1' });
    assert.match(s.stdout.text(), /FAIL inventory phase-2: candidate C-04 is neither mapped nor excluded/);
    assert.match(s.stdout.text(), /moved back to inventory/);
  } finally { s.repo.cleanup(); }
  const b = await setup({ phase: 'plan' }, { 'gate:phase-1': redGate('P2 safety file edited locally', { exit: 3, part: 'preflight', code: 'P2' }) });
  try {
    assert.equal(await runCommand(b.ctx, ['wave0']), 3);
    assert.equal((await loadState(b.paths.state)).phase, 'preflight');
  } finally { b.repo.cleanup(); }
});

test('wait (4), configuration (2) and tampering (5) never move a run back', async () => {
  for (const [exit, phase] of [[4, 'pr'], [2, 'build'], [5, 'build']]) {
    const s = await setup({ phase }, { 'gate:phase-2': redGate('not now', { exit }) });
    try {
      const next = phase === 'pr' ? 'ready' : 'pr';
      assert.equal(await runCommand(s.ctx, [next]), exit);
      const state = await loadState(s.paths.state);
      assert.equal(state.phase, phase, `exit ${exit}`);
      assert.equal(parseEvent(state.journal.at(-1).event).exit, exit);
    } finally { s.repo.cleanup(); }
  }
});

test('a red gate of the phase being left keeps the phase, and says why', async () => {
  const s = await setup({ phase: 'plan' }, { 'gate:phase-3': redGate('Scope issue not posted', { part: 'scope' }) });
  try {
    assert.equal(await runCommand(s.ctx, ['wave0']), 1);
    assert.equal((await loadState(s.paths.state)).phase, 'plan');
    assert.match(s.stdout.text(), /FAIL scope phase-3: Scope issue not posted/);
    assert.match(s.stdout.text(), /stays at plan/);
  } finally { s.repo.cleanup(); }
});

test('naming the current phase re-validates the earlier gates without advancing', async () => {
  const s = await setup({ phase: 'inventory' });
  try {
    assert.equal(await runCommand(s.ctx, ['inventory']), 0);
    assert.deepEqual(s.ran, ['phase-0', 'phase-1']);
    assert.equal((await loadState(s.paths.state)).phase, 'inventory');
    assert.match(s.stdout.text(), /already at inventory/);
  } finally { s.repo.cleanup(); }
});

test('after the merge only the gates from "pr" on re-run, and a red one never moves the run back', async () => {
  const s = await setup({ phase: 'landed' }, { 'gate:phase-6': redGate('ready.json red for the merged head', { part: 'ready' }) });
  try {
    assert.equal(await runCommand(s.ctx, ['closed']), 1);
    assert.deepEqual(s.ran, ['phase-6', 'merge', 'staging', 'epic-closed']);
    assert.equal((await loadState(s.paths.state)).phase, 'landed');
  } finally { s.repo.cleanup(); }
});

test('hand-editing the phase in state.json skips nothing: the gates it skipped re-run and send it back', async () => {
  const s = await setup({ phase: 'inventory' }, { 'gate:phase-2': redGate('no inventory.json yet', { part: 'inventory' }) });
  try {
    const raw = JSON.parse(readFileSync(s.paths.state, 'utf8'));
    raw.phase = 'build';
    writeFileSync(s.paths.state, JSON.stringify(raw, null, 2) + '\n');
    assert.equal(await runCommand(s.ctx, ['pr']), 1);
    assert.equal((await loadState(s.paths.state)).phase, 'inventory');
  } finally { s.repo.cleanup(); }
});

test('a broken journal is exit 5 before any gate runs', async () => {
  const s = await setup({ phase: 'plan' });
  try {
    const raw = JSON.parse(readFileSync(s.paths.state, 'utf8'));
    raw.journal[1].event = 'rewritten history';
    writeFileSync(s.paths.state, JSON.stringify(raw, null, 2) + '\n');
    assert.equal(await runCommand(s.ctx, ['wave0']), 5);
    assert.deepEqual(s.ran, []);
    assert.match(s.stdout.text(), /journal chain broken at entry 1/);
  } finally { s.repo.cleanup(); }
});

test('advance in a worktree that holds no run is a usage error naming where to work (exit 2)', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const { ctx, stdout } = await ctxFor(dir, { feature: 'widgets' });
    assert.equal(await runCommand(ctx, ['preflight']), 2);
    assert.match(stdout.text(), /no run "widgets" in this worktree .*; work from the run's worktree, which delivery status names/);
  } finally { repo.cleanup(); }
});

test('advance composes the real gate modules when no stub replaces them', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'intake' });
    const { ctx } = await ctxFor(dir, { deps: { verifyIntake: async () => PASS, findEpic: async () => ({ number: 101 }) } });
    assert.equal(await runCommand(ctx, ['preflight']), 0);
    assert.equal((await loadState(paths.state)).phase, 'preflight');
  } finally { repo.cleanup(); }
});
