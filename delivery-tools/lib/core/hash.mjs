// Hashing: bytes, files, directory trees and canonical JSON.

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** @param {string|Buffer|Uint8Array} data @returns {string} lowercase hex sha256 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** @param {string} path @returns {Promise<string>} */
export async function sha256File(path) {
  return sha256(await readFile(path));
}

/**
 * JSON with object keys sorted at every level and no whitespace, so equal values hash equally.
 * `undefined` members are dropped, as JSON.stringify does.
 * @param {unknown} value
 */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : sortKeys(x)));
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/** @param {unknown} value @returns {string} sha256 of canonicalJson(value) */
export function hashJson(value) {
  return sha256(canonicalJson(value));
}

const TREE_IGNORE = new Set(['.DS_Store', '.git', 'node_modules']);

/**
 * List every file under dir as sorted posix relative paths.
 * @param {string} dir
 * @param {{ ignore?: (rel: string) => boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listTree(dir, opts = {}) {
  const out = [];
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      if (TREE_IGNORE.has(e.name)) continue;
      const abs = join(d, e.name);
      const rel = relative(dir, abs).split(sep).join('/');
      if (opts.ignore?.(rel)) continue;
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(rel);
    }
  }
  await walk(dir);
  return out.sort();
}

/**
 * A directory's content hash: sha256 over "<relpath>\0<file sha256>\n" for every file, sorted by path.
 * Independent of timestamps and of the order the filesystem lists entries in.
 * @param {string} dir
 * @param {{ ignore?: (rel: string) => boolean }} [opts]
 */
export async function sha256Tree(dir, opts = {}) {
  const files = await listTree(dir, opts);
  const h = createHash('sha256');
  for (const rel of files) h.update(`${rel}\0${await sha256File(join(dir, rel))}\n`);
  return h.digest('hex');
}
