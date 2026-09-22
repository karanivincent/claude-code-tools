// Duplicate PRs (spec 12.3). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// Another lane can still ship an issue the run claimed, or land a change in a file the run is
// replacing. Any such PR, open or merged since the run began, is red: the affected unit stops
// merging, and the main session decides (a Tier 1 decision: adopt its branch, or ask for it to be
// closed), then baseline --refresh classes what it added.
//
// The decision is recorded against that PR's head SHA (delivery dupes --decide <pr> --note
// "<text>"), which is what lets a run continue past an overlap the protocol says to decide rather
// than build away: two features appending keys to one shared registry file is the common case, and
// without a way to record the decision the whole wave stopped, including units sharing no file
// with the other PR. A decision never silences the check — the hit is still found, still listed
// and still named in the report, and a new commit on that PR is a new SHA and a fresh decision.

import { hasMarker } from '../core/markers.mjs';
import { runMarkers, readPlan, readState, claimedChildren, claimedPaths, findRunPr, matchesAny, clip } from '../lifecycle/run-info.mjs';
import { referencedIssues } from './pr.mjs';

/** Issue numbers a branch name carries the way the pool names branches (night/1733-some-title). */
export function branchIssues(headRefName) {
  return new Set([...String(headRefName ?? '').matchAll(/(?:^|\/)(\d+)-/g)].map((m) => Number(m[1])));
}

/**
 * The decision recorded for a PR, only while it is still on the head SHA that was decided.
 * @param {{ dupeDecisions?: { pr: number, sha: string, note: string, units: string[], at: string }[] }|null} state
 * @param {number} pr
 * @param {string|null|undefined} sha
 */
export function decisionFor(state, pr, sha) {
  const d = (state?.dupeDecisions ?? []).find((x) => x.pr === pr);
  if (!d) return null;
  return sha && d.sha === sha ? d : null;
}

/** The hits that still stop the run: those with no decision at their current head. */
export function undecided(hits) {
  return hits.filter((h) => !h.decided);
}

/**
 * PRs that are not the run's, open or merged since the run began, that reference a claimed child
 * or touch a claimed path. Called by ready (A1) and wave start/end (A2). Each hit names the units
 * it affects and says whether a decision covers it at its current head SHA.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ pr: number, sha: string|null, units: string[], decided: boolean, note: string|null, reason: string }[]>}
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
  const ownersOf = unitsByPath(plan);

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
    const units = new Set();
    const refs = new Set([...referencedIssues(pr.body), ...branchIssues(pr.headRefName)]);
    for (const n of refs) {
      if (!children.has(n)) continue;
      reasons.push(`references #${n}, which the run claims for ${children.get(n)}`);
      units.add(children.get(n));
    }
    if (claimed.length) {
      const touched = (await ctx.gh.prFiles(pr.number)).filter((f) => matchesAny(f, claimed));
      if (touched.length) reasons.push(`touches ${touched.length} claimed path${touched.length === 1 ? '' : 's'}, first ${touched[0]}`);
      for (const f of touched) for (const u of ownersOf(f)) units.add(u);
    }
    if (reasons.length) {
      const sha = pr.headRefOid ?? null;
      const decision = decisionFor(state, pr.number, sha);
      out.push({
        pr: pr.number,
        sha,
        units: [...units].sort(),
        decided: Boolean(decision),
        note: decision ? decision.note : null,
        reason: `${pr.state === 'merged' ? 'merged' : 'open'} PR #${pr.number} "${clip(pr.title, 60)}" ${reasons.join('; ')}`,
      });
    }
  }
  return out.sort((a, b) => a.pr - b.pr);
}

/**
 * A lookup from a claimed file to the ids of the plan's units it affects: those that build it,
 * plus the consumers of a contract whose file or stub it is.
 */
function unitsByPath(plan) {
  const units = plan?.units ?? [];
  const contracts = plan?.contracts ?? [];
  return (file) => {
    const ids = new Set(units.filter((u) => (u.files ?? []).includes(file)).map((u) => u.id));
    for (const c of contracts) if (c.file === file || c.stub === file) for (const u of c.consumers ?? []) ids.add(u);
    return [...ids];
  };
}
