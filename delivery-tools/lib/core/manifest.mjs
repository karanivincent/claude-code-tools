// MANIFEST.sha256: the hash of every shipped file (spec 3.2, 11.6). When present, the CLI refuses
// to run on a mismatch (exit 5). Format: one "<sha256>  <relative path>" line per file, sorted.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listTree, sha256, sha256File } from './hash.mjs';

export const MANIFEST_FILE = 'MANIFEST.sha256';
/** Directories where an unlisted file is itself a mismatch: code that would run. */
export const CODE_DIRS = Object.freeze(['bin/', 'lib/', 'adapters/', 'hooks/', 'scripts/', 'schemas/', 'templates/']);

/** Shipped files: everything but the manifest, OS litter, VCS and dependency folders. */
export async function listShippedFiles(root) {
  return listTree(root, { ignore: (rel) => rel === MANIFEST_FILE || rel.startsWith('.delivery/') || rel.endsWith('.tmp') });
}

/** @param {string} root @returns {Promise<string>} manifest text */
export async function buildManifest(root) {
  const lines = [];
  for (const rel of await listShippedFiles(root)) lines.push(`${await sha256File(join(root, rel))}  ${rel}`);
  return lines.join('\n') + '\n';
}

/** @param {string} text @returns {Map<string, string>} path -> sha256 */
export function parseManifest(text) {
  const map = new Map();
  for (const line of String(text).split('\n')) {
    const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

/**
 * @param {string} root plugin root
 * @returns {Promise<{ present: boolean, ok: boolean, manifestSha256: string|null, mismatches: { file: string, reason: string }[] }>}
 */
export async function verifyManifest(root) {
  let text;
  try { text = await readFile(join(root, MANIFEST_FILE), 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') return { present: false, ok: true, manifestSha256: null, mismatches: [] };
    throw err;
  }
  const listed = parseManifest(text);
  const mismatches = [];
  for (const [rel, want] of listed) {
    let got;
    try { got = await sha256File(join(root, rel)); } catch { mismatches.push({ file: rel, reason: 'missing' }); continue; }
    if (got !== want) mismatches.push({ file: rel, reason: 'changed' });
  }
  for (const rel of await listShippedFiles(root)) {
    if (!listed.has(rel) && CODE_DIRS.some((d) => rel.startsWith(d))) mismatches.push({ file: rel, reason: 'not in manifest' });
  }
  return { present: true, ok: mismatches.length === 0, manifestSha256: sha256(text), mismatches };
}
