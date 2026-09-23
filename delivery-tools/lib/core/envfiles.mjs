// The profile's environments.envFiles: env files the CLI reads at startup.
//
// A run works in git worktrees, and a repository's .env is untracked, so it exists only in the main
// checkout. Every command that seeds, captures or signs in needs the service role key from it, and
// until this existed each session had to source it by hand before every command. The paths are
// relative to the MAIN checkout for that reason. A variable already set in the environment always
// wins, and no value is ever printed or returned: only the names that were filled in.

import { readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';

/**
 * KEY=VALUE lines, with an optional `export`, quotes and `#` comments. Anything else is skipped.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const q = value[0];
    if ((q === '"' || q === "'") && value.lastIndexOf(q) > 0) {
      value = value.slice(1, value.lastIndexOf(q));
      if (q === '"') value = value.replace(/\\n/g, '\n');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Fill env from the files, never overwriting a variable that is already set.
 * @param {{ files: string[], mainRoot: string, env: Record<string, string|undefined> }} o
 * @returns {Promise<{ loaded: string[], missing: string[] }>} variable names filled in, files not found
 */
export async function loadEnvFiles({ files, mainRoot, env }) {
  const loaded = [];
  const missing = [];
  for (const f of files ?? []) {
    const path = isAbsolute(f) ? f : join(mainRoot, f);
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text === null) { missing.push(f); continue; }
    for (const [k, v] of Object.entries(parseEnvFile(text))) {
      if (env[k] !== undefined) continue;
      env[k] = v;
      loaded.push(k);
    }
  }
  return { loaded, missing };
}

/**
 * The main checkout of the repository at repoRoot: the parent of git's common directory, which is
 * the same for every worktree.
 * @param {{ run: Function }} runner
 * @param {string} repoRoot
 */
export async function mainCheckout(runner, repoRoot) {
  const r = await runner.run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot }).catch(() => null);
  if (!r || r.code !== 0) return repoRoot;
  const common = String(r.stdout).trim();
  return common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : repoRoot;
}
