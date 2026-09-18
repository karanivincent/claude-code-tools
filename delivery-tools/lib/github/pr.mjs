// The run's draft PR body (spec 4.4 step 1, 11.5): generated blocks between markers, in a fixed
// order with late changes first. Text a person writes outside the blocks is left alone. The
// claimed-paths block uses the global claims marker the repo's scope check reads (spec 12.2).

import { upsertBlock, readBlock, hasMarker } from '../core/markers.mjs';
import { isStateId, clip, runMarkers } from '../lifecycle/run-info.mjs';
import { describeLateChange } from './scope.mjs';

/** Block names, in the order a new body carries them. */
export const PR_BLOCKS = Object.freeze(['late-changes', 'coverage', 'removed', 'accepted', 'owed', 'children', 'handover']);

/** Counts the Coverage block and the report share (spec 11.5). Pure over the plan. */
export function coverageCounts(plan) {
  const states = plan.rows.filter((r) => isStateId(r.id));
  const caps = plan.rows.filter((r) => !isStateId(r.id));
  const built = states.filter((r) => ['new', 'change', 'keep', 'adapt'].includes(r.class));
  return {
    statesBuilt: built.length,
    cut: plan.rows.filter((r) => r.class === 'cut').length,
    cutWithIssue: plan.rows.filter((r) => r.class === 'cut' && r.issue).length,
    adapted: plan.rows.filter((r) => r.class === 'adapt').length,
    invented: plan.rows.filter((r) => r.invented).length,
    removed: plan.rows.filter((r) => r.class === 'remove').length,
    kept: caps.filter((r) => ['keep', 'change'].includes(r.class)).length,
    migrated: caps.filter((r) => r.class === 'migrate').length,
  };
}

/**
 * The generated blocks' content, by name.
 * @param {{
 *   plan: object, late: { row: string, from: string, to: string, scopeLine: string|null }[],
 *   findingsDoc?: object|null, owed?: string[], built?: Set<string>, handoverUrl?: string|null,
 * }} o  built: unit ids whose branch is merged into the integration branch
 */
export function prBlockContents({ plan, late, findingsDoc = null, owed = [], built = new Set(), handoverUrl = null }) {
  const c = coverageCounts(plan);
  const blocks = {};
  blocks['late-changes'] = late.length
    ? ['### Late changes', '', 'Rows whose class changed after the Scope issue was posted:', '', ...late.map((l) => `- ${describeLateChange(l)}`)].join('\n')
    : '### Late changes\n\nNone: every row still has the class the Scope issue showed.';
  blocks.coverage = [
    '### Coverage',
    '',
    `- ${c.statesBuilt} designed state${c.statesBuilt === 1 ? '' : 's'} built, ${c.adapted} of them adapted to a product rule`,
    `- ${c.cut} cut, ${c.cutWithIssue} with a follow-up issue`,
    `- ${c.invented} state${c.invented === 1 ? '' : 's'} the design did not draw, invented from the house components`,
    `- existing capabilities: ${c.kept} kept, ${c.migrated} moved, ${c.removed} removed`,
  ].join('\n');
  const removed = plan.rows.filter((r) => r.class === 'remove');
  blocks.removed = removed.length
    ? ['### Removed capabilities', '', ...removed.map((r) => {
      const line = plan.scope.find((s) => s.rows.includes(r.id) || s.line === r.scopeLine);
      return `- ${r.id}${r.reason ? ` (${r.reason.code}: ${r.reason.text})` : ''}: ${line ? `Scope line ${line.line}, ${line.reply ? `decided "${line.reply}"` : 'default applied'}` : 'no Scope line'}`;
    })].join('\n')
    : '### Removed capabilities\n\nNone.';
  const accepted = (findingsDoc?.findings ?? []).filter((f) => f.status === 'accepted');
  blocks.accepted = accepted.length
    ? ['### Accepted differences', '', ...accepted.map((f) => `- ${f.severity} ${f.state} \`${f.where}\`: design "${clip(f.design, 100)}", live "${clip(f.live, 100)}". Accepted as ${f.accept?.reasonClass ?? 'unknown'}${f.accept?.issue ? `, #${f.accept.issue}` : ''}: ${clip(f.accept?.text ?? '', 160)}`)].join('\n')
    : '### Accepted differences\n\nNone.';
  blocks.owed = owed.length ? ['### Owed after merge', '', ...owed.map((o) => `- ${o}`)].join('\n') : '### Owed after merge\n\nNothing.';
  const children = plan.units.filter((u) => u.issue).map((u) => (built.has(u.id) ? `Closes #${u.issue}` : `Refs #${u.issue}`));
  blocks.children = children.length ? children.join('\n') : 'No children filed yet.';
  blocks.handover = handoverUrl ? `Handover: ${handoverUrl}` : 'Handover: not written yet.';
  return blocks;
}

/** The claimed-paths block's content (spec 12.2): one path per line, easy to pattern-match. */
export function claimsContent(paths) {
  return ['Claimed paths: other lanes\' pull requests that touch these wait for this one.', '', ...paths.map((p) => `- \`${p}\``)].join('\n');
}

/** Paths listed in a body's claimed-paths block. */
export function parseClaims(body, claimsMarker) {
  const inner = readBlock(String(body ?? '').replace(/\r\n/g, '\n'), claimsMarker);
  if (inner === null) return null;
  return [...inner.matchAll(/^- `([^`]+)`$/gm)].map((m) => m[1]);
}

/**
 * The whole body: each block upserted in place (or appended in PR_BLOCKS order), the claims
 * block, the identity marker last. Pure.
 */
export function composePrBody(existing, { profile, feature, blocks, claimed = null }) {
  const marks = runMarkers(profile, feature);
  let body = String(existing ?? '').replace(/\r\n/g, '\n');
  for (const name of PR_BLOCKS) {
    if (blocks[name] === undefined) continue;
    body = upsertBlock(body, marks.block(name), blocks[name]);
  }
  if (claimed) body = upsertBlock(body, marks.claims(), claimsContent(claimed));
  if (!hasMarker(body, marks.pr())) body = `${body.replace(/\s*$/, '')}\n\n${marks.pr()}\n`;
  return body;
}

/** Issue numbers a body references with Refs or a closing keyword. */
export function referencedIssues(body) {
  const out = new Set();
  for (const m of String(body ?? '').matchAll(/\b(?:refs?|close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi)) out.add(Number(m[1]));
  return out;
}

