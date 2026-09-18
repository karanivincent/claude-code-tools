// The Node side of the hooks, in-process: which Bash commands count (a small shell lexer), which
// PR a gh pr ready names, and that an unexpected error fails closed where a gate is at stake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBash, lex, simpleCommands, unwrap, parseTarget } from '../../lib/run/hook-match.mjs';
import { decidePreBash, decidePreBrowser, readPayload } from '../../lib/run/hooks.mjs';
import preBash from '../../lib/commands/hook-pre-bash.mjs';
import sessionStart from '../../lib/commands/hook-session-start.mjs';
import { makeMarker } from '../../lib/core/markers.mjs';
import { sink } from '../helpers/ctx.mjs';
import { createStubRunner } from '../helpers/runner-stub.mjs';
import { BRANCH, ctxFor, makeRunRepo, startRun } from '../run/support.mjs';
import { bashPayload, browserPayload, startPayload } from './support.mjs';

const ready = (cmd) => classifyBash(cmd).ready;

test('gh pr ready targets: number, #n in quotes, URL, branch, the current branch; --undo and --help are not marks', () => {
  assert.deepEqual(ready('gh pr ready 12'), [parseTarget('12')]);
  assert.deepEqual(ready('gh pr ready "#12" -R example-org/example-repo'), [{ pr: 12, url: null, branch: null, repo: 'example-org/example-repo', current: false }]);
  assert.deepEqual(ready('gh pr ready https://github.com/example-org/example-repo/pull/12'), [{ pr: 12, url: 'https://github.com/example-org/example-repo/pull/12', branch: null, repo: 'example-org/example-repo', current: false }]);
  assert.deepEqual(ready('gh pr ready epic/12-widgets'), [{ pr: null, url: null, branch: 'epic/12-widgets', repo: null, current: false }]);
  assert.deepEqual(ready('gh pr ready'), [{ pr: null, url: null, branch: null, repo: null, current: true }]);
  assert.deepEqual(ready('gh pr ready #12'), [{ pr: null, url: null, branch: null, repo: null, current: true }], '#12 unquoted is a shell comment');
  assert.deepEqual(ready('gh pr ready --undo 12'), []);
  assert.deepEqual(ready('gh pr ready --help'), []);
});

test('only commands that would run count: quotes, heredocs and comments do not; $(), backticks, sh -c and eval do', () => {
  assert.deepEqual(ready('git commit -m "then gh pr ready 12"'), []);
  assert.deepEqual(ready('cat <<EOF > notes.md\ngh pr ready 3\nnode scripts/seed.mjs\nEOF\necho done'), []);
  assert.equal(classifyBash('cat <<-EOF\n\tnode scripts/seed.mjs\n\tEOF').seed, null);
  assert.deepEqual(ready('echo ok # gh pr ready 4'), []);
  assert.equal(ready('echo $(gh pr ready 13)')[0].pr, 13);
  assert.equal(ready('echo `gh pr ready 14`')[0].pr, 14);
  assert.equal(ready('x="$(gh pr ready 15)"')[0].pr, 15);
  assert.equal(ready("bash -c 'gh pr ready 16'")[0].pr, 16);
  assert.equal(ready('eval gh pr ready 17')[0].pr, 17);
  assert.equal(ready('GH_TOKEN=x env -u FOO timeout 30 gh pr ready 18 && echo done')[0].pr, 18);
  assert.equal(ready('/opt/homebrew/bin/gh pr ready 19')[0].pr, 19);
  assert.equal(ready('git push origin HEAD\ngh pr ready 20 2>&1 | tee log.txt')[0].pr, 20);
});

test('gh api calls that mark a PR ready for review are caught in either form', () => {
  assert.equal(classifyBash(`gh api graphql -f query='mutation { markPullRequestReadyForReview(input:{pullRequestId:"PR_x"}) { clientMutationId } }'`).readyApi, true);
  assert.equal(classifyBash('gh api -X POST repos/o/r/pulls/12/ready_for_review').readyApi, true);
  assert.equal(classifyBash('gh api repos/o/r/pulls/12').readyApi, false);
  assert.equal(classifyBash('echo ready_for_review').readyApi, false);
});

test('raw seed commands: scripts, package scripts, seed subcommands, SQL files; not delivery seed, reads, tests', () => {
  const seeds = [
    'node scripts/fixtures/seed-widgets-design.mjs', 'FOO=1 node --env-file .env scripts/seed.mjs --force', 'tsx scripts/seed.ts', 'bun run scripts/seed.ts',
    'npx tsx scripts/seed.ts', 'pnpm seed', 'npm run db:seed', 'yarn seed:demo', 'pnpm --filter web run seed:demo', 'pnpm --filter web exec tsx scripts/seed.ts',
    'supabase db seed', 'npx prisma db seed', 'knex seed:run', './scripts/seed.sh', 'psql "$DATABASE_URL" -f supabase/seed.sql',
    "sh -c 'node scripts/seed.mjs'", 'node -e "require(\'./scripts/seed\')"', 'cd apps/web && pnpm seed',
  ];
  for (const s of seeds) assert.ok(classifyBash(s).seed, `not caught: ${s}`);
  const fine = [
    'node scripts/delivery.mjs seed --apply', 'node "$CLAUDE_PLUGIN_ROOT/bin/delivery.mjs" seed --check', 'cat scripts/fixtures/seed-widgets-design.mjs',
    'git log --grep seed', 'grep -rn seed scripts/', 'rg seed', 'node --test scripts/fixtures/seed-widgets-design.test.mjs',
    'vitest run seed.test.ts', 'pnpm test -- seed', 'git commit -m "Retire the seed script"', 'trash scripts/fixtures/seed-old.mjs',
    'gh issue list --search seed', 'ls seeds/',
  ];
  for (const s of fine) assert.equal(classifyBash(s).seed, null, `wrongly caught: ${s}`);
});

