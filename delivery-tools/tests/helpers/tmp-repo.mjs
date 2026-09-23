// A throwaway git repository in the OS temp dir, for tests that need real git (worktrees, show,
// merge-base). Never touches the plugin's own repository and never uses the network.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', HOME: tmpdir(),
};

/**
 * @param {{ files?: Record<string, string|object>, branch?: string, message?: string }} [opts]
 *   files: path -> content (objects are written as JSON); committed as the first commit
 */
export function makeTempRepo(opts = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-test-')));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', opts.branch ?? 'main');
  git('config', 'commit.gpgsign', 'false');
  const repo = {
    dir,
    git,
    /** Write files (no commit). */
    write(files) {
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(dir, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2) + '\n');
      }
      return repo;
    },
    /** Stage everything and commit; returns the new HEAD SHA. */
    commit(message = 'change') {
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', message);
      return git('rev-parse', 'HEAD');
    },
    /** Add a worktree on a new branch; returns its absolute path. */
    addWorktree(name, branch) {
      const path = join(dirname(dir), `${name}-${Math.random().toString(36).slice(2, 8)}`);
      git('worktree', 'add', '-q', '-b', branch, path);
      repo.cleanups.push(() => rmSync(path, { recursive: true, force: true }));
      return realpathSync(path);
    },
    cleanups: [],
    cleanup() {
      for (const c of repo.cleanups) c();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  if (opts.files) repo.write(opts.files);
  repo.commit(opts.message ?? 'initial');
  return repo;
}

/** A temp directory that is not a git repo. */
export function makeTempDir(prefix = 'delivery-test-') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
