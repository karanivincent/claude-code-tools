// Design adapters (spec 4.0 step 1, 4.2 step 1). Owner: slice C (docs/ARCHITECTURE.md).
// adapters/design/claude-design.mjs and image-folder.mjs each default-export a DesignAdapter.

import { UsageError } from '../../lib/core/exit.mjs';
import { sha256Tree } from '../../lib/core/hash.mjs';
import claudeDesign from './claude-design.mjs';
import imageFolder from './image-folder.mjs';

export const ADAPTERS = Object.freeze(['claude-design', 'image-folder']);

const BY_NAME = Object.freeze({ 'claude-design': claudeDesign, 'image-folder': imageFolder });

/**
 * @typedef {object} DesignAdapter
 * @property {'claude-design'|'image-folder'} name
 * @property {(dir: string) => Promise<{ ok: boolean, reason?: string, project?: string, exportedAt?: string|null }>} detect
 *   whether an unpacked export is one this adapter reads (claude-design: one *.dc.html, shots/, support.js)
 * @property {(dir: string) => Promise<{ copy: string[], zip: string[] }>} snapshotLayout
 *   relative paths intake copies as-is, and runtime scripts it zips into runtime.zip
 * @property {(snapshotDir: string) => Promise<object[]>} candidates
 *   candidates.json items (schemas/candidates.schema.json)
 * @property {(snapshotDir: string) => Promise<{ key: string, values: string[] } | null>} [screens]
 *   the design's screens, when it holds several and the adapter can tell them apart
 */

/**
 * The adapter for an unpacked export: the named one, or the first whose detect() says ok.
 * Throws a usage error (exit 2) when none reads it. Called by intake (A2) and design candidates (C).
 * Only claude-design is tried by default: a folder of pictures is read as one only when the
 * caller names image-folder (spec 4.0 step 1: anything else is refused unless --adapter image-folder).
 * @param {string} dir unpacked export or snapshot directory
 * @param {{ adapter?: 'claude-design'|'image-folder' }} [opts]
 * @returns {Promise<DesignAdapter>}
 */
export async function getDesignAdapter(dir, opts = {}) {
  if (opts.adapter) {
    const a = BY_NAME[opts.adapter];
    if (!a) throw new UsageError(`unknown design adapter "${opts.adapter}"; one of: ${ADAPTERS.join(', ')}`);
    const d = await a.detect(dir);
    if (!d.ok) throw new UsageError(`${dir} is not a ${a.name} design: ${d.reason}`, { code: 'design' });
    return a;
  }
  const d = await claudeDesign.detect(dir);
  if (d.ok) return claudeDesign;
  throw new UsageError(`${dir} is not a Claude Design export: ${d.reason} (a folder of pictures needs --adapter image-folder)`, { code: 'design' });
}

/**
 * The design's identity for candidates.json and inventory.json: the snapshot's tree hash with
 * loose runtime scripts left out, since those are only ever unzipped copies of runtime.zip.
 * @param {string} snapshotDir
 */
export async function designTreeSha256(snapshotDir) {
  return sha256Tree(snapshotDir, { ignore: (rel) => rel.endsWith('.js') || rel.startsWith('__delivery__') });
}
