// W8: two runs changing the same shared code. The pure helpers, the GitHub reads through a stub,
// and overlapLines on a real temp repository (git only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedText, definedFunctions, overlapLines, overlaps, openRunChanges, sharedGlobs } from '../../lib/lifecycle/overlap.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

const MIG = 'supabase/migrations/*.sql';
const RETIRE = 'create or replace function public.retire_organization(org uuid) returns void as $$ begin end; $$ language plpgsql;\n';

test('definedFunctions: schema-qualified, quoted, "or replace", several in one text, deduplicated', () => {
  assert.deepEqual(definedFunctions(RETIRE), ['public.retire_organization']);
  assert.deepEqual(definedFunctions('CREATE FUNCTION "app"."Do_It"(a int) returns int as $$ select 1 $$;'), ['app.do_it']);
  assert.deepEqual(definedFunctions('create function touch() returns trigger as $$ begin end $$;'), ['public.touch'], 'no schema means public');
  assert.deepEqual(
    definedFunctions(`${RETIRE}create function billing.close_period(p int) returns void as $$ begin end $$;\n${RETIRE}`).sort(),
    ['billing.close_period', 'public.retire_organization'],
  );
  assert.deepEqual(definedFunctions('create table widgets (id int);'), []);
  assert.deepEqual(definedFunctions(undefined), []);
});

test('addedText keeps only the added lines of a patch, without the +++ header', () => {
  const patch = '--- a/x.sql\n+++ b/x.sql\n@@ -1,2 +1,3 @@\n context line\n-old line\n+new line\n+another';
  assert.equal(addedText(patch), 'new line\nanother');
  assert.equal(addedText(undefined), '');
  assert.deepEqual(definedFunctions(addedText(`@@\n-create function public.gone() returns int as $$ $$;\n+${RETIRE}`)), ['public.retire_organization'], 'a removed definition is not this PR\'s');
});

test('overlaps: two runs redefining one function are flagged with the PR and the branch', () => {
  const out = overlaps({
    mine: { files: ['supabase/migrations/2_a.sql'], globs: [], functions: ['public.retire_organization'] },
    others: [{ pr: 12, branch: 'epic/9-other', files: ['supabase/migrations/1_b.sql'], functions: ['public.retire_organization', 'public.other_fn'] }],
    shared: [],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].pr, 12);
  assert.equal(out[0].branch, 'epic/9-other');
  assert.match(out[0].why, /both runs redefine public\.retire_organization/);
  assert.doesNotMatch(out[0].why, /other_fn/, 'only the shared function is named');
});

test('overlaps: a message file changed by both runs is flagged as a shared file', () => {
  const out = overlaps({
    mine: { files: [], globs: [], functions: [] },
    others: [{ pr: 13, branch: 'epic/10-x', files: ['apps/web/messages/en.json', 'README.md'], functions: [] }],
    shared: ['apps/web/messages/en.json', 'apps/web/messages/fr.json'],
  });
  assert.equal(out.length, 1);
  assert.match(out[0].why, /shared file\(s\).*apps\/web\/messages\/en\.json/);
  assert.doesNotMatch(out[0].why, /README/);
});

