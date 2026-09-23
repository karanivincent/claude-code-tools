// Read source files at a git ref without touching the working tree: one `git ls-tree` for the
// file list and one `git cat-file --batch` for the contents, so reading a few hundred files is a
// couple of processes rather than a few hundred. Everything goes through ctx.git (the runner).

import { DeliveryError, EXIT } from '../core/exit.mjs';
import { sha256 } from '../core/hash.mjs';
import { matchesAny } from './glob.mjs';

/**
 * @typedef {{ ref: string, sha: string, list(): Promise<string[]>, read(paths: string[]): Promise<Map<string, string>> }} RefReader
 */

/**
 * @param {ReturnType<import('../core/git.mjs').createGit>} git
 * @param {string} ref
 * @returns {Promise<RefReader>}
 */
export async function refReader(git, ref) {
  const sha = await git.revParse(ref);
  if (!sha) throw new DeliveryError(EXIT.USAGE, `git ref "${ref}" does not resolve to a commit`, { code: 'ref' });
  let listing = null;
  const cache = new Map();
  return {
    ref,
    sha,
    async list() {
      if (!listing) {
        const r = await git.raw(['ls-tree', '-r', '-z', '--name-only', sha]);
        if (r.code !== 0) throw new DeliveryError(EXIT.RED, `git ls-tree ${ref} failed: ${String(r.stderr).trim()}`, { code: 'git' });
        listing = String(r.stdout).split('\0').filter(Boolean);
      }
      return listing;
    },
    async read(paths) {
      const want = [...new Set(paths)].filter((p) => !cache.has(p));
      if (want.length) {
        const input = want.map((p) => `${sha}:${p}\n`).join('');
        const r = await git.raw(['cat-file', '--batch'], { input, encoding: 'buffer' });
        if (r.code !== 0) throw new DeliveryError(EXIT.RED, `git cat-file --batch at ${ref} failed: ${String(r.stderr).trim()}`, { code: 'git' });
        const parsed = parseBatch(Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(String(r.stdout)), want.length);
        want.forEach((p, k) => cache.set(p, parsed[k]));
      }
      const out = new Map();
      for (const p of paths) {
        const text = cache.get(p);
        if (typeof text === 'string') out.set(p, text);
      }
      return out;
    },
  };
}

/** Parse `git cat-file --batch` output: one entry per input line, null for "missing". */
export function parseBatch(buf, count) {
  const out = [];
  let pos = 0;
  for (let k = 0; k < count && pos < buf.length; k++) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) break;
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    const m = /^([0-9a-f]{40,64}) (\w+) (\d+)$/.exec(header);
    if (!m) { out.push(null); continue; } // "<name> missing" or "<name> ambiguous"
    const size = Number(m[3]);
    const body = buf.subarray(pos, pos + size);
    pos += size + 1; // the content is followed by a newline
    out.push(m[2] === 'blob' ? body.toString('utf8') : null);
  }
  while (out.length < count) out.push(null);
  return out;
}

/**
 * Every file at the ref matching any of the globs, with its text and sha256.
 * @param {RefReader} reader
 * @param {string[]} globs
 * @returns {Promise<{ path: string, text: string, sha256: string }[]>}
 */
export async function readGlobs(reader, globs) {
  const paths = (await reader.list()).filter((p) => matchesAny(p, globs)).sort();
  const texts = await reader.read(paths);
  return paths.filter((p) => texts.has(p)).map((p) => ({ path: p, text: texts.get(p), sha256: sha256(texts.get(p)) }));
}
