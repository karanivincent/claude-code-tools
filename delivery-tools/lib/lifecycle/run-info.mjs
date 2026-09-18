// Shared facts about a run that A2's commands all need: its markers, branch names, the plan's
// claimed children and paths, the run's PR, and locked plan updates. Pure where it can be.

import { join, relative, sep } from 'node:path';
import { makeMarker, makeGlobalMarker, hasMarker } from '../core/markers.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { loadState } from '../core/state.mjs';
import { withLock, exists } from '../core/fs.mjs';
import { UsageError, DeliveryError, EXIT } from '../core/exit.mjs';

export const STATE_ID_RE = /^[A-Z]{1,6}-\d{2,3}$/;
export const CAP_ID_RE = /^CAP-\d{3}$/;

/** A design state's row id. CAP-001 also fits the state pattern, so capabilities are ruled out first. */
export function isStateId(id) {
  return !CAP_ID_RE.test(id) && STATE_ID_RE.test(id);
}

/**
 * Every marker the run writes (spec 11.3; docs/ARCHITECTURE.md, Markers), with the profile's prefix.
 * @param {{ issues?: { markerPrefix?: string } }} profile
 * @param {string} feature
 */
export function runMarkers(profile, feature) {
  const prefix = profile?.issues?.markerPrefix || 'delivery';
  const m = (kind, id = null) => makeMarker({ prefix, feature, kind, id });
  return {
    prefix,
    epic: () => m('epic'),
    unit: (id) => m('unit', id),
    backend: (id) => m('backend', id),
    child: (unit) => m(unit.kind === 'backend' ? 'backend' : 'unit', unit.id),
    cut: (rowId) => m('cut', rowId),
    polish: () => m('polish'),
    scope: () => m('scope'),
    spec: () => m('spec'),
    release: () => m('release'),
    pr: () => m('pr'),
    block: (name) => m('block', name),
    claims: () => makeGlobalMarker('claims', prefix),
  };
}

/** The integration branch: <branchPrefix><epic>-<feature> (spec 3.3). */
export function integrationBranch(profile, epic, feature) {
  if (!epic) throw new UsageError('the integration branch needs the epic number');
  return `${profile.repo.branchPrefix ?? ''}${epic}-${feature}`;
}

/** A unit's branch, cut from the integration branch. "--" keeps it a sibling ref, never a child. */
export function unitBranch(integration, unitId) {
  return `${integration}--${unitId}`;
}

/** The primary worktree of the repository (where worktreeRoot lives). */
export async function primaryWorktree(git) {
  const list = await git.worktrees();
  const first = list.find((w) => !w.bare) ?? list[0];
  return first ? first.path : git.cwd;
}

/** <primary>/<worktreeRoot>/delivery-<feature> */
export function integrationWorktreePath(primaryRoot, profile, feature) {
  return join(primaryRoot, profile.repo.worktreeRoot, `delivery-${feature}`);
}

/** Repo-relative posix path. */
export function repoRel(root, abs) {
  return relative(root, abs).split(sep).join('/');
}

/** Read state.json when the run has one (exit 5 on a broken chain), else null. */
export async function readState(paths) {
  if (!paths || !(await exists(paths.state))) return null;
  return loadState(paths.state);
}

/** plan.json, validated; null when optional and absent. */
export function readPlan(paths, { optional = false } = {}) {
  return readArtefact(paths, 'plan', { optional });
}

/** intent.json, validated; null when optional and absent. */
export function readIntent(paths, { optional = false } = {}) {
  return readArtefact(paths, 'intent', { optional });
}

/**
 * Read-modify-write plan.json under a lock. mutate returns the new plan (or undefined to keep
 * the mutated argument). Writes only when the plan changed. Returns { plan, changed }.
 */
export async function updatePlan(paths, mutate) {
  return withLock(`${paths.plan}.lock`, async () => {
    const before = await readArtefact(paths, 'plan');
    const draft = structuredClone(before);
    const after = (await mutate(draft)) ?? draft;
    const changed = JSON.stringify(after) !== JSON.stringify(before);
    if (changed) await writeArtefact(paths, 'plan', after);
    return { plan: after, changed };
  });
}

/**
 * The children the draft PR claims: every build unit and backend unit with an issue (spec 4.4
 * step 1). Cut follow-ups and the polish issue are never claimed.
 * @returns {{ unit: string, kind: string, issue: number|null, wave: number }[]}
 */
export function claimedChildren(plan) {
  return (plan?.units ?? []).map((u) => ({ unit: u.id, kind: u.kind, issue: u.issue ?? null, wave: u.wave }));
}

