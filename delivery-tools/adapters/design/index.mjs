// Design adapters (spec 4.0 step 1, 4.2 step 1). Owner: slice C (docs/ARCHITECTURE.md).
// adapters/design/claude-design.mjs and image-folder.mjs each default-export a DesignAdapter.

import { notImplementedError } from '../../lib/core/exit.mjs';

export const ADAPTERS = Object.freeze(['claude-design', 'image-folder']);

/**
 * @typedef {object} DesignAdapter
 * @property {'claude-design'|'image-folder'} name
 * @property {(dir: string) => Promise<{ ok: boolean, reason?: string, project?: string, exportedAt?: string|null }>} detect
 *   whether an unpacked export is one this adapter reads (claude-design: one *.dc.html, shots/, support.js)
 * @property {(dir: string) => Promise<{ copy: string[], zip: string[] }>} snapshotLayout
 *   relative paths intake copies as-is, and runtime scripts it zips into runtime.zip
 * @property {(snapshotDir: string) => Promise<object[]>} candidates
 *   candidates.json items (schemas/candidates.schema.json)
 */

/**
 * The adapter for an unpacked export: the named one, or the first whose detect() says ok.
 * Throws a usage error (exit 2) when none reads it. Called by intake (A2) and design candidates (C).
 * @param {string} dir unpacked export or snapshot directory
 * @param {{ adapter?: 'claude-design'|'image-folder' }} [opts]
 * @returns {Promise<DesignAdapter>}
 */
export async function getDesignAdapter(dir, opts = {}) {
  throw notImplementedError('C', 'getDesignAdapter');
}
