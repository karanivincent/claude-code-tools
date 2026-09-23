// The run's PR and epic, found from state when it names them and otherwise by marker (spec 11.3
// step 4). A number in state is an identifier, not a verdict, so gates may use it.

import { makeMarker } from '../core/markers.mjs';
import { readArtefact } from '../core/artefacts.mjs';

/** profile.issues.markerPrefix, or "delivery" when the profile cannot be read. */
export async function markerPrefix(ctx) {
  try { return (await ctx.profile()).issues?.markerPrefix || 'delivery'; } catch { return 'delivery'; }
}

/** <!-- delivery:<feature>:pr --> for this run. */
export async function prMarker(ctx, feature) {
  return makeMarker({ prefix: await markerPrefix(ctx), feature, kind: 'pr' });
}

/**
 * The run's PR: state.pr when it resolves, else the PR carrying the run's pr marker (an open one
 * first, then the newest). Null when the run has none yet.
 * @param {object} ctx
 * @param {{ feature: string, pr: number|null }} state
 * @returns {Promise<import('../core/gh.mjs').Pr|null>}
 */
export async function findRunPr(ctx, state) {
  if (state.pr) {
    const p = await ctx.gh.prGet(state.pr);
    if (p) return p;
  }
  const hits = (await ctx.gh.findByMarker(await prMarker(ctx, state.feature), { kind: 'pr' })).filter((h) => h.isPr !== false);
  if (!hits.length) return null;
  hits.sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || b.number - a.number);
  return ctx.gh.prGet(hits[0].number);
}

/**
 * The run's epic number: state.epic, else plan.epic, else the issue carrying the epic marker.
 * @param {object} ctx
 * @param {{ epic: number|null }} state
 * @returns {Promise<number|null>}
 */
export async function findRunEpicNumber(ctx, state) {
  if (state.epic) return state.epic;
  const plan = await readArtefact(ctx.requirePaths(), 'plan', { optional: true }).catch(() => null);
  if (plan?.epic) return plan.epic;
  // Loaded here so the hooks, which only need the PR, never load A2's module graph.
  const find = ctx?.deps?.findEpic ?? (await import('../github/issues.mjs')).findEpic;
  const epic = await find(ctx);
  return epic?.number ?? null;
}
