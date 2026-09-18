// The context every command's run(ctx, argv) receives. Built once by bin/delivery.mjs; tests build
// the same shape with tests/helpers/ctx.mjs, injecting a stub runner, the in-memory gh and a fake clock.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError } from './exit.mjs';
import { createOutput } from './output.mjs';
import { createGit } from './git.mjs';
import { createGh } from './gh.mjs';
import { systemClock } from './clock.mjs';
import { featurePaths } from './paths.mjs';
import { resolveFeature } from './discovery.mjs';
import { PROFILE_PATH, loadProfile, loadSafety } from './profile.mjs';
import { formatEvent, updateState } from './state.mjs';
import { exists } from './fs.mjs';
import { sha256 } from './hash.mjs';

export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @typedef {object} Ctx
 * @property {string} cwd
 * @property {string} repoRoot     the git toplevel of cwd (the worktree the command runs in); cwd outside git
 * @property {string} pluginRoot   the delivery-tools directory
 * @property {{ feature: string|null, json: boolean, help: boolean }} flags  the global flags
 * @property {string|null} feature --feature, or the single run in this worktree, or null
 * @property {import('./paths.mjs').FeaturePaths|null} paths  null when feature is null
 * @property {() => import('./paths.mjs').FeaturePaths} requirePaths  throws a usage error when there is no feature
 * @property {() => Promise<object>} profile  validated profile, cached; exit 2 when missing or invalid
 * @property {() => Promise<{ safety: object, bytes: Buffer, sha256: string, path: string }>} safety  read-only, cached
 * @property {import('./output.mjs').Output} out
 * @property {import('./run.mjs').Runner} runner
 * @property {ReturnType<typeof createGit>} git   bound to repoRoot
 * @property {import('./gh.mjs').Gh} gh            bound to profile.issues.repo (or repo.slug)
 * @property {import('./clock.mjs').Clock} clock
 * @property {NodeJS.ProcessEnv} env
 * @property {{ version: string, manifestSha256: string|null }} cli
 * @property {(e: { command: string, exit?: number, counts?: Record<string, unknown>, inputs?: unknown, outputs?: unknown }) => Promise<boolean>} journal
 *   append one event to state.json when the run has one; false when there is no state yet
 */

/**
 * @param {{
 *   cwd?: string, env?: NodeJS.ProcessEnv, flags: { feature: string|null, json: boolean, help: boolean },
 *   runner: import('./run.mjs').Runner, gh?: import('./gh.mjs').Gh, clock?: import('./clock.mjs').Clock,
 *   out?: import('./output.mjs').Output, stdout?: any, stderr?: any, repoRoot?: string,
 *   cli?: { version: string, manifestSha256: string|null }, profile?: object, safety?: object,
 * }} o  profile and safety let tests inject values instead of files
 * @returns {Promise<Ctx>}
 */
export async function createCtx(o) {
  const cwd = o.cwd ?? process.cwd();
  const env = o.env ?? process.env;
  const out = o.out ?? createOutput({ json: o.flags.json, stdout: o.stdout, stderr: o.stderr });
  let repoRoot = o.repoRoot;
  if (!repoRoot) {
    const r = await o.runner.run('git', ['rev-parse', '--show-toplevel'], { cwd });
    repoRoot = r.code === 0 ? String(r.stdout).trim() : cwd;
  }
  const raw = o.profile ?? readRawProfile(repoRoot);
  const roots = raw?.paths ?? {};
  // An explicit bad --feature is a usage error now; an ambiguous default (two runs in this
  // worktree) only matters to commands that need a feature, so status and hooks still work.
  let feature = null;
  let featureError = null;
  try {
    feature = await resolveFeature({ repoRoot }, o.flags.feature, { runRoot: roots.runRoot });
  } catch (err) {
    if (o.flags.feature) throw err;
    featureError = err;
  }
  const paths = feature ? featurePaths(repoRoot, feature, roots) : null;
  const git = createGit(o.runner, { cwd: repoRoot });
  const gh = o.gh ?? createGh(o.runner, { repo: raw?.issues?.repo ?? raw?.repo?.slug ?? 'unknown/unknown', cwd: repoRoot });

  let profileP = null;
  let safetyP = null;
  const ctx = {
    cwd, repoRoot, pluginRoot: PLUGIN_ROOT, flags: o.flags, feature, paths, out,
    runner: o.runner, git, gh, clock: o.clock ?? systemClock, env,
    cli: o.cli ?? { version: pluginVersion(), manifestSha256: null },
    requirePaths() {
      if (featureError) throw featureError;
      if (!paths) throw new UsageError('no run in this worktree; pass --feature <slug>');
      return paths;
    },
    profile() {
      profileP ??= o.profile ? Promise.resolve(o.profile) : loadProfile(repoRoot);
      return profileP;
    },
    safety() {
      safetyP ??= o.safety
        ? Promise.resolve(injectedSafety(o.safety))
        : ctx.profile().then((p) => loadSafety(repoRoot, p));
      return safetyP;
    },
    async journal({ command, exit = null, counts = {}, inputs = null, outputs = null }) {
      if (!paths || !(await exists(paths.state))) return false;
      await updateState(paths, (s) => s, { at: ctx.clock.now().toISOString(), event: formatEvent({ command, exit, counts }), inputs, outputs });
      return true;
    },
  };
  return ctx;
}

function injectedSafety(safety) {
  const bytes = Buffer.from(JSON.stringify(safety, null, 2) + '\n');
  return { safety, bytes, sha256: sha256(bytes), path: '(injected)' };
}

function readRawProfile(repoRoot) {
  try { return JSON.parse(readFileSync(join(repoRoot, PROFILE_PATH), 'utf8')); } catch { return null; }
}

let cachedVersion = null;
/** The plugin version from .claude-plugin/plugin.json, or "0.0.0-dev" before that file exists. */
export function pluginVersion() {
  if (cachedVersion) return cachedVersion;
  try { cachedVersion = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? '0.0.0-dev'; } catch { cachedVersion = '0.0.0-dev'; }
  return cachedVersion;
}
