// Assembling the run's PR body from its sources (the I/O half of lib/github/pr.mjs): the plan,
// the late changes, the findings, ready.json's owed items, which units git says are merged, and
// the handover's URL.

import { readFindings } from '../core/findings.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { prBlockContents, composePrBody } from '../github/pr.mjs';
import { lateChanges } from '../github/scope.mjs';
import { builtUnits, claimedPaths, integrationBranch } from './run-info.mjs';
import { findHandover } from './handover.mjs';

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ paths: object, profile: object, plan: object, state: object|null, existing?: string }} o
 * @returns {Promise<{ body: string, late: object[], built: Set<string> }>}
 */
export async function assemblePrBody(ctx, { paths, profile, plan, state, existing = '' }) {
  const late = plan.scopeSnapshot ? await lateChanges(ctx) : [];
  const findingsDoc = await readFindings(paths, state?.runId ?? 'unknown').catch(() => null);
  const ready = await readArtefact(paths, 'ready', { optional: true }).catch(() => null);
  const integration = state?.branch ?? integrationBranch(profile, plan.epic, paths.feature);
  const built = await builtUnits(ctx.git, { plan, integration });
  const handover = await findHandover(ctx, { profile, feature: paths.feature, committedOnly: true });
  const handoverUrl = handover ? `https://github.com/${profile.repo.slug}/blob/${integration}/${handover}` : null;
  const blocks = prBlockContents({ plan, late, findingsDoc, owed: ready?.owedAfterMerge ?? [], built, handoverUrl });
  const body = composePrBody(existing, { profile, feature: paths.feature, blocks, claimed: claimedPaths(plan) });
  return { body, late, built };
}
