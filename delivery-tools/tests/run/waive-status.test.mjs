// waive (spec 4.1) and status (spec 11.3): the founder's named waiver for a waivable probe, and
// exactly one NEXT line in every mode, from recomputed sources, writing nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import waive from '../../lib/commands/waive.mjs';
import status, { selectRun } from '../../lib/commands/status.mjs';
import { writeArtefact } from '../../lib/core/artefacts.mjs';
import { loadState, parseEvent, createState } from '../../lib/core/state.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { gate as phase1 } from '../../lib/gates/phase-1.mjs';
import { validExample } from '../helpers/fixtures.mjs';
import { AT, ctxFor, greenGates, makeRunRepo, nextLines, planWith, redGate, startRun } from './support.mjs';

async function run(mod, ctx, argv) {
  try {
    return ctx.out.finish(await mod.run(ctx, argv));
  } catch (err) {
    if (typeof err.exit !== 'number') throw err;
    for (const f of err.failures) ctx.out.fail(f.code, f.message);
    return ctx.out.finish(err.exit);
  }
}

function preflightWith(status13) {
  const p = validExample('preflight');
  p.probes = p.probes.map((x) => (x.id === 'P13' ? { ...x, status: status13 } : x));
  return p;
}

test('waive records a waivable red probe with his note; the phase-1 gate then lets it pass', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'preflight' });
    await writeArtefact(paths, 'preflight', preflightWith('red'));
    const { ctx, stdout } = await ctxFor(dir, { deps: { preflightGate: async () => ({ ok: false, failures: [{ code: 'P13', message: 'P13 observer user missing' }], exit: 1 }) } });
    assert.equal((await phase1(ctx)).ok, false);
    assert.equal(await run(waive, ctx, ['p13', '--note', 'no observer until next week']), 0);
    assert.match(stdout.text(), /waived P13 \(Observer user is a member of the founder's organisation\): no observer until next week/);
    await run(waive, ctx, ['P13', '--note', 'still none']);
    const s = await loadState(paths.state);
    assert.deepEqual(s.waivers.map((w) => [w.probe, w.note]), [['P13', 'still none']]);
    assert.deepEqual(parseEvent(s.journal.at(-1).event), { command: 'waive P13', exit: 0, counts: { status: 'red' } });
    assert.deepEqual(await phase1(ctx), { ok: true, failures: [] });
  } finally { repo.cleanup(); }
});

test('waive refuses an unwaivable probe, an unknown one, no note, no preflight, a green probe (exit 2)', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'preflight' });
    const { ctx, stdout } = await ctxFor(dir);
    assert.equal(await run(waive, ctx, ['P2', '--note', 'please']), 2);
    assert.match(stdout.text(), /P2 cannot be waived/);
    assert.equal(await run(waive, ctx, ['P99', '--note', 'x']), 2);
    assert.equal(await run(waive, ctx, ['P13']), 2);
    assert.equal(await run(waive, ctx, ['P13', '--note', '  ']), 2);
    assert.equal(await run(waive, ctx, ['P13', '--note', 'x']), 2);
    assert.match(stdout.text(), /no preflight\.json yet/);
    await writeArtefact(paths, 'preflight', preflightWith('green'));
    assert.equal(await run(waive, ctx, ['P13', '--note', 'x']), 2);
    assert.match(stdout.text(), /P13 is green in preflight\.json; there is nothing to waive/);
    assert.deepEqual((await loadState(paths.state)).waivers, []);
  } finally { repo.cleanup(); }
});

test('status prints exactly one NEXT line in text, --brief and --json, and writes nothing', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'plan' });
    await writeArtefact(paths, 'plan', planWith());
    const deps = greenGates({ 'gate:phase-3': redGate('unit U2 has no issue', { part: 'issues' }) });
    const before = readFileSync(paths.state, 'utf8');
    for (const argv of [[], ['--brief']]) {
      const { ctx, stdout } = await ctxFor(dir, { deps });
      assert.equal(await run(status, ctx, argv), 0);
      assert.deepEqual(nextLines(stdout.text()).map((l) => l.replace(/node \S+delivery\.mjs/g, 'delivery')), ['NEXT: delivery issues sync (unit U2 has no issue) (skill: coverage-plan)']);
    }
    const { ctx, stdout } = await ctxFor(dir, { deps, json: true });
    assert.equal(await run(status, ctx, []), 0);
    const out = JSON.parse(stdout.text());
    assert.equal(out.lines.filter((l) => l.startsWith('NEXT:')).length, 1);
    assert.equal(out.data.next.skill, 'coverage-plan');
    assert.equal(out.data.phase, 'plan');
    assert.deepEqual(out.data.gates.map((g) => [g.gate, g.ok]), [['phase-0', true], ['phase-1', true], ['phase-2', true], ['phase-3', false]]);
    assert.equal(readFileSync(paths.state, 'utf8'), before, 'status writes nothing');
  } finally { repo.cleanup(); }
});

