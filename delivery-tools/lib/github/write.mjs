// Idempotent GitHub writes (spec 11.3). Every issue, comment and PR body the suite writes carries
// an identity marker; before creating anything we look for it, first among the numbers the run
// recorded itself (GitHub's search index lags a new issue by seconds to minutes), then with a
// marker search across open and closed issues. Only the generated block of a body is ever
// rewritten, so text a person adds outside it survives, and a found issue is never retitled and
// never loses a label. Running any of this twice writes nothing the second time.

import { hasMarker, upsertBlock, readBlock } from '../core/markers.mjs';
import { UsageError } from '../core/exit.mjs';

/** Compare bodies the way GitHub may hand them back (CRLF after a web edit, trailing space). */
export function sameText(a, b) {
  const norm = (s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  return norm(a) === norm(b);
}

/**
 * A body whose generated block holds `content` and which carries the identity marker once.
 * Everything outside the block is kept as it is.
 * @param {string} existing
 * @param {string} block    block start marker, e.g. <!-- delivery:widgets:block:body -->
 * @param {string} content
 * @param {string} marker   identity marker
 */
export function composeBody(existing, block, content, marker) {
  let body = upsertBlock(String(existing ?? '').replace(/\r\n/g, '\n'), block, content);
  if (!hasMarker(body, marker)) body = `${body.replace(/\s*$/, '')}\n\n${marker}\n`;
  return body;
}

/** True when an issue's generated block already holds exactly this content. */
export function blockCurrent(body, block, content) {
  const cur = readBlock(String(body ?? '').replace(/\r\n/g, '\n'), block);
  return cur !== null && sameText(cur, String(content).trim());
}

/**
 * Find an issue by identity marker without writing: own records first, then the marker search.
 * A record hit skips the search: the search API allows about 30 calls a minute, and duplicates
 * only arise when an issue was created without a record, which the search branch handles.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ marker: string, known?: (number|null|undefined)[] }} o
 * @returns {Promise<{ issue: import('../core/gh.mjs').Issue|null, duplicates: import('../core/gh.mjs').Issue[], via: 'record'|'search'|null }>}
 */
export async function findIssue(ctx, { marker, known = [] }) {
  for (const n of [...new Set(known.filter((x) => Number.isInteger(x) && x > 0))]) {
    const issue = await ctx.gh.issueGet(n);
    if (issue && !issue.isPr && hasMarker(issue.body, marker)) return { issue, duplicates: [], via: 'record' };
  }
  const found = (await ctx.gh.findByMarker(marker, { kind: 'issue' })).filter((i) => !i.isPr).sort((a, b) => a.number - b.number);
  if (!found.length) return { issue: null, duplicates: [], via: null };
  return { issue: found[0], duplicates: found.slice(1), via: 'search' };
}

/**
 * Find or create one issue.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{
 *   marker: string, block: string, content: string | ((n: number|null) => string),
 *   title: string, labels?: string[], type?: string|null, known?: (number|null)[],
 *   parent?: number|null, subIssues?: boolean, adopt?: number|null, dryRun?: boolean,
 * }} o
 * @returns {Promise<{ number: number|null, action: 'created'|'updated'|'unchanged'|'adopted', issue: object|null, duplicatesClosed: number[] }>}
 */
export async function ensureIssue(ctx, o) {
  const { marker, block, title, labels = [], type = null, known = [], parent = null, subIssues = false, adopt = null, dryRun = false } = o;
  const contentFor = (n) => String(typeof o.content === 'function' ? o.content(n) : o.content).trim();

  let issue = null;
  let duplicates = [];
  let adopted = false;
  if (adopt) {
    issue = await ctx.gh.issueGet(adopt);
    if (!issue || issue.isPr) throw new UsageError(`issue #${adopt} does not exist (or is a pull request); cannot adopt it`);
    adopted = !hasMarker(issue.body, marker);
    // Adopting over an epic the run created earlier would leave two carrying the marker.
    if (adopted) duplicates = (await ctx.gh.findByMarker(marker, { kind: 'issue' })).filter((i) => !i.isPr && i.number !== adopt);
  } else {
    ({ issue, duplicates } = await findIssue(ctx, { marker, known }));
  }

  if (!issue) {
    if (dryRun) return { number: null, action: 'created', issue: null, duplicatesClosed: [] };
    const created = await ctx.gh.issueCreate({ title, body: composeBody('', block, contentFor(null), marker), labels, type });
    const final = composeBody(created.body, block, contentFor(created.number), marker);
    if (!sameText(final, created.body)) await ctx.gh.issueEdit(created.number, { body: final });
    if (parent && subIssues) await ctx.gh.addSubIssue(parent, created.number);
    return { number: created.number, action: 'created', issue: { ...created, body: final }, duplicatesClosed: [] };
  }

  const n = issue.number;
  const body = composeBody(issue.body, block, contentFor(n), marker);
  const missing = labels.filter((l) => !issue.labels.includes(l));
  const bodyChanged = !sameText(body, issue.body);
  const duplicatesClosed = [];
  if (!dryRun) {
    if (bodyChanged || missing.length) {
      await ctx.gh.issueEdit(n, { ...(bodyChanged ? { body } : {}), ...(missing.length ? { addLabels: missing } : {}) });
    }
    for (const d of duplicates) {
      if (d.state !== 'open') continue;
      await ctx.gh.issueClose(d.number, { comment: `Duplicate of #${n}: both carry the same delivery marker, and #${n} is the one the run tracks.` });
      duplicatesClosed.push(d.number);
    }
  }
  const action = adopted ? 'adopted' : bodyChanged || missing.length ? 'updated' : 'unchanged';
  return { number: n, action, issue: { ...issue, body }, duplicatesClosed };
}

/**
 * Find or create one comment carrying a marker on an issue or PR; edit it in place when it drifted.
 * @returns {Promise<{ id: number|null, action: 'created'|'updated'|'unchanged' }>}
 */
export async function ensureComment(ctx, { issue, marker, body, dryRun = false }) {
  const full = hasMarker(body, marker) ? String(body) : `${marker}\n${body}`;
  const existing = await ctx.gh.findCommentByMarker(issue, marker);
  if (!existing) {
    if (dryRun) return { id: null, action: 'created' };
    const c = await ctx.gh.commentCreate(issue, full);
    return { id: c.id, action: 'created' };
  }
  if (sameText(existing.body, full)) return { id: existing.id, action: 'unchanged' };
  if (!dryRun) await ctx.gh.commentEdit(existing.id, full);
  return { id: existing.id, action: 'updated' };
}
