// Small filesystem helpers. Writes are atomic (temp file + rename) so a killed command
// never leaves half a JSON file behind.

import { mkdir, readFile, rename, stat, writeFile, open, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DeliveryError, EXIT } from './exit.mjs';

/** @param {string} path */
export async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

/** @param {string} dir */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * Read and parse a JSON file.
 * @param {string} path
 * @param {{ optional?: boolean, exit?: number }} [opts] optional: return null when missing;
 *   exit: the code for unparsable JSON (default 2; state and ready use 5)
 */
export async function readJson(path, opts = {}) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && opts.optional) return null;
    if (err.code === 'ENOENT') throw new DeliveryError(opts.exit ?? EXIT.USAGE, `missing file ${path}`, { code: 'missing' });
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new DeliveryError(opts.exit ?? EXIT.USAGE, `not valid JSON: ${path} (${err.message})`, { code: 'json' });
  }
}

/**
 * Write text atomically.
 * @param {string} path
 * @param {string|Buffer} data
 */
export async function writeFileAtomic(path, data) {
  await ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** Write JSON (2-space indent, trailing newline) atomically. */
export async function writeJsonAtomic(path, value) {
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Run fn while holding an exclusive lock file. A lock older than staleMs is taken over,
 * so a crashed command cannot wedge the run.
 * @template T
 * @param {string} lockPath
 * @param {() => Promise<T>} fn
 * @param {{ waitMs?: number, staleMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withLock(lockPath, fn, opts = {}) {
  const waitMs = opts.waitMs ?? 10_000;
  const staleMs = opts.staleMs ?? 120_000;
  await ensureDir(dirname(lockPath));
  const start = Date.now();
  let handle;
  for (;;) {
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const s = await stat(lockPath);
        if (Date.now() - s.mtimeMs > staleMs) { await unlink(lockPath).catch(() => {}); continue; }
      } catch { continue; }
      if (Date.now() - start > waitMs) {
        throw new DeliveryError(EXIT.WAIT, `another delivery command holds ${lockPath}; retry`, { code: 'locked' });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}
