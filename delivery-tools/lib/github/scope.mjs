// The Scope issue (spec 10.2, 10.4). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// One issue per run, at most five lines, each with a default and the wave it applies at. The
// founder answers with a comment in a fixed form ("S2 keep"); anything else goes to the
// scope-reply extractor and comes back through `scope read --apply`.
//
// The Scope snapshot is the row classes the founder has seen. It is stored in the Scope issue
// itself, as an invisible comment inside the generated section, and plan.scopeSnapshot holds its
// hash (sha256 of the canonical class map), so a class that changes afterwards is a late change
// (10.4) and the snapshot cannot be edited without the mismatch showing (exit 5). Applying one of
// the founder's replies moves the snapshot with it: his decision is what he has seen.

import { gateResult } from '../core/gate.mjs';
import { hashJson } from '../core/hash.mjs';
import { readBlock } from '../core/markers.mjs';
import { InconsistencyError, UsageError, DeliveryError, EXIT } from '../core/exit.mjs';
import { runMarkers, readPlan, updatePlan, CAP_ID_RE } from '../lifecycle/run-info.mjs';
import { ensureIssue, findIssue, blockCurrent } from './write.mjs';

export const MAX_SCOPE_LINES = 5;

/** The two words a line accepts, and the class each gives the line's rows. */
export const REPLY_WORDS = Object.freeze({
  'cut-requested': { byDefault: 'cut', other: 'build', verb: 'build it', classFor: (word, id) => (word === 'cut' ? 'cut' : CAP_ID_RE.test(id) ? 'migrate' : 'new') },
  remove: { byDefault: 'remove', other: 'keep', verb: 'keep it', classFor: (word) => (word === 'remove' ? 'remove' : 'migrate') },
  'adapt-behaviour': { byDefault: 'adapt', other: 'design', verb: 'build it as designed', classFor: (word, id) => (word === 'adapt' ? 'adapt' : CAP_ID_RE.test(id) ? 'change' : 'new') },
});

/** { rowId: class } for every row of the plan, sorted by id. */
export function classMap(plan) {
  const out = {};
  for (const r of [...plan.rows].sort((a, b) => a.id.localeCompare(b.id))) out[r.id] = r.class;
  return out;
}

export function snapshotHash(classes) {
  return hashJson(classes);
}

const SNAP_RE = /<!--\s*snapshot:([A-Za-z0-9_-]+)\s*-->/;

export function encodeSnapshot(snap) {
  return `<!-- snapshot:${Buffer.from(JSON.stringify(snap)).toString('base64url')} -->`;
}

/** The snapshot inside a Scope issue body's generated section, or null. */
export function decodeSnapshot(body, block) {
  const inner = readBlock(String(body ?? '').replace(/\r\n/g, '\n'), block);
  const m = inner?.match(SNAP_RE);
  if (!m) return null;
  try {
    const snap = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    if (!snap || typeof snap.classes !== 'object') return null;
    return { v: 1, classes: snap.classes, handled: Array.isArray(snap.handled) ? snap.handled : [] };
  } catch { return null; }
}

/** One Scope line as the founder reads it. */
export function renderScopeLine(s) {
  const words = REPLY_WORDS[s.kind];
  const text = String(s.text).trim().replace(/\s*$/, '');
  if (s.reply) return `${s.line} · ${text} Decided: ${s.reply} (your reply).`;
  const dflt = String(s.default).trim().replace(/\.$/, '');
  return `${s.line} · ${text} Default: ${dflt}.\n     Applies at wave ${s.appliesAtWave} start. Reply "${s.line} ${words.other}" to ${words.verb}.`;
}

/** The Scope issue's generated section, snapshot included when there is one. */
export function renderScopeContent({ plan, epic, feature, snap = null }) {
  const lines = [];
  if (!plan.scope.length) {
    lines.push(`Nothing in the \`${feature}\` delivery run (#${epic}) needs your decision. A line appears here, and this issue reopens, if a later change does.`);
  } else {
    lines.push(`Decisions for #${epic}, the \`${feature}\` delivery run. Each line has a default that applies at the wave shown if you do not answer. To change one, comment with its code and the word shown, for example "${plan.scope[0].line} ${REPLY_WORDS[plan.scope[0].kind].other}". Nothing here stops the build.`);
    for (const s of plan.scope) lines.push('', renderScopeLine(s));
  }
  if (snap) lines.push('', encodeSnapshot(snap));
  return lines.join('\n');
}

export function scopeTitle(epic, feature) {
  return `Scope for #${epic}: ${feature}`;
}

