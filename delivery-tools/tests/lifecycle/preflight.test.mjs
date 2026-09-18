// Preflight (spec 4.1): repo prerequisites become wave-0 tasks, red-circle items exit 3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '../helpers/runner-stub.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { readArtefact } from '../../lib/core/artefacts.mjs';
import { runProbes, preflightGate, preflightExit, scriptOf, PROBES } from '../../lib/lifecycle/preflight.mjs';
import preflightCommand from '../../lib/commands/preflight.mjs';
import { makeRunRepo, ctxFor, json, fakeDataAdapter as adapter, preflightSetup as setup } from './support.mjs';

test('a fresh repo: prerequisites become wave-0 tasks, nothing needs the founder, preflight.json validates', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    assert.equal(await preflightCommand.run(ctx, []), 0);
    const doc = await readArtefact(repo.paths, 'preflight');
    const status = Object.fromEntries(doc.probes.map((p) => [p.id, p.status]));
    assert.deepEqual(status, {
      P1: 'green', P2: 'green', P3: 'green', P4: 'green', P5: 'green', P6: 'green', P7: 'task', P8: 'task', P9: 'warning',
      P10: 'task', P11: 'green', P12: 'warning', P13: 'green', P14: 'task', P15: 'warning', P16: 'warning',
    });
    assert.deepEqual(doc.tasks.map((t) => t.id), ['T-capture', 'T-version', 'T-bootstrap', 'T-locales']);
    assert.match(stdout.lines()[0], /^Needs you: nothing\./);
    assert.ok(stdout.lines().some((l) => /T-capture \(P7\) Commit the capture spec/.test(l)));
    assert.deepEqual((await preflightGate(ctx)).failures, []);
  } finally { repo.cleanup(); }
});

test('a locally edited safety file is a red-circle item: exit 3, and the gate says so', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    writeFileSync(join(repo.worktree, '.claude/delivery-safety.json'), json({ ...makeSafety(), neverDial: [] }));
    assert.equal(await preflightCommand.run(ctx, []), 3);
    assert.match(stdout.text(), /FAIL P2 🔴 \.claude\/delivery-safety\.json differs from origin\/main \(edited locally\)\. Fix: Restore it from origin\/main/);
    const g = await preflightGate(ctx);
    assert.equal(g.exit, 3);
    assert.ok(g.failures.some((f) => f.code === 'P2'));
  } finally { repo.cleanup(); }
});

test('no safety file at all, a production test project, and no database access are all red-circle', async () => {
  const { repo, ctx } = await setup({ profile: { ...makeProfile(), environments: { test: { name: 'test', projectRef: 'prodprojectref', appUrl: 'https://test.example.invalid' }, previews: 'vercel' } }, data: adapter({ write: false }) });
  try {
    const { doc } = await runProbes(ctx);
    const p3 = doc.probes.find((p) => p.id === 'P3');
    assert.equal(p3.status, 'red');
    assert.equal(p3.blocking, true);
    assert.match(p3.detail, /listed as production/);
    assert.equal(preflightExit(doc.probes), 3);
  } finally { repo.cleanup(); }
  const bare = await makeRunRepo({ files: { '.claude/delivery-profile.json': json(makeProfile()) } });
  try {
    const { ctx } = await ctxFor(bare.worktree, { deps: { createDataAdapter: async () => adapter({ read: false }), deriveSideEffects: async () => ({}), seedCheckGate: async () => ({ ok: true, failures: [] }) }, rules: [{ match: /.*/, result: ok('') }] });
    const { doc } = await runProbes(ctx);
    const p2 = doc.probes.find((p) => p.id === 'P2');
    assert.equal(p2.status, 'red');
    assert.equal(p2.blocking, true);
    assert.match(p2.detail, /no safety file/);
    assert.equal(doc.probes.find((p) => p.id === 'P3').blocking, true);
  } finally { bare.cleanup(); }
});

test('scriptOf and the probe table', () => {
  assert.equal(scriptOf("node scripts/agent-up.mjs --dir {dir}"), 'scripts/agent-up.mjs');
  assert.equal(scriptOf('pnpm flight'), null);
  assert.deepEqual(PROBES.filter((p) => p.waivable).map((p) => p.id), ['P13']);
});
