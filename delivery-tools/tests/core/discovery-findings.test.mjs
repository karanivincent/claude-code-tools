// Run discovery across worktrees, the ctx, artefact reads, and findings upserts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../../lib/core/git.mjs';
import { discoverRuns, resolveFeature, runsIn } from '../../lib/core/discovery.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState, loadState, parseEvent } from '../../lib/core/state.mjs';
import { readArtefact, writeArtefact, artefactHash } from '../../lib/core/artefacts.mjs';
import { makeFinding, findingId, upsertFindings, emptyFindings, recordFindings, readFindings, openFindings } from '../../lib/core/findings.mjs';
import { createStubRunner } from '../helpers/runner-stub.mjs';
import { makeTempRepo, makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';

const AT = '2026-01-15T20:00:00.000Z';
const initFor = (feature, worktree) => ({ feature, runId: `r-20260115-2000-${feature.slice(0, 4)}`, worktree, branch: `epic/1-${feature}`, epic: 1, at: AT });

test('discoverRuns finds state.json in every worktree, and only real run folders', async () => {
  const repo = makeTempRepo({ files: { 'README.md': 'x' } });
  try {
    const wt = repo.addWorktree('delivery-widgets', 'epic/1-widgets');
    await createState(featurePaths(wt, 'widgets'), initFor('widgets', wt));
    await createState(featurePaths(repo.dir, 'gadgets'), initFor('gadgets', repo.dir));
    mkdirSync(join(repo.dir, '.delivery', 'Not_A_Slug'), { recursive: true });
    writeFileSync(join(repo.dir, '.delivery', 'Not_A_Slug', 'state.json'), '{}');
    mkdirSync(join(repo.dir, '.delivery', 'empty'), { recursive: true });
    const git = createGit(createStubRunner([], { passthrough: ['git'] }), { cwd: repo.dir });
    const runs = await discoverRuns(git);
    assert.deepEqual(runs.map((r) => [r.feature, r.branch]).sort(), [['gadgets', 'main'], ['widgets', 'epic/1-widgets']]);
    assert.deepEqual((await runsIn(wt)).map((r) => r.feature), ['widgets']);
  } finally { repo.cleanup(); }
});

test('resolveFeature: the flag, else the single run here, else null; two runs need --feature', async () => {
  const t = makeTempDir();
  try {
    assert.equal(await resolveFeature({ repoRoot: t.dir }, null), null);
    await createState(featurePaths(t.dir, 'widgets'), initFor('widgets', t.dir));
    assert.equal(await resolveFeature({ repoRoot: t.dir }, null), 'widgets');
    assert.equal(await resolveFeature({ repoRoot: t.dir }, 'other'), 'other');
    await assert.rejects(resolveFeature({ repoRoot: t.dir }, 'Bad Slug'), (e) => e.exit === 2);
    await createState(featurePaths(t.dir, 'gadgets'), initFor('gadgets', t.dir));
    await assert.rejects(resolveFeature({ repoRoot: t.dir }, null), /2 runs \(gadgets, widgets\); pass --feature/);
  } finally { t.cleanup(); }
});

test('ctx: lazy profile, requirePaths, journal appends only when a run exists', async () => {
  const t = makeTempDir();
  try {
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, profile: makeProfile() });
    assert.equal(ctx.feature, null);
    assert.throws(() => ctx.requirePaths(), (e) => e.exit === 2);
    assert.equal(await ctx.journal({ command: 'status' }), false);
    assert.equal((await ctx.profile()).repo.base, 'main');

    await createState(featurePaths(t.dir, 'widgets'), initFor('widgets', t.dir));
    const { ctx: c2 } = await makeTestCtx({ repoRoot: t.dir, profile: makeProfile() });
    assert.equal(c2.feature, 'widgets');
    assert.equal(await c2.journal({ command: 'check M7', exit: 1, counts: { findings: 2 }, inputs: { run: 'c1' } }), true);
    const s = await loadState(c2.requirePaths().state);
    assert.deepEqual(parseEvent(s.journal.at(-1).event), { command: 'check M7', exit: 1, counts: { findings: '2' } });

    const { ctx: c3 } = await makeTestCtx({ repoRoot: t.dir });
    await assert.rejects(c3.profile(), (e) => e.exit === 2 && /delivery init/.test(e.message));
  } finally { t.cleanup(); }
});

