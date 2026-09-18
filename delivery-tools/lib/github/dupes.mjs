// Duplicate PRs (spec 12.3). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Another lane can still ship an issue the run claimed, or land a change in a file the run is
// replacing. Any such PR, open or merged since the run began, is red: the affected unit stops
// merging, and the main session decides (a Tier 1 decision: adopt its branch, or ask for it to be
// closed), then baseline --refresh classes what it added.

import { hasMarker } from '../core/markers.mjs';
import { runMarkers, readPlan, readState, claimedChildren, claimedPaths, findRunPr, matchesAny, clip } from '../lifecycle/run-info.mjs';
import { referencedIssues } from './pr.mjs';

/** Issue numbers a branch name carries the way the pool names branches (night/1733-some-title). */
export function branchIssues(headRefName) {
  return new Set([...String(headRefName ?? '').matchAll(/(?:^|\/)(\d+)-/g)].map((m) => Number(m[1])));
}

/**
 * PRs that are not the run's, open or merged since the run began, that reference a claimed child
 * or touch a claimed path. Called by ready (A1) and wave start/end (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ pr: number, reason: string }[]>}
 */
export async function findDupes(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  const state = await readState(paths);
  const marks = runMarkers(profile, paths.feature);
  const since = state?.journal?.[0]?.at ?? null;
  const mine = await findRunPr(ctx, { profile, feature: paths.feature, state });
  const children = new Map(claimedChildren(plan).filter((c) => c.issue).map((c) => [c.issue, c.unit]));
  const claimed = claimedPaths(plan);

  const open = await ctx.gh.prList({ state: 'open', limit: 100 });
  const merged = (await ctx.gh.prList({ state: 'merged', limit: 100 }))
    .filter((p) => !since || (p.mergedAt && Date.parse(p.mergedAt) >= Date.parse(since)));
  const out = [];
  const seen = new Set();
  for (const pr of [...open, ...merged]) {
    if (seen.has(pr.number)) continue;
    seen.add(pr.number);
    if ((mine && pr.number === mine.number) || hasMarker(pr.body, marks.pr())) continue;
    const reasons = [];
    const refs = new Set([...referencedIssues(pr.body), ...branchIssues(pr.headRefName)]);
    for (const n of refs) if (children.has(n)) reasons.push(`references #${n}, which the run claims for ${children.get(n)}`);
    if (claimed.length) {
      const touched = (await ctx.gh.prFiles(pr.number)).filter((f) => matchesAny(f, claimed));
      if (touched.length) reasons.push(`touches ${touched.length} claimed path${touched.length === 1 ? '' : 's'}, first ${touched[0]}`);
    }
    if (reasons.length) {
      out.push({ pr: pr.number, reason: `${pr.state === 'merged' ? 'merged' : 'open'} PR #${pr.number} "${clip(pr.title, 60)}" ${reasons.join('; ')}` });
    }
  }
  return out.sort((a, b) => a.pr - b.pr);
}
