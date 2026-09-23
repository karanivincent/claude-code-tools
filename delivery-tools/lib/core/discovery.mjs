// Run discovery (spec 11.3 step 1): scan every worktree of the repository for
// <runRoot>/<feature>/state.json. Cheap on purpose: one `git worktree list` and a directory read
// per worktree, so the SessionStart hook can afford it.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { UsageError } from './exit.mjs';
import { FEATURE_RE, assertFeatureSlug } from './paths.mjs';
import { exists } from './fs.mjs';
import { parseWorktreePorcelain } from './git.mjs';

/**
 * @typedef {{ worktree: string, branch: string|null, feature: string, statePath: string }} RunLocation
 */

/**
 * Runs in one directory (a worktree root).
 * @param {string} root
 * @param {string} [runRoot]
 * @returns {Promise<RunLocation[]>}
 */
export async function runsIn(root, runRoot = '.delivery', branch = null) {
  const dir = join(root, runRoot);
  let names;
  try { names = await readdir(dir); } catch { return []; }
  const out = [];
  for (const name of names.sort()) {
    if (!FEATURE_RE.test(name)) continue;
    const statePath = join(dir, name, 'state.json');
    if (await exists(statePath)) out.push({ worktree: root, branch, feature: name, statePath });
  }
  return out;
}

/**
 * Every run in every worktree of the repository cwd belongs to.
 * @param {ReturnType<import('./git.mjs').createGit>} git
 * @param {{ runRoot?: string }} [opts]
 * @returns {Promise<RunLocation[]>}
 */
export async function discoverRuns(git, opts = {}) {
  const r = await git.raw(['worktree', 'list', '--porcelain']);
  if (r.code !== 0) return [];
  const out = [];
  for (const wt of parseWorktreePorcelain(r.stdout)) {
    if (wt.bare || wt.prunable) continue;
    out.push(...(await runsIn(wt.path, opts.runRoot, wt.branch)));
  }
  return out;
}

/**
 * The feature a command works on: --feature when given, else the single run in this worktree.
 * Returns null when there is no run here and none was named (commands that need one then throw).
 * @param {{ repoRoot: string }} ctx
 * @param {string|null} flag
 * @param {{ runRoot?: string }} [opts]
 */
export async function resolveFeature(ctx, flag, opts = {}) {
  if (flag) return assertFeatureSlug(flag);
  const here = await runsIn(ctx.repoRoot, opts.runRoot);
  if (here.length === 1) return here[0].feature;
  if (here.length > 1) {
    throw new UsageError(`this worktree has ${here.length} runs (${here.map((r) => r.feature).join(', ')}); pass --feature`);
  }
  return null;
}
