// Playwright comes from the target repository, resolved at run time. It is never imported at the
// top of any module, so every command but `design render` and `capture` works without it.

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from './exit.mjs';

export const PLAYWRIGHT_PACKAGES = Object.freeze(['@playwright/test', 'playwright', 'playwright-core']);

/**
 * Directories to resolve from: the repo root, then every directory from the e2e dir up to the root
 * (a monorepo keeps Playwright in the app's package, not the root's).
 * @param {string} repoRoot
 * @param {string|null} [e2eDir] repo-relative, from profile.paths.e2eDir
 */
export function playwrightSearchDirs(repoRoot, e2eDir = null) {
  const dirs = [resolve(repoRoot)];
  if (e2eDir) {
    let d = resolve(repoRoot, e2eDir);
    const root = resolve(repoRoot);
    const chain = [];
    while (d.startsWith(root) && d !== root) { chain.push(d); d = dirname(d); }
    dirs.push(...chain);
  }
  return [...new Set(dirs)];
}

/**
 * Load Playwright from the target repo.
 * @param {{ repoRoot: string, e2eDir?: string|null, packages?: string[] }} opts
 * @returns {Promise<{ module: any, chromium: any, from: string, name: string }>}
 */
export async function resolvePlaywright({ repoRoot, e2eDir = null, packages = PLAYWRIGHT_PACKAGES }) {
  const dirs = playwrightSearchDirs(repoRoot, e2eDir);
  for (const dir of dirs) {
    const req = createRequire(join(dir, '__delivery_resolve__.js'));
    for (const name of packages) {
      let path;
      try { path = req.resolve(name); } catch { continue; }
      const mod = await import(pathToFileURL(path).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { module: mod, chromium, from: path, name };
    }
  }
  throw new ConfigError(`Playwright not found from ${dirs.join(', ')}; the target repo must install @playwright/test or playwright`);
}