/**
 * Create or update the Scope issue. With snapshot true (scope post) the snapshot is taken when
 * the plan has none, else the stored one is kept and verified. With snapshot false (issues sync)
 * the stored one is kept as it is. Returns the issue number and the snapshot hash in force.
 * @returns {Promise<{ number: number|null, action: string, snapshot: string|null, openLines: number }>}
 */
export async function ensureScopeIssue(ctx, { paths, profile, plan, epic, dryRun = false, snapshot = false, resnapshot = false, handled = null }) {
  const feature = paths.feature;
  const marks = runMarkers(profile, feature);
  const block = marks.block('body');
  if (plan.scope.length > MAX_SCOPE_LINES) {
    throw new DeliveryError(EXIT.RED, `the plan has ${plan.scope.length} Scope lines; at most ${MAX_SCOPE_LINES}, so the plan is wrong (spec 10.2)`, { code: 'scope' });
  }
  const { issue: existing } = await findIssue(ctx, { marker: marks.scope(), known: [plan.scopeIssue] });
  const stored = existing ? decodeSnapshot(existing.body, block) : null;

  let snap = stored;
  let hash = plan.scopeSnapshot;
  if (snapshot && (!plan.scopeSnapshot || resnapshot)) {
    snap = { v: 1, classes: classMap(plan), handled: stored?.handled ?? [] };
    hash = snapshotHash(snap.classes);
  } else if (snapshot && plan.scopeSnapshot) {
    if (!stored || snapshotHash(stored.classes) !== plan.scopeSnapshot) {
      throw new InconsistencyError(`the Scope issue${existing ? ` #${existing.number}` : ''} does not hold the snapshot plan.json records (${plan.scopeSnapshot.slice(0, 12)}); \`delivery scope post --resnapshot\` takes a new one, and late changes before it are then not listed`, { code: 'scope' });
    }
  }
  if (snap && handled) snap = { ...snap, handled: [...new Set([...snap.handled, ...handled])] };

  const openLines = plan.scope.filter((s) => !s.reply).length;
  const res = await ensureIssue(ctx, {
    marker: marks.scope(),
    block,
    content: renderScopeContent({ plan, epic, feature, snap }),
    title: scopeTitle(epic, feature),
    labels: openLines ? [profile.issues.scopeLabel] : [],
    known: [plan.scopeIssue],
    dryRun,
  });

  if (!dryRun && res.number) {
    const now = res.issue;
    if (openLines && now.state === 'closed') await ctx.gh.issueEdit(res.number, { state: 'open' });
    if (!openLines && now.state === 'open') {
      const drop = now.labels.includes(profile.issues.scopeLabel) ? [profile.issues.scopeLabel] : [];
      await ctx.gh.issueEdit(res.number, { state: 'closed', removeLabels: drop });
    }
    if (plan.scopeIssue !== res.number || (snapshot && hash !== plan.scopeSnapshot)) {
      await updatePlan(paths, (p) => ({ ...p, scopeIssue: res.number, ...(snapshot ? { scopeSnapshot: hash } : {}) }));
    }
  }
  return { number: res.number, action: res.action, snapshot: snapshot ? hash : plan.scopeSnapshot, openLines };
}

/** scope post (spec 4.3 step 6). */
export async function postScope(ctx, { resnapshot = false, dryRun = false } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  return ensureScopeIssue(ctx, { paths, profile, plan, epic: plan.epic, dryRun, snapshot: true, resnapshot });
}

// A reply line: "S2 keep", "- S2: keep". Quoted lines ("> S1 · Cut ...") are his quote of the
// issue, not his answer, so they are skipped before this runs.
const LINE_RE = /^\s*[-*]?\s*(S\d+)\s*[·:.,-]?\s*([A-Za-z]+)\b/i;

/**
 * The founder's fixed-form replies, oldest first, and the comments that are not in that form.
 * A comment counts as understood only when every S-line in it names a known line and one of its
 * two words; a comment with no S-line at all goes to the extractor.
 * @param {{ id: number, body: string, author: string, createdAt: string }[]} comments
 * @param {string} login
 * @param {object} plan
 * @param {number[]} handled comment ids already mapped or set aside
 */
export function parseReplies(comments, login, plan, handled = []) {
  const skip = new Set(handled.map(Number));
  const byLine = new Map(plan.scope.map((s) => [s.line.toUpperCase(), s]));
  const decisions = [];
  const unmapped = [];
  const mine = comments
    .filter((c) => String(c.author).toLowerCase() === String(login).toLowerCase() && !skip.has(Number(c.id)))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id - b.id);
  for (const c of mine) {
    const found = [];
    let bad = false;
    for (const raw of String(c.body).replace(/\r\n/g, '\n').split('\n')) {
      if (/<!--/.test(raw) || !raw.trim() || /^\s*>/.test(raw)) continue;
      const m = raw.match(LINE_RE);
      if (!m) continue;
      const entry = byLine.get(m[1].toUpperCase());
      const word = m[2].toLowerCase();
      const words = entry ? REPLY_WORDS[entry.kind] : null;
      if (!entry || (word !== words.byDefault && word !== words.other)) { bad = true; continue; }
      found.push({ line: entry.line, word, commentId: c.id, at: c.createdAt });
    }
    if (found.length && !bad) decisions.push(...found);
    else unmapped.push({ id: c.id, body: c.body, at: c.createdAt });
  }
  return { decisions, unmapped };
}