/** Every path a unit or contract of the plan owns, sorted: the claimed-paths block (spec 12.2). */
export function claimedPaths(plan) {
  const set = new Set();
  for (const u of plan?.units ?? []) for (const f of u.files ?? []) if (f) set.add(f);
  for (const c of plan?.contracts ?? []) { if (c.file) set.add(c.file); if (c.stub) set.add(c.stub); }
  return [...set].sort();
}

/** Glob match with * (one segment) and ** (any depth), for claimed paths and loopTest.when. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** True when path matches any glob (a glob with no wildcard also matches everything under it). */
export function matchesAny(path, globs) {
  return (globs ?? []).some((g) => {
    if (!/[*?]/.test(g)) return path === g || path.startsWith(g.endsWith('/') ? g : `${g}/`);
    return globToRegExp(g).test(path);
  });
}

/**
 * The run's PR: the number state.json recorded (verified by its marker), else the PR carrying
 * the run's pr marker, else an open PR whose head is the integration branch. Null when none.
 * @returns {Promise<import('../core/gh.mjs').Pr|null>}
 */
export async function findRunPr(ctx, { profile, feature, state = null, branch = null }) {
  const marks = runMarkers(profile, feature);
  if (state?.pr) {
    const pr = await ctx.gh.prGet(state.pr);
    if (pr && hasMarker(pr.body, marks.pr())) return pr;
  }
  const found = (await ctx.gh.findByMarker(marks.pr(), { kind: 'pr' })).filter((i) => i.isPr !== false);
  if (found.length) {
    const n = Math.min(...found.map((i) => i.number));
    const pr = await ctx.gh.prGet(n);
    if (pr) return pr;
  }
  const head = branch ?? state?.branch ?? null;
  if (head) {
    const open = await ctx.gh.prList({ state: 'all', limit: 100 });
    const mine = open.filter((p) => p.headRefName === head).sort((a, b) => a.number - b.number);
    if (mine.length) return mine[0];
  }
  return null;
}

/** GitHub rejects bodies over 65536 characters; keep a margin and say where the rest is. */
export function fitBody(text, { max = 60000, rest = '' } = {}) {
  const s = String(text);
  if (s.length <= max) return s;
  const note = `\n\n(Truncated at ${max} characters${rest ? `; the whole text is ${rest}` : ''}.)`;
  return s.slice(0, max - note.length) + note;
}

/** One trimmed line, at most n characters. */
export function clip(text, n = 160) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Last non-empty line of a command's output, for one-line details. */
export function lastLine(...texts) {
  for (const t of texts) {
    const lines = String(t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length) return lines[lines.length - 1];
  }
  return '';
}

/** Uncommitted paths in a worktree, split into the run's own derived files and everything else. */
async function dirtyPaths(git, paths) {
  const rel = repoRel(paths.repoRoot, paths.deliveryDir);
  const mine = (p) => p === rel || p.startsWith(`${rel}/`);
  const all = String((await git.raw(['status', '--porcelain'])).stdout ?? '').split('\n').filter(Boolean).map((l) => l.slice(3));
  return { rel, own: all.filter(mine), other: all.filter((p) => !mine(p)) };
}

/**
 * The CLI's own files (plan.json after issues sync, scope post or a Scope reply; the baseline
 * after a refresh) are committed by the CLI; anything else uncommitted stops the command, since
 * only the main session writes in this worktree and a merge must not sweep up its half-done work.
 * @returns {Promise<boolean>} whether a commit was made
 */
export async function commitRunFiles(git, paths, message, { what = 'this' } = {}) {
  const { rel, own, other } = await dirtyPaths(git, paths);
  if (other.length) throw new DeliveryError(EXIT.RED, `the integration worktree has uncommitted changes outside ${rel}/ (first ${other[0]}); commit them before ${what}`, { code: 'dirty' });
  if (!own.length) return false;
  await git.ok(['add', '--', rel]);
  if ((await git.raw(['diff', '--cached', '--quiet'])).code === 0) return false;
  await git.ok(['commit', '-q', '-m', message]);
  return true;
}

/**
 * Units whose branch is merged into the integration branch (git decides; nothing recorded is
 * trusted). A unit whose branch does not exist is not built.
 * @param {ReturnType<import('../core/git.mjs').createGit>} git bound to the integration worktree
 * @returns {Promise<Set<string>>}
 */
export async function builtUnits(git, { plan, integration, head = 'HEAD' }) {
  const out = new Set();
  for (const u of plan?.units ?? []) {
    const ref = `refs/heads/${unitBranch(integration, u.id)}`;
    const sha = await git.revParse(ref);
    if (!sha) continue;
    const r = await git.raw(['merge-base', '--is-ancestor', sha, head]);
    if (r.code === 0) out.add(u.id);
  }
  return out;
}