test('an unlexable command falls back to patterns and errs towards a check', () => {
  const r = classifyBash('echo "unbalanced; gh pr ready 3');
  assert.equal(r.unparsed, true);
  assert.deepEqual(r.ready, [parseTarget(null)]);
  assert.match(classifyBash('echo "x; node scripts/seed.mjs').seed, /unparsed command/);
});

test('the lexer: operators, redirections and quotes', () => {
  const { tokens } = lex(`a 'b c' "d\\"e" f>out 2>&1 <in | g && h; i`);
  assert.deepEqual(simpleCommands(tokens), [['a', 'b c', 'd"e', 'f'], ['g'], ['h'], ['i']]);
  assert.deepEqual(unwrap(['A=1', 'env', '-i', 'B=2', 'nohup', 'node', 'x.mjs']), ['node', 'x.mjs']);
});

async function runRepo(state = {}) {
  const { repo, dir } = makeRunRepo({ worktree: true });
  await startRun(dir, { phase: 'pr', pr: 1, ...state });
  return { repo, dir };
}

test('which run a gh pr ready belongs to: its PR number, a PR carrying its marker, its branch, its worktree', async () => {
  const { repo, dir } = await runRepo({ pr: null });
  try {
    const checked = [];
    const { ctx, gh } = await ctxFor(dir, { deps: { checkReady: async (_c, { pr }) => { checked.push(pr); return { ok: false, failures: [{ code: 'ready-missing', message: 'no ready.json' }], exit: 1, headSha: null }; } } });
    await gh.prCreate({ title: 'other', body: 'no marker', base: 'main', head: 'feature/x' });
    const mine = await gh.prCreate({ title: 'Widgets', body: makeMarker({ feature: 'widgets', kind: 'pr' }), base: 'main', head: BRANCH });
    assert.equal((await decidePreBash(ctx, bashPayload(dir, 'gh pr ready 1'))).allow, true, 'a PR without the run marker is not the run PR');
    assert.equal((await decidePreBash(ctx, bashPayload(dir, `gh pr ready ${mine.number}`))).allow, false);
    assert.equal((await decidePreBash(ctx, bashPayload(dir, `gh pr ready ${BRANCH}`))).allow, false);
    assert.equal((await decidePreBash(ctx, bashPayload(dir, 'gh pr ready'))).allow, false, 'the current branch, from inside the run worktree');
    assert.equal((await decidePreBash(ctx, bashPayload(dir, `gh pr ready ${mine.number} --repo someone-else/fork`))).allow, true);
    assert.equal((await decidePreBash(ctx, bashPayload(repo.dir, 'gh pr ready'))).allow, true, 'the main checkout is on another branch');
    assert.deepEqual(checked, [mine.number, mine.number, mine.number]);
    const d = await decidePreBash(ctx, bashPayload(dir, 'gh api -X POST repos/o/r/pulls/2/ready_for_review'));
    assert.equal(d.allow, false);
    assert.match(d.reason, /^delivery: refused "gh api -X POST repos\/o\/r\/pulls\/2\/ready_for_review"\.\nPR #2 belongs to the delivery run widgets/);
  } finally { repo.cleanup(); }
});

test('errors fail closed for ready checks and seeds, and open for anything else', async () => {
  const { repo, dir } = await runRepo();
  try {
    const { ctx } = await ctxFor(dir, { deps: { checkReady: async () => { throw new Error('gh auth expired'); } } });
    const d = await decidePreBash(ctx, bashPayload(dir, 'gh pr ready 1'));
    assert.equal(d.allow, false);
    assert.match(d.reason, /the ready check could not run \(gh auth expired\), so nothing is marked ready/);
    const broken = await ctxFor(dir, { runner: createStubRunner([{ match: /^git worktree/, result: () => { throw new Error('git crashed'); } }], { passthrough: ['git'] }) });
    const e = await decidePreBash(broken.ctx, bashPayload(dir, 'node scripts/seed.mjs'));
    assert.equal(e.allow, false);
    assert.match(e.reason, /could not tell whether a delivery run is active \(git crashed\)/);
    assert.deepEqual(await decidePreBash(broken.ctx, bashPayload(dir, 'ls -la')), { allow: true });
    assert.deepEqual(await decidePreBrowser(ctx, browserPayload(dir)), { allow: true });
  } finally { repo.cleanup(); }
});

test('hook commands read the payload, write refusals to stderr, and session-start never fails', async () => {
  const { repo, dir } = await runRepo();
  try {
    const { ctx } = await ctxFor(dir);
    ctx.hookInput = JSON.stringify(bashPayload(dir, 'npm run db:seed'));
    ctx.hookStderr = sink();
    assert.deepEqual(await readPayload(ctx), bashPayload(dir, 'npm run db:seed'));
    assert.equal(await preBash.run(ctx, []), 2);
    assert.match(ctx.hookStderr.text(), /refused a raw seed command/);
    ctx.hookInput = 'not json';
    assert.equal(await preBash.run(ctx, []), 0);
    const s = await ctxFor(dir, { runner: createStubRunner([], {}) });
    s.ctx.hookInput = JSON.stringify(startPayload(dir));
    s.ctx.hookStderr = sink();
    assert.equal(await sessionStart.run(s.ctx, []), 0, 'a runner that refuses everything still exits 0');
  } finally { repo.cleanup(); }
});
