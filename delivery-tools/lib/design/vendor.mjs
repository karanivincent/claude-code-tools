// Serving a design's CDN scripts from the target repo's own node_modules (spec 4.2 step 3).
// A Claude Design runtime boots on React's UMD builds fetched from a public CDN with an integrity
// hash. When the repo has the same package at the same version, the render answers that request
// from disk: the bytes are the published package's, so the integrity check still passes, and the
// render does not depend on the network. Matched by URL shape (/<pkg>@<version>/<file>), never
// by host name.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * @param {string} url
 * @returns {{ pkg: string, version: string, file: string }|null}
 */
export function parseCdnUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (p.startsWith('npm/')) p = p.slice(4);
  const m = /^((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@([0-9][\w.+-]*)\/(.+)$/i.exec(p);
  if (!m) return null;
  if (m[3].split('/').some((s) => s === '..' || s === '')) return null;
  return { pkg: m[1], version: m[2], file: m[3] };
}

function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }

/**
 * The local file that answers a CDN URL: the same package at exactly the same version, found in a
 * node_modules directory at or above one of the search directories. Null when there is none.
 * @param {string} url
 * @param {string[]} searchDirs
 * @returns {{ path: string, pkg: string, version: string }|null}
 */
export function resolveVendored(url, searchDirs) {
  const c = parseCdnUrl(url);
  if (!c) return null;
  const seen = new Set();
  for (const start of searchDirs) {
    for (let d = resolve(start); ; d = dirname(d)) {
      if (!seen.has(d)) {
        seen.add(d);
        const pkgDir = join(d, 'node_modules', c.pkg);
        const pj = join(pkgDir, 'package.json');
        if (isFile(pj)) {
          let version = null;
          try { version = JSON.parse(readFileSync(pj, 'utf8')).version; } catch { version = null; }
          const file = join(pkgDir, c.file);
          if (version === c.version && isFile(file)) return { path: file, pkg: c.pkg, version };
        }
      }
      if (dirname(d) === d) break;
    }
  }
  return null;
}

/** A memoised resolver for one render. */
export function vendorResolver(searchDirs) {
  const cache = new Map();
  return (url) => {
    if (!cache.has(url)) cache.set(url, resolveVendored(url, searchDirs));
    return cache.get(url);
  };
}