/**
 * Apply decisions to the plan (pure): each line's rows take the class its word gives, the line
 * records the word, the latest decision per line wins. Rows leaving `cut` keep their reason and
 * issue, so a later "cut" reply restores them whole.
 * @returns {{ plan: object, applied: { line: string, word: string, rows: { id: string, from: string, to: string }[] }[] }}
 */
export function applyDecisions(plan, decisions) {
  const next = structuredClone(plan);
  const latest = new Map();
  for (const d of decisions) latest.set(d.line, d);
  const applied = [];
  for (const d of latest.values()) {
    const s = next.scope.find((x) => x.line === d.line);
    if (!s) continue;
    const words = REPLY_WORDS[s.kind];
    const rows = [];
    for (const id of s.rows) {
      const row = next.rows.find((r) => r.id === id);
      if (!row) continue;
      const to = words.classFor(d.word, id);
      if (row.class !== to) { rows.push({ id, from: row.class, to }); row.class = to; }
    }
    if (s.reply !== d.word || rows.length) {
      s.reply = d.word;
      applied.push({ line: d.line, word: d.word, rows });
    }
  }
  return { plan: next, applied };
}

/**
 * scope read (spec 10.2): apply the founder's fixed-form replies and any mappings the main session
 * passes (--apply "S1 build" --comment <id>), set aside comments it passes (--ignore <id>), and
 * list what is still unmapped.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ apply?: string[], comment?: number|null, ignore?: number[], dryRun?: boolean }} [o]
 */
export async function readScope(ctx, { apply = [], comment = null, ignore = [], dryRun = false } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  const marks = runMarkers(profile, paths.feature);
  const block = marks.block('body');
  const { issue } = await findIssue(ctx, { marker: marks.scope(), known: [plan.scopeIssue] });
  if (!issue) throw new UsageError('no Scope issue yet; run delivery scope post first');
  const stored = decodeSnapshot(issue.body, block);
  if (!stored || !plan.scopeSnapshot || snapshotHash(stored.classes) !== plan.scopeSnapshot) {
    throw new InconsistencyError(`Scope issue #${issue.number} does not hold the snapshot plan.json records; run delivery scope post${plan.scopeSnapshot ? ' --resnapshot' : ''}`, { code: 'scope' });
  }

  const comments = await ctx.gh.commentList(issue.number);
  const { decisions, unmapped } = parseReplies(comments, profile.founder.github, plan, stored.handled);
  for (const text of apply) {
    const m = String(text).match(LINE_RE);
    const s = m && plan.scope.find((x) => x.line.toUpperCase() === m[1].toUpperCase());
    const word = m?.[2]?.toLowerCase();
    if (!s || (word !== REPLY_WORDS[s.kind].byDefault && word !== REPLY_WORDS[s.kind].other)) {
      throw new UsageError(`--apply "${text}" is not a line of this Scope issue with one of its two words`);
    }
    decisions.push({ line: s.line, word, commentId: comment, at: '9999' });
  }
  const handledNow = [...(comment ? [comment] : []), ...ignore];
  const stillUnmapped = unmapped.filter((u) => !handledNow.includes(Number(u.id)));

  const { plan: next, applied } = applyDecisions(plan, decisions);
  const classes = { ...stored.classes };
  for (const a of applied) for (const r of a.rows) classes[r.id] = r.to;
  const hash = snapshotHash(classes);
  const snap = { v: 1, classes, handled: [...new Set([...stored.handled, ...handledNow])] };

  const changed = applied.length > 0 || handledNow.length > 0;
  if (changed && !dryRun) {
    await ensureIssue(ctx, {
      marker: marks.scope(), block, known: [issue.number], title: issue.title,
      content: renderScopeContent({ plan: next, epic: next.epic, feature: paths.feature, snap }),
    });
    await updatePlan(paths, (p) => {
      for (const a of applied) {
        const s = p.scope.find((x) => x.line === a.line);
        if (s) s.reply = a.word;
        for (const r of a.rows) { const row = p.rows.find((x) => x.id === r.id); if (row) row.class = r.to; }
      }
      p.scopeSnapshot = hash;
      return p;
    });
    const open = next.scope.filter((s) => !s.reply).length;
    if (!open && issue.state === 'open') {
      await ctx.gh.issueEdit(issue.number, { state: 'closed', removeLabels: issue.labels.includes(profile.issues.scopeLabel) ? [profile.issues.scopeLabel] : [] });
    }
  }
  return { issue: issue.number, applied, unmapped: stillUnmapped, ignored: ignore, snapshot: hash };
}

