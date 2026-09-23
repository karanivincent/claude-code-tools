// A thin git wrapper over the runner. Read helpers return null for "not there"; ok() throws
// with git's own message for anything else. Write helpers (fetch, merge, push) exist for the
// wave commands; nothing here decides policy.

import { DeliveryError, EXIT } from './exit.mjs';

/**
 * @typedef {{ path: string, head: string|null, branch: string|null, bare: boolean, detached: boolean,
 *             locked: boolean, prunable: boolean }} Worktree
 */

/**
 * @param {import('./run.mjs').Runner} runner
 * @param {{ cwd: string }} opts
 */
export function createGit(runner, { cwd }) {
  const raw = (args, o = {}) => runner.run('git', args, { cwd, ...o });
  async function ok(args, o = {}) {
    const r = await raw(args, o);
    if (r.code !== 0) {
      throw new DeliveryError(EXIT.RED, `git ${args.join(' ')} failed: ${String(r.stderr).trim().split('\n')[0] || `exit ${r.code}`}`, { code: 'git' });
    }
    return typeof r.stdout === 'string' ? r.stdout.replace(/\n$/, '') : r.stdout;
  }
  return {
    cwd,
    raw,
    ok,
    /** @returns {Promise<string|null>} full SHA, or null when the ref does not exist */
    async revParse(ref) {
      const r = await raw(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return r.code === 0 ? r.stdout.trim() : null;
    },
    async toplevel() { return ok(['rev-parse', '--show-toplevel']); },
    /** @returns {Promise<string|null>} null when detached */
    async currentBranch() {
      const r = await raw(['symbolic-ref', '--quiet', '--short', 'HEAD']);
      return r.code === 0 ? r.stdout.trim() : null;
    },
    /** File bytes at a ref, or null when the path is absent there. */
    async show(ref, path) {
      const r = await raw(['show', `${ref}:${path}`], { encoding: 'buffer' });
      return r.code === 0 ? r.stdout : null;
    },
    async mergeBase(a, b) {
      const r = await raw(['merge-base', a, b]);
      return r.code === 0 ? r.stdout.trim() : null;
    },
    /** Paths changed between two refs (a...b is not used: pass exactly what you mean). */
    async diffNames(a, b) {
      const out = await ok(['diff', '--name-only', a, b]);
      return out ? out.split('\n') : [];
    },
    async lsTree(ref, path = '') {
      const out = await ok(['ls-tree', '-r', '--name-only', ref, ...(path ? ['--', path] : [])]);
      return out ? out.split('\n') : [];
    },
    async isClean() {
      const out = await ok(['status', '--porcelain']);
      return out.trim() === '';
    },
    /** @returns {Promise<Worktree[]>} */
    async worktrees() {
      return parseWorktreePorcelain(await ok(['worktree', 'list', '--porcelain']));
    },
    async fetch(remote, ref) { return ok(['fetch', remote, ref]); },
    async merge(ref, { noFf = false, message } = {}) {
      return raw(['merge', ...(noFf ? ['--no-ff'] : []), ...(message ? ['-m', message] : []), ref]);
    },
    async push(remote, branch) { return ok(['push', remote, branch]); },
  };
}

/**
 * Parse `git worktree list --porcelain`.
 * @param {string} text
 * @returns {Worktree[]}
 */
export function parseWorktreePorcelain(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9), head: null, branch: null, bare: false, detached: false, locked: false, prunable: false };
    } else if (!cur) continue;
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'bare') cur.bare = true;
    else if (line === 'detached') cur.detached = true;
    else if (line.startsWith('locked')) cur.locked = true;
    else if (line.startsWith('prunable')) cur.prunable = true;
  }
  if (cur) out.push(cur);
  return out;
}
