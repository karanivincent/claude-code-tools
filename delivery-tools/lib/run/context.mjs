// Finding runs and working on one from anywhere in the repository (spec 11.3 step 1, 11.4).

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createCtx } from '../core/ctx.mjs';
import { createGit } from '../core/git.mjs';
import { discoverRuns } from '../core/discovery.mjs';
import { loadState } from '../core/state.mjs';
import { PROFILE_PATH } from '../core/profile.mjs';
import { DEFAULT_ROOTS } from '../core/paths.mjs';
import { UsageError } from '../core/exit.mjs';

/** The run's state, loaded and verified (exit 5 on a broken journal). */
export async function readRunState(ctx) {
  return loadState(ctx.requirePaths().state);
}

/**
 * The run's paths and state for a command that acts on a run: exit 2 when this worktree holds no
 * such run (commands work from the run's own worktree), exit 5 when its journal is broken.
 */
export async function requireRunState(ctx) {
  const paths = ctx.requirePaths();
  if (!existsSync(paths.state)) {
    throw new UsageError(`no run "${paths.feature}" in this worktree (${paths.repoRoot}); work from the run's worktree, which delivery status names`);
  }
  return { paths, state: await loadState(paths.state) };
}

/** profile.paths.runRoot of the worktree at root, read leniently (no validation). */
export function runRootOf(root) {
  try {
    const raw = JSON.parse(readFileSync(join(root, PROFILE_PATH), 'utf8'));
    const r = raw?.paths?.runRoot;
    return typeof r === 'string' && r ? r : DEFAULT_ROOTS.runRoot;
  } catch {
    return DEFAULT_ROOTS.runRoot;
  }
}

/**
 * A ctx for a run that may live in another worktree: paths, git and the profile are the run's.
 * The runner, GitHub client, clock, output and the test seam (deps) are shared.
 * @param {import('../core/ctx.mjs').Ctx & { deps?: object }} ctx
 * @param {{ worktree: string, feature: string }} run
 */
export async function ctxForRun(ctx, run) {
  if (run.worktree === ctx.repoRoot && ctx.feature === run.feature && ctx.paths) return ctx;
  const next = await createCtx({
    cwd: run.worktree,
    repoRoot: run.worktree,
    env: ctx.env,
    flags: { ...ctx.flags, feature: run.feature },
    runner: ctx.runner,
    gh: ctx.gh && ctx.gh.repo !== 'unknown/unknown' ? ctx.gh : undefined,
    clock: ctx.clock,
    out: ctx.out,
    cli: ctx.cli,
  });
  if (ctx.deps) next.deps = ctx.deps;
  return next;
}

/**
 * Every run in the repository that holds `cwd`, with its state. A run whose phase is "closed" is
 * left out unless includeClosed. A run whose state.json is broken is kept, with `broken` set: it is
 * still a run, and its inconsistency must lead whatever reports on it.
 * @param {object} ctx
 * @param {{ cwd?: string, includeClosed?: boolean }} [opts]
 * @returns {Promise<{ worktree: string, branch: string|null, feature: string, statePath: string,
 *                     state: object|null, broken: Error|null }[]>}
 */
export async function findRuns(ctx, opts = {}) {
  const cwd = opts.cwd ?? ctx.repoRoot;
  const git = cwd === ctx.repoRoot ? ctx.git : createGit(ctx.runner, { cwd });
  const top = await git.raw(['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return [];
  const runRoot = runRootOf(String(top.stdout).trim());
  const out = [];
  for (const loc of await discoverRuns(git, { runRoot })) {
    let state = null;
    let broken = null;
    try { state = await loadState(loc.statePath); } catch (err) { broken = err; }
    if (state && state.phase === 'closed' && !opts.includeClosed) continue;
    out.push({ ...loc, state, broken });
  }
  return out;
}

/**
 * How NEXT names the CLI: the repo shim when the worktree has one (spec 3.2), else the plugin's entry.
 * @param {string} worktree
 * @param {string} pluginRoot
 */
export function cliPrefix(worktree, pluginRoot) {
  if (existsSync(join(worktree, 'scripts', 'delivery.mjs'))) return 'node scripts/delivery.mjs';
  const entry = join(pluginRoot, 'bin', 'delivery.mjs');
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(entry) ? `node ${entry}` : `node "${entry}"`;
}

/** A path from a record, absolute or relative to the run's worktree. */
export function inWorktree(worktree, p) {
  return isAbsolute(p) ? p : resolve(worktree, p);
}

/** No tracked file is modified (untracked drop files, such as decision files, do not count). */
export async function trackedClean(git) {
  const r = await git.raw(['status', '--porcelain', '--untracked-files=no']);
  return r.code === 0 && String(r.stdout).trim() === '';
}
