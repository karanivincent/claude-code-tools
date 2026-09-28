// delivery retro, end to end: record the run (C1). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// The retro runs in the delivery session only (land, or NEXT after ready goes green). It writes the
// runs ledger, the run's own steers.md and proposals/, and the plugin checkout through PRs; it
// never schedules itself, never touches production, never seeds, dials or opens a database.

import { relative } from 'node:path';
import { buildRecord } from './record.mjs';
import { ledgerPath, readLedger, writeRecord } from './ledger.mjs';

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx  aimed at the run (withRun for a land from another worktree)
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ dryRun?: boolean, ciFailures?: object[] }} [opts]
 * @returns {Promise<{ record: object, ledger: string, wrote: boolean, changed: object[], reverted: object[], needsYou: object[] }>}
 */
export async function runRetro(ctx, paths, opts = {}) {
  const file = ledgerPath(paths);
  const all = await readLedger(file);
  const previous = all.find((r) => r.feature === paths.feature) ?? null;
  const record = await buildRecord(ctx, paths, { previous, ciFailures: opts.ciFailures });
  if (!opts.dryRun) await writeRecord(file, record);
  return { record, ledger: relative(paths.repoRoot, file), wrote: !opts.dryRun, changed: [], reverted: [], needsYou: [] };
}

/** The report lines of a retro. */
export function reportLines(res) {
  const lines = [`retro ${res.record.feature}: ${res.wrote ? `recorded in ${res.ledger} (commit it with the run)` : 'dry run, nothing written'}`];
  lines.push('Changed automatically:');
  lines.push(...(res.changed.length ? res.changed.map((c) => `  ${c}`) : ['  none']));
  lines.push('Reverted:');
  lines.push(...(res.reverted.length ? res.reverted.map((c) => `  ${c}`) : ['  none']));
  lines.push('Needs you:');
  lines.push(...(res.needsYou.length ? res.needsYou.map((c) => `  ${c}`) : ['  nothing']));
  return lines;
}