test('artefacts are validated on write and on read, and hashed as the ready inputs expect', async () => {
  const t = makeTempDir();
  try {
    const paths = featurePaths(t.dir, 'widgets');
    assert.equal(await readArtefact(paths, 'plan', { optional: true }), null);
    assert.equal(await artefactHash(paths, 'plan'), 'absent');
    await writeArtefact(paths, 'plan', validExample('plan'));
    assert.equal((await readArtefact(paths, 'plan')).feature, 'widgets');
    assert.match(await artefactHash(paths, 'plan'), /^[0-9a-f]{64}$/);
    await assert.rejects(writeArtefact(paths, 'plan', { schemaVersion: 1 }), (e) => e.exit === 2 && e.failures.length > 3);
    mkdirSync(paths.runDir, { recursive: true });
    writeFileSync(paths.ready, JSON.stringify({ schemaVersion: 1, ok: true }));
    await assert.rejects(readArtefact(paths, 'ready'), (e) => e.exit === 5, 'a hand-written ready.json is a tampered artefact');
    await assert.rejects(readArtefact(paths, 'state'), /unknown artefact/);
    await writeArtefact(paths, 'unit-report', validExample('unit-report'), { key: 'U2' });
    assert.equal((await readArtefact(paths, 'unit-report', { key: 'U2' })).unit, 'U2');
  } finally { t.cleanup(); }
});

test('finding ids are stable and ignore wording and severity', () => {
  const a = makeFinding({ source: 'check:M7', rule: 'leak', severity: 'P1', state: 'WL-01', where: 'txt:4', live: 'on .' });
  const b = makeFinding({ source: 'check:M7', rule: 'leak', severity: 'P2', state: 'WL-01', where: 'txt:4', live: 'different words' });
  assert.equal(a.id, b.id);
  assert.equal(a.id, findingId({ source: 'check:M7', rule: 'leak', state: 'WL-01', where: 'txt:4' }));
  assert.deepEqual([a.status, a.dayOne, a.evidence, a.reAudits], ['open', false, 'seen', 0]);
});

test('upsertFindings: keeps decided statuses, fixes what vanished in scope, reopens regressions', () => {
  const f = (state, extra = {}) => makeFinding({ source: 'check:M7', severity: 'P2', state, where: 'w', ...extra });
  const other = makeFinding({ source: 'check:M4', severity: 'P1', state: 'WL-09', where: 'w' });
  let doc = { ...emptyFindings('r-1'), findings: [
    { ...f('WL-01'), status: 'accepted', accept: { reasonClass: 'platform-limit', issue: 5, text: 't' } },
    f('WL-02'), f('WL-03'), { ...f('WL-04'), status: 'fixed', fixedIn: 'old' }, other,
  ] };
  const res = upsertFindings(doc, { source: 'check:M7', fresh: [f('WL-01'), f('WL-04'), f('WL-05')], fixedIn: 'c-2', inScope: (x) => x.state !== 'WL-03' });
  doc = res.doc;
  const by = Object.fromEntries(doc.findings.map((x) => [x.state, x]));
  assert.equal(by['WL-01'].status, 'accepted');
  assert.equal(by['WL-01'].accept.issue, 5);
  assert.deepEqual([by['WL-02'].status, by['WL-02'].fixedIn], ['fixed', 'c-2']);
  assert.equal(by['WL-03'].status, 'open', 'out of scope stays as it was');
  assert.equal(by['WL-04'].status, 'open'); assert.equal(by['WL-04'].fixedIn, undefined);
  assert.equal(by['WL-05'].status, 'open');
  assert.equal(by['WL-09'].status, 'open', 'other sources untouched');
  assert.deepEqual([res.added, res.reopened, res.fixed], [1, 1, 1]);
  assert.equal(openFindings(doc, 'P1').length, 1);
});

test('recordFindings writes valid findings.json under a lock', async () => {
  const t = makeTempDir();
  try {
    const paths = featurePaths(t.dir, 'widgets');
    const mk = (s) => makeFinding({ source: 'check:M10', severity: 'P1', state: s, where: 'console' });
    await Promise.all([
      recordFindings(paths, 'r-1', { source: 'check:M10', fresh: [mk('WL-01')], fixedIn: 'c-1', inScope: (x) => x.state === 'WL-01' }),
      recordFindings(paths, 'r-1', { source: 'check:M10', fresh: [mk('WL-02')], fixedIn: 'c-1', inScope: (x) => x.state === 'WL-02' }),
    ]);
    const doc = await readFindings(paths, 'r-1');
    assert.deepEqual(doc.findings.map((x) => x.state).sort(), ['WL-01', 'WL-02']);
  } finally { t.cleanup(); }
});

test('ctx: two runs and no --feature defer the error to requirePaths; a bad --feature fails at once', async () => {
  const t = makeTempDir();
  try {
    await createState(featurePaths(t.dir, 'widgets'), initFor('widgets', t.dir));
    await createState(featurePaths(t.dir, 'gadgets'), initFor('gadgets', t.dir));
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, profile: makeProfile() });
    assert.equal(ctx.feature, null);
    assert.throws(() => ctx.requirePaths(), /2 runs \(gadgets, widgets\)/);
    const { ctx: picked } = await makeTestCtx({ repoRoot: t.dir, profile: makeProfile(), feature: 'gadgets' });
    assert.equal(picked.requirePaths().feature, 'gadgets');
    await assert.rejects(makeTestCtx({ repoRoot: t.dir, profile: makeProfile(), feature: 'Not A Slug' }), (e) => e.exit === 2);
  } finally { t.cleanup(); }
});