test('overlaps: a file under this run\'s route globs is flagged; a file this branch already changed too', () => {
  const others = [{ pr: 14, branch: 'epic/11-y', files: ['apps/web/src/app/knowledge/page.tsx', 'apps/web/src/lib/util.ts'], functions: [] }];
  const byGlob = overlaps({ mine: { files: [], globs: ['apps/web/src/app/knowledge/**'], functions: [] }, others, shared: [] });
  assert.equal(byGlob.length, 1);
  assert.match(byGlob[0].why, /under this run's routes: apps\/web\/src\/app\/knowledge\/page\.tsx/);
  const byFile = overlaps({ mine: { files: ['apps/web/src/lib/util.ts'], globs: [], functions: [] }, others, shared: [] });
  assert.match(byFile[0].why, /apps\/web\/src\/lib\/util\.ts/);
});

test('overlaps: unrelated files and functions are not flagged', () => {
  const out = overlaps({
    mine: { files: ['apps/web/src/a.ts'], globs: ['apps/web/src/app/knowledge/**'], functions: ['public.mine'] },
    others: [{ pr: 15, branch: 'epic/12-z', files: ['docs/notes.md', 'apps/web/src/app/billing/page.tsx'], functions: ['public.theirs'] }],
    shared: ['apps/web/messages/en.json'],
  });
  assert.deepEqual(out, []);
});

test('sharedGlobs: the message files plus paths.sharedFiles', () => {
  const p = makeProfile();
  const profile = { ...p, paths: { ...p.paths, sharedFiles: ['apps/web/src/nav.ts'] } };
  assert.deepEqual(sharedGlobs(profile), ['apps/web/messages/en.json', 'apps/web/messages/fr.json', 'apps/web/src/nav.ts']);
  assert.deepEqual(sharedGlobs(makeProfile()), ['apps/web/messages/en.json', 'apps/web/messages/fr.json']);
});

/** A gh stub whose PR files come from a table keyed by PR number. */
function ghWithPrs(prs, filesByPr) {
  const gh = createGhStub({ startAt: 10 });
  for (const p of prs) gh.db.prs.set(p.number, { number: p.number, title: p.title ?? `PR ${p.number}`, body: '', state: 'open', isDraft: false, head: p.head, base: 'main', labels: new Set(), mergeable: 'MERGEABLE', headSha: 'a'.repeat(40), files: [] });
  gh.api = async (method, path) => {
    assert.equal(method, 'GET');
    const m = path.match(/^repos\/example-org\/example-repo\/pulls\/(\d+)\/files/);
    assert.ok(m, `unexpected api path ${path}`);
    return filesByPr[m[1]];
  };
  return gh;
}

test('openRunChanges: only open PRs on the branch prefix, never this run\'s own, with the functions they define', async () => {
  const gh = ghWithPrs(
    [{ number: 21, head: 'epic/5-other' }, { number: 22, head: 'epic/6-mine' }, { number: 23, head: 'feature/unrelated' }],
    { 21: [{ filename: 'supabase/migrations/9_x.sql', patch: `@@ -0,0 +1 @@\n+${RETIRE}` }, { filename: 'apps/web/messages/en.json', patch: '+"a": "b"' }], 22: [], 23: [] },
  );
  const { ctx } = await makeTestCtx({ repoRoot: process.cwd(), gh, profile: makeProfile() });
  const out = await openRunChanges(ctx, { branchPrefix: 'epic/', myBranch: 'epic/6-mine', migrationsGlob: MIG });
  assert.equal(out.length, 1);
  assert.equal(out[0].pr, 21);
  assert.equal(out[0].branch, 'epic/5-other');
  assert.deepEqual(out[0].files, ['supabase/migrations/9_x.sql', 'apps/web/messages/en.json']);
  assert.deepEqual(out[0].functions, ['public.retire_organization']);
  const noGlob = await openRunChanges(ctx, { branchPrefix: 'epic/', myBranch: 'epic/6-mine' });
  assert.deepEqual(noGlob[0].functions, [], 'without a migrations glob no function is read');
});

test('openRunChanges: a PR whose files cannot be read is skipped, not fatal', async () => {
  const gh = ghWithPrs([{ number: 31, head: 'epic/7-a' }, { number: 32, head: 'epic/8-b' }], { 32: [{ filename: 'a.ts', patch: '' }] });
  const inner = gh.api;
  gh.api = async (m, p) => { if (p.includes('/pulls/31/')) throw new Error('boom'); return inner(m, p); };
  const { ctx } = await makeTestCtx({ repoRoot: process.cwd(), gh, profile: makeProfile() });
  const out = await openRunChanges(ctx, { branchPrefix: 'epic/', myBranch: null });
  assert.deepEqual(out.map((o) => o.pr), [32]);
});

test('overlapLines: one "could not check" line when GitHub throws; it never throws', async () => {
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  try {
    const gh = ghWithPrs([{ number: 41, head: 'epic/1-a' }], {});
    gh.prList = async () => { throw new Error('gh: HTTP 502 bad gateway\nsecond line'); };
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, gh, profile: makeProfile(), passthrough: ['git'] });
    const lines = await overlapLines(ctx, { profile: makeProfile(), map: null, myBranch: 'epic/2-b' });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^could not check other open runs for overlap \(gh: HTTP 502 bad gateway\)$/);
  } finally { repo.cleanup(); }
});

test('overlapLines: names the other run when both redefine a function and both change a message file', async () => {
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  try {
    repo.git('checkout', '-q', '-b', 'epic/2-mine');
    repo.write({ 'supabase/migrations/2_mine.sql': RETIRE, 'apps/web/messages/en.json': '{}\n' });
    repo.commit('mine');
    const gh = ghWithPrs(
      [{ number: 51, head: 'epic/1-other' }],
      { 51: [{ filename: 'supabase/migrations/1_other.sql', patch: `+${RETIRE}` }, { filename: 'apps/web/messages/en.json', patch: '+x' }] },
    );
    const profile = makeProfile();
    profile.paths = { ...profile.paths, migrationsGlob: MIG };
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, gh, profile, passthrough: ['git'] });
    const lines = await overlapLines(ctx, { profile, map: null, myBranch: 'epic/2-mine' });
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.startsWith('overlap with PR #51 (epic/1-other): ') && l.endsWith('; coordinate with that run')));
    assert.ok(lines.some((l) => /both runs redefine public\.retire_organization/.test(l)));
    assert.ok(lines.some((l) => /shared file\(s\).*apps\/web\/messages\/en\.json/.test(l)));

    const quiet = await overlapLines(ctx, { profile, map: null, myBranch: 'epic/1-other' });
    assert.ok(quiet.every((l) => !/PR #51/.test(l)), 'the PR on this very branch is not another run');
  } finally { repo.cleanup(); }
});

test('prepushProblems: only a function both runs redefine is an "overlap" problem; a shared file overlap stays a warning', async () => {
  const { prepushProblems } = await import('../../lib/lifecycle/prepush.mjs');
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  try {
    repo.git('checkout', '-q', '-b', 'epic/2-mine');
    repo.write({ 'supabase/migrations/2_mine.sql': RETIRE, 'apps/web/messages/en.json': '{}\n' });
    repo.commit('mine');
    const profile = makeProfile();
    profile.paths = { ...profile.paths, migrationsGlob: MIG };
    const run = async (otherFiles) => {
      const gh = ghWithPrs([{ number: 61, head: 'epic/1-other' }], { 61: otherFiles });
      const { ctx } = await makeTestCtx({ repoRoot: repo.dir, gh, profile, passthrough: ['git'] });
      return (await prepushProblems(ctx)).filter((p) => p.code === 'overlap');
    };
    const both = await run([{ filename: 'supabase/migrations/1_other.sql', patch: `+${RETIRE}` }, { filename: 'apps/web/messages/en.json', patch: '+x' }]);
    assert.equal(both.length, 1);
    assert.match(both[0].message, /overlap with PR #61 .*both runs redefine public\.retire_organization/);
    assert.deepEqual(await run([{ filename: 'apps/web/messages/en.json', patch: '+x' }]), []);
  } finally { repo.cleanup(); }
});
