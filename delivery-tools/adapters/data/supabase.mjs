// Data adapter for Supabase-backed repos: seeding, probes, teardown. Owner: slice B2
// (docs/ARCHITECTURE.md). Every call goes through ctx.runner or fetch with credentials from the
// environment; nothing here is ever called by a unit test without a stub.

import { notImplementedError } from '../../lib/core/exit.mjs';

/**
 * @typedef {object} DataAdapter
 * @property {string} projectRef   the project this adapter talks to
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} query  read-only SQL
 * @property {(table: string, rows: object[]) => Promise<void>} upsert      by primary key
 * @property {(table: string, ids: string[]) => Promise<number>} deleteByIds
 * @property {() => Promise<{ read: boolean, write: boolean, detail: string }>} probeAccess   preflight P3
 * @property {() => Promise<{ ok: boolean, detail: string }>} probeMigrationApply          preflight P4
 */

/**
 * Called by seed (B2) and preflight P3, P4, P13 (A2). Refuses (exit 2) a project listed in
 * safety.productionRefs and any project other than profile.environments.test.projectRef.
 * @param {import('../../lib/core/ctx.mjs').Ctx} ctx
 * @param {{ projectRef?: string }} [opts] defaults to the profile's test project
 * @returns {Promise<DataAdapter>}
 */
export async function createDataAdapter(ctx, opts = {}) {
  throw notImplementedError('B2', 'createDataAdapter');
}
