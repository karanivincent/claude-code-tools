// Baseline refresh (spec 4.5 wave start step 1, 5.4). Owner: slice B2 (docs/ARCHITECTURE.md).
// Other lanes keep shipping while a run is going. A capability that lands on an in-scope file of
// the base branch after the run began is appended to baseline.json and given a plan row, class
// migrate by default, with a Tier 1 decision file saying so; the next M2 then holds the branch to
// keeping it.

import { join } from 'node:path';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { fillCommand } from '../core/profile.mjs';
import { writeJsonAtomic, exists } from '../core/fs.mjs';
import { extractAtRef, KIND_ORDER } from './extract.mjs';

/**
 * Re-extract at origin/<base>; append a refreshes entry to baseline.json; give each capability that
 * landed since the run began a plan row (class migrate, a Tier 1 decision file). unclassed lists
 * any that could not be given a row; wave start refuses to finish while it is non-empty.
 * Called by wave start (A2) and ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ ref?: string }} [opts] ref: what to refresh against (default origin/<base>; ready passes the PR's merge base)
 * @returns {Promise<{ added: string[], unclassed: string[] }>}
 */
export async function refreshBaseline(ctx, opts = {}) {
  const paths = ctx.requirePaths();
  const intent = await readArtefact(paths, 'intent');
  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  if (!baseline) return { added: [], unclassed: [] };
  const profile = await ctx.profile();
  const ref = opts.ref ?? `origin/${profile.repo.base}`;
  const r = await extractAtRef(ctx, { ref, profile, intent, captureDir: null });
  const known = new Set(baseline.capabilities.map((c) => c.signature));
  const fresh = r.capabilities
    .filter((c) => !known.has(c.signature) && c.kind !== 'open-issue')
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.signature < b.signature ? -1 : 1));
  let next = baseline.capabilities.reduce((m, c) => Math.max(m, Number(c.id.slice(4))), 0) + 1;
  const added = fresh.map((c) => ({ id: `CAP-${String(next++).padStart(3, '0')}`, kind: c.kind, signature: c.signature, screen: c.screen ?? '', evidence: c.evidence }));
  const updated = {
    ...baseline,
    capabilities: [...baseline.capabilities, ...added],
    refreshes: [...baseline.refreshes, { sha: r.sha, at: ctx.clock.now().toISOString(), added: added.map((c) => c.id) }],
  };
  await writeArtefact(paths, 'baseline', updated);

  // Every capability any refresh added needs a row: this one's, and earlier ones that arrived
  // before there was a plan to put them in.
  const unclassed = [];
  const refreshed = new Set(updated.refreshes.flatMap((x) => x.added));
  const plan = await readArtefact(paths, 'plan', { optional: true });
  const have = new Set((plan?.rows ?? []).map((row) => row.id));
  const pending = updated.capabilities.filter((c) => refreshed.has(c.id) && !have.has(c.id));
  if (pending.length && !plan) unclassed.push(...pending.map((c) => c.id));
  else if (pending.length) {
    const rows = pending.map((c) => ({
      id: c.id, class: 'migrate', owner: null, requested: null, invented: false,
      data: [], backend: [], controls: [], copy: [], dayOne: false, invariants: [],
    }));
    await writeArtefact(paths, 'plan', { ...plan, rows: [...plan.rows, ...rows] });
    await writeDecision(ctx, profile, paths.feature, r.sha, pending);
  }
  await ctx.journal({ command: 'baseline --refresh', exit: unclassed.length ? 1 : 0, counts: { added: added.length, unclassed: unclassed.length }, outputs: added.map((c) => c.signature) });
  return { added: added.map((c) => c.id), unclassed };
}

async function writeDecision(ctx, profile, feature, sha, added) {
  const slug = `delivery-${feature}-baseline-refresh-${sha.slice(0, 9)}`;
  const rel = fillCommand(profile.decisions.file, { slug });
  const path = join(ctx.repoRoot, rel);
  if (await exists(path)) return;
  await writeJsonAtomic(path, {
    title: `Keep ${added.length} capabilit${added.length === 1 ? 'y' : 'ies'} that landed on ${profile.repo.base} during the ${feature} run (default: migrate)`,
    why: `The base branch gained ${added.map((c) => c.signature).join('; ')} after the run began. The design predates them, so the default is migrate: keep each somewhere sensible on the new page rather than lose it in the merge. Remove would need a Scope line the founder answers.`,
    undo: 'Change the plan rows to remove and add a Scope line, or name a different migrateTo; M2 then checks the new decision.',
    tier: 1,
  });
}