test('status --brief never passes 12 lines, however much is red', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    await startRun(dir, { phase: 'build', wave: 1 });
    const many = async () => [{ id: 'x', result: { ok: false, failures: Array.from({ length: 30 }, (_, i) => ({ code: 'M7', message: `leak ${i}` })), exit: 2 } }];
    const { ctx, stdout } = await ctxFor(dir, { deps: greenGates({ 'gate:phase-2': many, 'gate:phase-5': many }) });
    assert.equal(await run(status, ctx, ['--brief']), 0);
    const lines = stdout.text().trim().split('\n');
    assert.ok(lines.length <= 12, `${lines.length} lines`);
    assert.equal(nextLines(stdout.text()).length, 1);
    assert.match(stdout.text(), /red: and \d+ more/);
  } finally { repo.cleanup(); }
});

test('a broken journal: status still prints one NEXT line, which says stop, and exits 5', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    const paths = await startRun(dir, { phase: 'build' });
    const raw = JSON.parse(readFileSync(paths.state, 'utf8'));
    raw.journal[0].at = '2026-01-15T19:00:00.000Z';
    writeFileSync(paths.state, JSON.stringify(raw, null, 2) + '\n');
    const { ctx, stdout } = await ctxFor(dir, { deps: greenGates() });
    assert.equal(await run(status, ctx, []), 5);
    const next = nextLines(stdout.text());
    assert.equal(next.length, 1);
    assert.match(next[0], /^NEXT: stop: .*journal chain broken at entry 0.*; nothing under \.delivery\/ may be edited by hand/);
    assert.match(stdout.text(), /FAIL inconsistent /);
  } finally { repo.cleanup(); }
});

test('no run, two runs, and an unknown --feature each give one NEXT line saying what to do', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    let t = await ctxFor(dir);
    assert.equal(await run(status, t.ctx, []), 0);
    assert.deepEqual(nextLines(t.stdout.text()), ['NEXT: no active delivery run in this repository; start one with /deliver-from-design <archive> "<one sentence of intent>" (skill: deliver-from-design)']);
    await startRun(dir, { phase: 'plan' });
    await createState(featurePaths(dir, 'gadgets'), { feature: 'gadgets', runId: 'r-20260115-2000-cd34', worktree: dir, branch: 'epic/102-gadgets', epic: 102, at: AT });
    t = await ctxFor(dir, { deps: greenGates() });
    assert.equal(await run(status, t.ctx, []), 0);
    assert.match(nextLines(t.stdout.text())[0], /^NEXT: 2 runs are active: gadgets \(.*\), widgets \(.*\); run .* status --feature <slug>/);
    t = await ctxFor(dir, { deps: greenGates(), feature: 'gizmos' });
    assert.equal(await run(status, t.ctx, []), 2);
    assert.match(nextLines(t.stdout.text())[0], /^NEXT: no run named gizmos in this repository \(runs: gadgets, widgets\)/);
    t = await ctxFor(dir, { deps: greenGates(), feature: 'gadgets' });
    assert.equal(await run(status, t.ctx, []), 0);
    assert.match(nextLines(t.stdout.text())[0], /advance preflight \(skill: deliver-from-design\)$/);
  } finally { repo.cleanup(); }
});

test('status compares a PR marked ready with the ready records whatever the phase, and leads with it', async () => {
  const { repo, dir } = makeRunRepo();
  try {
    await startRun(dir, { phase: 'build', wave: 1, pr: 1 });
    const { ctx, gh, stdout } = await ctxFor(dir, { deps: greenGates() });
    await gh.prCreate({ title: 'Widgets', body: 'x', base: 'main', head: 'epic/101-widgets' });
    gh.markReady(1);
    assert.equal(await run(status, ctx, []), 0);
    const next = nextLines(stdout.text());
    assert.deepEqual(next, ['NEXT: PR #1 is marked ready for review without a green ready.json for its head (no ready.json for PR #1; run delivery ready --pr 1); put it back to draft first: gh pr ready 1 --undo (skill: deliver-from-design)']);
    assert.match(stdout.text().split('\n')[2], /^red PR #1 is marked ready for review without a green ready\.json/);
  } finally { repo.cleanup(); }
});

test('selectRun prefers the run in this worktree, then the only run anywhere', () => {
  const runs = [{ feature: 'a', worktree: '/w1' }, { feature: 'b', worktree: '/w2' }];
  assert.equal(selectRun(runs, { feature: null, repoRoot: '/w2', cli: 'delivery' }).run.feature, 'b');
  assert.equal(selectRun([runs[0]], { feature: null, repoRoot: '/w9', cli: 'delivery' }).run.feature, 'a');
  assert.equal(selectRun(runs, { feature: null, repoRoot: '/w9', cli: 'delivery' }).run, null);
  assert.equal(selectRun(runs, { feature: 'b', repoRoot: '/w1', cli: 'delivery' }).run.worktree, '/w2');
});
