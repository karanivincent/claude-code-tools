// Shared set-up for slice A1's tests: a temp repository holding a run, green or red gate stubs,
// and a ctx that runs real git on the temp repository only. Synthetic values only.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { createState, updateState } from '../../lib/core/state.mjs';
import { PASS } from '../../lib/core/gate.mjs';

export const FEATURE = 'widgets';
export const AT = '2026-01-15T20:00:00.000Z';
export const RUN_ID = 'r-20260115-2000-ab12';
export const BRANCH = 'epic/101-widgets';
export const GATE_IDS = Object.freeze(['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5', 'phase-6', 'merge', 'staging', 'epic-closed']);

/**
 * A temp repository with the profile and safety file committed. With worktree, the run lives in
 * a linked worktree on the integration branch, as spec 3.3 has it.
 */
export function makeRunRepo({ worktree = false, files = {}, profile = makeProfile() } = {}) {
  const repo = makeTempRepo({
    files: {
      'README.md': 'example\n',
      '.gitignore': '.delivery/\n',
      '.claude/delivery-profile.json': profile,
      '.claude/delivery-safety.json': makeSafety(),
      ...files,
    },
  });
  const dir = worktree ? repo.addWorktree('delivery-widgets', BRANCH) : repo.dir;
  return { repo, dir };
}

/** git in a directory, for set-up only. */
export function gitIn(dir, ...args) {
  return execFileSync('git', args, {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
  }).trim();
}

/** Write files relative to dir (objects as JSON). */
export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  }
}

/** Commit everything in dir; returns the new HEAD. */
export function commitAll(dir, message = 'change') {
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return gitIn(dir, 'rev-parse', 'HEAD');
}

/** Create state.json for the run in dir and move it to the given phase. */
export async function startRun(dir, s = {}) {
  const paths = featurePaths(dir, FEATURE);
  await createState(paths, { feature: FEATURE, runId: RUN_ID, worktree: dir, branch: s.branch ?? BRANCH, epic: s.epic === undefined ? 101 : s.epic, at: AT });
  const { phase = 'intake', wave = 0, pr = null, inFlight = [], waivers = [] } = s;
  await updateState(paths, (st) => ({ ...st, phase, wave, pr, inFlight, waivers }), { at: AT, event: 'test set-up' });
  return paths;
}

/** Gate evaluator stubs, all green, keyed as lib/run/gates.mjs reads them (ctx.deps["gate:<id>"]). */
export function greenGates(overrides = {}) {
  const deps = {};
  for (const id of GATE_IDS) deps[`gate:${id}`] = async () => [{ id, result: PASS }];
  return { ...deps, ...overrides };
}

/** An evaluator whose one part is red. */
export function redGate(message, { exit = 1, part = 'part', code = part } = {}) {
  return async () => [{ id: part, result: { ok: false, failures: [{ code, message }], exit } }];
}

/** A ctx on dir with real git, the in-memory gh, a fake clock, and optional deps. */
export async function ctxFor(dir, opts = {}) {
  const { deps, ...rest } = opts;
  const t = await makeTestCtx({ repoRoot: dir, passthrough: ['git'], ...rest });
  if (deps) t.ctx.deps = deps;
  return t;
}

/** A plan with a contract unit in wave 0 and screen units in wave 1 (and more when asked). */
export function planWith(units) {
  const plan = validExample('plan');
  if (units) plan.units = units;
  return plan;
}

/** A unit for plan.units. */
export function unit(id, wave, extra = {}) {
  return { id, title: `Unit ${id}`, issue: null, kind: wave === 0 ? 'contract' : 'screen', wave, files: [`apps/web/src/widgets/${id}.tsx`], states: [], capabilities: [], risk: 'normal', model: 'sonnet', ...extra };
}

/** A unit report (schemas/unit-report.schema.json) for a unit. */
export function unitReport(id, branch) {
  return {
    schemaVersion: 1, unit: id, branch, commits: [], statesDone: [], statesNotDone: [], testsAdded: [],
    unitCheck: { command: 'npm test', exit: 0 }, decisions: [], looseEnds: [],
  };
}

/** A unit file (schemas/unit-file.schema.json) for a plan unit. */
export function unitFile(u, branch, reportPath) {
  return {
    schemaVersion: 1, unit: u, rows: [], contracts: [], commands: { bootstrap: 'npm ci', unitCheck: 'npm test' },
    baseRef: `origin/${BRANCH}`, branch, reportPath, flight: '', tried: '',
  };
}

/** Only the lines of an output that start with NEXT:. */
export function nextLines(text) {
  return String(text).split('\n').filter((l) => l.startsWith('NEXT:'));
}
