// The directory design render serves (spec 4.2 step 3): a copy of the snapshot with its runtime
// unzipped, under .delivery/<feature>/design-serve/, never committed and never the snapshot itself.
// A prop-only state is served from a temporary copy of the .dc.html whose data-props default for
// that prop is changed, exactly what a person does by hand to see it.

import { copyFile, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { listTree } from '../core/hash.mjs';
import { ensureDir } from '../core/fs.mjs';
import { readZip } from '../core/zip.mjs';
import { UsageError } from '../core/exit.mjs';
import { findDcFile, RUNTIME_ZIP } from '../../adapters/design/claude-design.mjs';
import { htmlUnescape } from './claude-dc.mjs';

export const PROP_COPY_PREFIX = '__delivery__';

/**
 * Copy the snapshot into serveDir and unzip its runtime there. Idempotent; removes stale prop copies.
 * @param {string} snapshotDir
 * @param {string} serveDir
 * @returns {Promise<{ dcFile: string, files: number, runtime: string[] }>}
 */
export async function prepareServeDir(snapshotDir, serveDir) {
  const dc = await findDcFile(snapshotDir);
  if (dc.error) throw new UsageError(`${snapshotDir}: ${dc.error}`, { code: 'design' });
  await ensureDir(serveDir);
  for (const name of await readdir(serveDir)) {
    if (name.startsWith(PROP_COPY_PREFIX)) await unlink(join(serveDir, name)).catch(() => {});
  }
  const files = await listTree(snapshotDir);
  let n = 0;
  for (const rel of files) {
    if (rel === RUNTIME_ZIP) continue;
    const to = join(serveDir, rel);
    await ensureDir(dirname(to));
    await copyFile(join(snapshotDir, rel), to);
    n++;
  }
  const runtime = [];
  const zipPath = join(snapshotDir, RUNTIME_ZIP);
  let zip = null;
  try { zip = await readFile(zipPath); } catch { zip = null; }
  if (zip) {
    for (const e of readZip(zip)) {
      const to = join(serveDir, e.name);
      await ensureDir(dirname(to));
      await writeFile(to, e.data);
      runtime.push(e.name);
    }
  }
  return { dcFile: dc.file, files: n, runtime };
}

const attrEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The .dc.html text with the data-props default of each named prop changed. Unknown props are refused.
 * @param {string} html
 * @param {Record<string, unknown>} props
 */
export function setPropDefaults(html, props) {
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(html);
  const attr = tag && /\bdata-props\s*=\s*"([^"]*)"/i.exec(tag[0]);
  if (!attr) throw new UsageError('the design has no data-props to change', { code: 'design' });
  const valueStart = tag.index + attr.index + attr[0].indexOf('"') + 1;
  const valueEnd = valueStart + attr[1].length;
  let meta;
  try { meta = JSON.parse(htmlUnescape(attr[1])); } catch (err) { throw new UsageError(`data-props is not JSON (${err.message})`, { code: 'design' }); }
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!meta[key] || typeof meta[key] !== 'object') {
      throw new UsageError(`the design has no prop "${key}" (props: ${Object.keys(meta).filter((k) => !k.startsWith('$')).join(', ')})`, { code: 'design' });
    }
    meta[key] = { ...meta[key], default: value };
  }
  return html.slice(0, valueStart) + attrEscape(JSON.stringify(meta)) + html.slice(valueEnd);
}

/**
 * Write the temporary copy for one state beside the original, so relative paths still resolve.
 * @returns {Promise<string>} its file name
 */
export async function writePropCopy(serveDir, dcFile, stateId, props) {
  const html = await readFile(join(serveDir, dcFile), 'utf8');
  const name = `${PROP_COPY_PREFIX}${stateId}.dc.html`;
  await writeFile(join(serveDir, name), setPropDefaults(html, props));
  return name;
}
