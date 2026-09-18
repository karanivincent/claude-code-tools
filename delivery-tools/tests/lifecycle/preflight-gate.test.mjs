// Preflight waivers, the profile's own probe, --only, and the phase-1 gate's recomputation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '../helpers/runner-stub.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { updateState } from '../../lib/core/state.mjs';
import { runProbes, preflightGate, preflightExit } from '../../lib/lifecycle/preflight.mjs';
import preflightCommand from '../../lib/commands/preflight.mjs';
import { json, fakeDataAdapter as adapter, preflightSetup as setup } from './support.mjs';

test('only P13 can be waived: the observer task becomes waived, a red P2 never does', async () => {
  const { repo, ctx } = await setup({ data: adapter({ members: { 'robot-admin@example.invalid': [{ orgId: 'org-real-0001' }] } }) });
  try {
    let { doc } = await runProbes(ctx);
    assert.equal(doc.probes.find((p) => p.id === 'P13').status, 'task');
    assert.equal(doc.probes.find((p) => p.id === 'P5').status, 'task', 'the robot in the founder\'s organisation is a wave-0 task');
    await updateState(repo.paths, (s) => ({ ...s, waivers: [{ probe: 'P13', note: 'audit my organisation later', at: '2026-01-15T21:00:00.000Z' }, { probe: 'P2', note: 'no', at: '2026-01-15T21:00:00.000Z' }] }), { at: '2026-01-15T21:00:00.000Z', event: 'waive P13 | exit=0' });
    writeFileSync(join(repo.worktree, '.claude/delivery-safety.json'), json({ ...makeSafety(), neverDial: [] }));
    ({ doc } = await runProbes(ctx));
    assert.equal(doc.probes.find((p) => p.id === 'P13').status, 'waived');
    assert.equal(doc.probes.find((p) => p.id === 'P2').status, 'red', 'a waiver of an unwaivable probe changes nothing');
    assert.equal(preflightExit(doc.probes), 3);
    writeFileSync(join(repo.worktree, '.claude/delivery-safety.json'), '{}\n');
    ({ doc } = await runProbes(ctx));
    assert.match(doc.probes.find((p) => p.id === 'P5').detail, /the safety file does not load/);
  } finally { repo.cleanup(); }
  const again = await setup({ data: adapter({ members: {} }) });
  try {
    await updateState(again.repo.paths, (s) => ({ ...s, waivers: [{ probe: 'P13', note: 'later', at: '2026-01-15T21:00:00.000Z' }] }), { at: '2026-01-15T21:00:00.000Z', event: 'waive P13 | exit=0' });
    const { doc } = await runProbes(again.ctx);
    assert.equal(doc.probes.find((p) => p.id === 'P13').status, 'waived');
  } finally { again.repo.cleanup(); }
});

test('an unfilled profile is a wave-0 fix, unless the field is the founder\'s own', async () => {
  const draft = makeProfile({ commands: { ...makeProfile().commands, previewUrl: '<fill in: a preview command for {sha}>' } });
  const { repo, ctx } = await setup({ profile: draft });
  try {
    const { doc } = await runProbes(ctx, { only: ['P1'] });
    const p1 = doc.probes.find((p) => p.id === 'P1');
    assert.equal(p1.status, 'task');
    assert.equal(p1.task, 'T-profile');
    assert.equal(doc.probes.find((p) => p.id === 'P2').status, 'red', 'other probes skip while the profile is invalid');
  } finally { repo.cleanup(); }
  const founder = await setup({ profile: makeProfile({ founder: { github: '<fill in: login>', reportFormat: 'tldr', mergesOwnPRs: true } }) });
  try {
    const { doc } = await runProbes(founder.ctx, { only: ['P1'] });
    assert.equal(doc.probes.find((p) => p.id === 'P1').blocking, true);
  } finally { founder.repo.cleanup(); }
});

test('--only re-runs some probes and keeps the others; the gate notices a changed profile', async () => {
  const { repo, ctx, runner } = await setup();
  try {
    await runProbes(ctx);
    const calls = runner.calls.length;
    const { doc } = await runProbes(ctx, { only: ['P7'] });
    assert.equal(doc.probes.find((p) => p.id === 'P11').status, 'green');
    assert.equal(runner.calls.filter((c, i) => i >= calls && /heavy/.test(c.args?.[1] ?? '')).length, 0, 'P11 was not re-run');
    writeFileSync(join(repo.worktree, '.claude/delivery-profile.json'), json({ ...makeProfile(), limits: { ...makeProfile().limits, maxCuts: 4 } }));
    assert.ok((await preflightGate(ctx)).failures.some((f) => /profile changed since preflight/.test(f.message)));
    await assert.rejects(preflightCommand.run(ctx, ['--only', 'P99']), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});

test('path claims the profile promises but the scope check lacks become task T-path-claims', async () => {
  const profile = makeProfile({ claims: { ...makeProfile().claims, pathClaims: 'scope-check' } });
  const { repo, ctx } = await setup({ profile });
  try {
    let { doc } = await runProbes(ctx, { only: ['P12'] });
    assert.equal(doc.probes.find((p) => p.id === 'P12').task, 'T-path-claims');
    assert.ok(doc.tasks.some((t) => t.id === 'T-path-claims'));
    repo.git('checkout', '-q', 'main');
    writeFileSync(join(repo.primary, 'scope-check.mjs'), "const CLAIMS = '<!-- delivery:claims -->';\n");
    repo.git('add', '-A');
    repo.git('commit', '-q', '-m', 'read path claims');
    repo.git('push', '-q', 'origin', 'main');
    ({ doc } = await runProbes(ctx, { only: ['P12'] }));
    assert.equal(doc.probes.find((p) => p.id === 'P12').status, 'green');
  } finally { repo.cleanup(); }
});