/**
 * Phase-3 gate input: the Scope issue exists (by record or marker), its generated section shows
 * every plan.scope line as the plan has it, and plan.scopeSnapshot is set and matches the snapshot
 * the issue holds. Read-only.
 * Called by lib/gates/phase-3.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function scopeGate(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  const marks = runMarkers(profile, paths.feature);
  const block = marks.block('body');
  const failures = [];
  if (plan.scope.length > MAX_SCOPE_LINES) failures.push({ code: 'scope', message: `${plan.scope.length} Scope lines; at most ${MAX_SCOPE_LINES}` });
  const { issue } = await findIssue(ctx, { marker: marks.scope(), known: [plan.scopeIssue] });
  if (!issue) {
    failures.push({ code: 'scope', message: 'no Scope issue carries the run\'s scope marker (run delivery scope post)' });
    return gateResult(failures);
  }
  if (plan.scopeIssue !== issue.number) failures.push({ code: 'scope', message: `plan.json records Scope issue #${plan.scopeIssue ?? 'none'}, the marked one is #${issue.number}` });
  if (!plan.scopeSnapshot) {
    failures.push({ code: 'scope', message: 'plan.scopeSnapshot is not set (run delivery scope post)' });
    return gateResult(failures);
  }
  const stored = decodeSnapshot(issue.body, block);
  if (!stored) failures.push({ code: 'scope', message: `Scope issue #${issue.number} holds no snapshot (run delivery scope post --resnapshot)` });
  else if (snapshotHash(stored.classes) !== plan.scopeSnapshot) failures.push({ code: 'scope', message: `Scope issue #${issue.number}'s snapshot does not match plan.scopeSnapshot` });
  const content = renderScopeContent({ plan, epic: plan.epic, feature: paths.feature, snap: stored });
  if (stored && !blockCurrent(issue.body, block, content)) failures.push({ code: 'scope', message: `Scope issue #${issue.number} does not show the plan's current Scope lines (run delivery scope post)` });
  return gateResult(failures, failures.some((f) => /snapshot does not match/.test(f.message)) ? EXIT.INCONSISTENT : undefined);
}

/**
 * Rows whose class differs from the Scope snapshot: the late changes (spec 10.4), listed first in
 * the report, the PR body and ready.json. A row added after the snapshot counts only when it is a
 * cut or a remove; a row that left the plan counts always.
 * Called by ready (A1), report (C) and pr-body (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ row: string, from: string, to: string, scopeLine: string|null }[]>}
 */
export async function lateChanges(ctx) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readPlan(paths);
  if (!plan.scopeSnapshot) return [];
  const marks = runMarkers(profile, paths.feature);
  const { issue } = await findIssue(ctx, { marker: marks.scope(), known: [plan.scopeIssue] });
  const stored = issue ? decodeSnapshot(issue.body, marks.block('body')) : null;
  if (!stored || snapshotHash(stored.classes) !== plan.scopeSnapshot) {
    throw new InconsistencyError(`the Scope snapshot plan.json records (${plan.scopeSnapshot.slice(0, 12)}) is not the one the Scope issue holds, so late changes cannot be computed`, { code: 'scope' });
  }
  return diffClasses(stored.classes, plan);
}

/** Pure part of lateChanges. */
export function diffClasses(classes, plan) {
  const lineFor = (id) => plan.rows.find((r) => r.id === id)?.scopeLine ?? plan.scope.find((s) => s.rows.includes(id))?.line ?? null;
  const out = [];
  const current = new Map(plan.rows.map((r) => [r.id, r.class]));
  for (const [id, to] of current) {
    const from = classes[id];
    if (from === undefined) {
      if (to === 'cut' || to === 'remove') out.push({ row: id, from: 'absent', to, scopeLine: lineFor(id) });
    } else if (from !== to) out.push({ row: id, from, to, scopeLine: lineFor(id) });
  }
  for (const [id, from] of Object.entries(classes)) {
    if (!current.has(id)) out.push({ row: id, from, to: 'absent', scopeLine: null });
  }
  return out.sort((a, b) => a.row.localeCompare(b.row));
}

/** One line per late change, for the PR body and the report. */
export function describeLateChange(c) {
  return `${c.row}: ${c.from} → ${c.to}${c.scopeLine ? ` (Scope line ${c.scopeLine})` : ' (no Scope line yet)'}`;
}

