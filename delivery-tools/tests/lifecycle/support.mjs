// Shared set-up for A2's tests: a synthetic plan, a temp repository with a bare "origin", an
// integration worktree with a run in it, and a ctx whose git is real (on the temp repos only)
// while gh is the in-memory stub and every other command must be answered by a rule.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { createGhStub } from '../helpers/gh-stub.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { validExample, makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState } from '../../lib/core/state.mjs';
import { ok } from '../helpers/runner-stub.mjs';
import { postScope } from '../../lib/github/scope.mjs';
import { openClaims } from '../../lib/github/claims.mjs';

export const FEATURE = 'widgets';
export const EPIC = 101;
export const BRANCH = `epic/${EPIC}-${FEATURE}`;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** A synthetic plan: units without issues, one cut row, one Scope line, no snapshot yet. */
export function makePlan(overrides = {}) {
  const p = validExample('plan');
  p.scopeIssue = null;
  p.scopeSnapshot = null;
  for (const u of p.units) u.issue = null;
  for (const r of p.rows) delete r.issue;
  return { ...p, ...overrides };
}

/** A profile whose repo is the temp one; claims verified by a stubbed planner. */
export function testProfile(overrides = {}) {
  const p = makeProfile();
  return { ...p, ...overrides };
}

/** git in a directory, with a fixed identity. */
export function gitIn(dir) {
  return (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * A primary repo on main with a bare origin, and optionally an integration worktree with a run.
 * @param {{ files?: Record<string,string>, run?: boolean, plan?: object|null, intent?: object|null, state?: object }} [o]
 */
export async function makeRunRepo(o = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-a2-')));
  const origin = join(root, 'origin.git');
  const primary = join(root, 'repo');
  mkdirSync(primary);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const g = gitIn(primary);
  g('init', '-q', '-b', 'main');
  g('config', 'commit.gpgsign', 'false');
  g('config', 'core.hooksPath', '/dev/null');
  g('config', 'user.name', 'Test');
  g('config', 'user.email', 'test@example.invalid');
  const files = { '.gitignore': '.delivery/\n.claude/worktrees/\n', 'README.md': 'example\n', ...(o.files ?? {}) };
  write(primary, files);
  g('add', '-A');
  g('commit', '-q', '-m', 'initial');
  g('remote', 'add', 'origin', origin);
  g('push', '-q', 'origin', 'main');
  g('fetch', '-q', 'origin');

  const repo = { root, origin, primary, git: g, worktree: null, wtGit: null, paths: null, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  if (o.run === false) return repo;

  const wt = join(primary, '.claude', 'worktrees', `delivery-${FEATURE}`);
  g('worktree', 'add', '-q', '-b', BRANCH, wt, 'origin/main');
  repo.worktree = realpathSync(wt);
  repo.wtGit = gitIn(repo.worktree);
  repo.paths = featurePaths(repo.worktree, FEATURE, {});
  const plan = o.plan === undefined ? makePlan() : o.plan;
  const toCommit = {};
  if (plan) toCommit[`docs/delivery/${FEATURE}/plan.json`] = `${JSON.stringify(plan, null, 2)}\n`;
  if (o.intent) toCommit[`docs/delivery/${FEATURE}/intent.json`] = `${JSON.stringify(o.intent, null, 2)}\n`;
  if (Object.keys(toCommit).length) {
    write(repo.worktree, toCommit);
    repo.wtGit('add', '-A');
    repo.wtGit('commit', '-q', '-m', 'plan');
    repo.wtGit('push', '-q', 'origin', BRANCH);
  }
  await createState(repo.paths, { feature: FEATURE, runId: 'r-20260115-2000-abcd', worktree: repo.worktree, branch: BRANCH, epic: EPIC, at: '2026-01-15T20:00:00.000Z', ...(o.state ?? {}) });
  return repo;
}

export function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === 'string' || Buffer.isBuffer(content) ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

/** A ctx on a repo root with real git, the gh stub and stubbed everything else. */
export async function ctxFor(root, { profile = testProfile(), rules = [], gh, clock, deps, feature = FEATURE, safety, json = false } = {}) {
  const c = clock ?? fakeClock('2026-01-15T21:00:00.000Z');
  const theGh = gh ?? createGhStub({ clock: c });
  const res = await makeTestCtx({ repoRoot: root, feature, json, profile, safety, rules, passthrough: ['git'], gh: theGh, clock: c });
  if (deps) res.ctx.deps = deps;
  return res;
}

/** Writes of a kind the gh stub recorded since index `from`. */
export function writesSince(gh, from = 0) {
  return gh.db.writes.slice(from);
}

// Wave tests: a run whose branch deleted OLD, with issues filed, the Scope posted and the draft PR open.
export const OLD = 'apps/web/src/widgets/old-tab.tsx';
export const baseRules = () => [
  { match: 'node scripts/planner.mjs', result: ok('queue: #150 #151') },
  { match: 'npm run flight', result: ok('nothing else in flight') },
  { match: /^npm run tried/, result: ok('nothing tried before') },
];

/** A run whose branch deleted OLD, with issues filed, the Scope posted and the draft PR open. */
export async function readyRun({ refresh, extraDeps = {} } = {}) {
  const plan = makePlan();
  plan.units[0].issue = 102;
  plan.units[1].issue = 103;
  const repo = await makeRunRepo({ files: { [OLD]: 'export const tab = 1;\n' }, plan });
  write(repo.worktree, { 'docs/delivery/widgets/baseline.json': validExample('baseline') });
  repo.wtGit('rm', '-q', OLD);
  repo.wtGit('add', '-A');
  repo.wtGit('commit', '-q', '-m', 'Replace the old tab');
  const calls = { dispatched: [], cleared: [] };
  const deps = {
    refreshBaseline: refresh ?? (async () => ({ added: [], unclassed: [] })),
    recordDispatch: async (_ctx, rec) => { calls.dispatched.push(rec); },
    clearDispatch: async (_ctx, unit) => { calls.cleared.push(unit); },
    ...extraDeps,
  };
  const env = await ctxFor(repo.worktree, { rules: baseRules(), deps });
  await postScope(env.ctx);
  repo.wtGit('commit', '-q', '-am', 'Post the Scope issue');
  await openClaims(env.ctx);
  return { repo, ...env, calls, deps };
}

export function moveBase(repo, files, message = 'base moved') {
  write(repo.primary, files);
  repo.git('add', '-A');
  repo.git('commit', '-q', '-m', message);
  repo.git('push', '-q', 'origin', 'main');
}


// Preflight tests: a run repo carrying the profile and the safety file on main, a fake data adapter.
export const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

export function fakeDataAdapter({ read = true, write = true, members = { 'robot-admin@example.invalid': [], 'delivery+observer@example.invalid': [{ orgId: 'org-real-0001' }] } } = {}) {
  return {
    projectRef: 'testprojectref',
    probeAccess: async () => ({ read, write, detail: read && write ? 'service role ok' : 'permission denied' }),
    probeMigrationApply: async () => ({ ok: true, detail: 'management API reachable' }),
    membership: async (email) => members[email] ?? [],
  };
}

export async function preflightSetup({ profile = makeProfile(), safety = makeSafety(), data = fakeDataAdapter(), files = {}, plan } = {}) {
  const repo = await makeRunRepo({ plan, files: { '.claude/delivery-profile.json': json(profile), '.claude/delivery-safety.json': json(safety), ...files } });
  const baseSha = repo.git('rev-parse', 'origin/main');
  const rules = [
    { match: `DEPLOY_SHA=${baseSha} node scripts/wait-for-deploy.mjs`, result: ok('live') },
    { match: "node scripts/heavy.mjs -- 'true'", result: ok('') },
    { match: 'node scripts/planner.mjs', result: ok('queue: #7') },
  ];
  const deps = {
    createDataAdapter: async () => data,
    deriveSideEffects: async () => ({}),
    seedCheckGate: async () => ({ ok: true, failures: [] }),
  };
  const env = await ctxFor(repo.worktree, { profile, rules, deps });
  return { repo, ...env };
}

