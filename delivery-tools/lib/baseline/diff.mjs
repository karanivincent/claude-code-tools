// The capability diff, M2 (spec 5.3). Owner: slice B2 (docs/ARCHITECTURE.md).
//
// lost = base signatures - head signatures, then per plan row:
//   route, control, api-call, data-field   lost must be exactly the remove rows: a lost keep,
//       change or unclassed capability is P1; a remove row still present is P1; a migrate row
//       must be found at its migrateTo file (a route row: that file names migrateTo.control).
//   e2e-assertion   a base test is carried when the same test, or the one its row's e2eMap names,
//       still asserts every test id, text and value it asserted; otherwise P1 (a title that
//       survived with different assertions is "rewritten"; one that moved under a new title
//       without a mapping is P2 until the plan maps it).
//   copy-key        a base key still rendered must belong to a keep or migrate row (P2
//       otherwise: a retired line still showing); a keep row's key that vanished is P2.
//   open-issue      informational; M1 gives each a row, M2 does not diff them.

import { makeFinding } from '../core/findings.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { extractAtRef } from './extract.mjs';

export const M2_SOURCE = 'check:M2';

/**
 * M2 as findings: lost = old signatures minus new ones must equal the remove rows exactly; every
 * migrate found at its migrateTo; every base e2e assertion present, mapped (e2eMap) or removed;
 * every old copy key still rendered belongs to a keep or migrate row. P1 per lost capability.
 * Extracts at `against` (default HEAD) into baseline-head.json first.
 * Called by check M2 (B1) and ready (A1, through runChecks).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ against?: string }} [opts]
 * @returns {Promise<import('../core/findings.mjs').Finding[]>}
 */
export async function checkM2(ctx, opts = {}) {
  return (await runM2(ctx, opts)).findings;
}

/** checkM2 with what it compared, for the baseline command's report. */
export async function runM2(ctx, opts = {}) {
  const paths = ctx.requirePaths();
  const intent = await readArtefact(paths, 'intent');
  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  if (!baseline) {
    if (!intent.redesign) return { findings: [], notes: ['not a redesign: M2 has no baseline to compare'], head: null };
    return { findings: [missingBaselineFinding()], notes: [], head: null };
  }
  const profile = await ctx.profile();
  const against = opts.against ?? 'HEAD';
  const head = await extractAtRef(ctx, { ref: against, profile, intent, captureDir: null });
  await writeArtefact(paths, 'baseline-head', {
    schemaVersion: 1,
    base: { ref: against, sha: head.sha },
    capabilities: numberForHead(head.capabilities),
    refreshes: [],
  });
  // the base's e2e details, re-read at every sha the baseline took capabilities from
  const baseE2e = new Map();
  for (const sha of [baseline.base.sha, ...baseline.refreshes.map((r) => r.sha)]) {
    const b = await extractAtRef(ctx, { ref: sha, profile, intent, captureDir: null });
    for (const [sig, d] of b.e2e) if (!baseE2e.has(sig)) baseE2e.set(sig, d);
  }
  // A capability the base branch itself dropped after the run began is not this branch's loss.
  const notes = [...head.notes];
  const goneOnBase = new Set();
  const mergeBase = await ctx.git.mergeBase(head.sha, `origin/${profile.repo.base}`);
  if (mergeBase && mergeBase !== baseline.base.sha && !baseline.refreshes.some((r) => r.sha === mergeBase)) {
    const m = await extractAtRef(ctx, { ref: mergeBase, profile, intent, captureDir: null });
    const still = new Set(m.capabilities.map((c) => c.signature));
    for (const c of baseline.capabilities) if (!still.has(c.signature)) goneOnBase.add(c.signature);
    if (goneOnBase.size) notes.push(`${goneOnBase.size} capabilit(ies) left ${profile.repo.base} itself after the run began; not counted against this branch`);
  }
  const plan = await readArtefact(paths, 'plan', { optional: true });
  const headTexts = await head.reader.read(migrateFiles(plan));
  const findings = diffCapabilities({
    baseline, head: { capabilities: head.capabilities, e2e: head.e2e, files: new Set(head.allFiles), texts: headTexts },
    baseE2e, plan, headRef: `${against}@${head.sha.slice(0, 9)}`, goneOnBase,
  });
  return { findings, notes, head };
}

function missingBaselineFinding() {
  return makeFinding({
    source: M2_SOURCE, rule: 'no-baseline', severity: 'P1', state: 'baseline', where: 'baseline.json',
    design: '', live: 'this is a redesign and there is no baseline.json, so nothing proves what the old page could do is kept',
    evidence: 'code-read',
  });
}

function numberForHead(caps) {
  return [...caps]
    .sort((a, b) => (a.signature < b.signature ? -1 : 1))
    .slice(0, 999)
    .map((c, i) => ({ id: `CAP-${String(i + 1).padStart(3, '0')}`, kind: c.kind, signature: c.signature, screen: c.screen ?? '', evidence: c.evidence }));
}

function migrateFiles(plan) {
  return [...new Set((plan?.rows ?? []).filter((r) => r.class === 'migrate' && r.migrateTo?.file).map((r) => r.migrateTo.file))];
}

const FUNCTIONAL = new Set(['route', 'control', 'api-call', 'data-field']);

/**
 * Pure M2.
 * @param {{
 *   baseline: object,
 *   head: { capabilities: object[], e2e: Map<string, { assertions: string[], file: string, line: number, title: string }>, files: Set<string>, texts: Map<string, string> },
 *   baseE2e: Map<string, { assertions: string[], file: string, line: number, title: string }>,
 *   plan: object|null, headRef: string, goneOnBase?: Set<string>,
 * }} input  goneOnBase: signatures the base branch itself no longer has
 * @returns {import('../core/findings.mjs').Finding[]}
 */
export function diffCapabilities({ baseline, head, baseE2e, plan, headRef, goneOnBase = new Set() }) {
  const rows = new Map((plan?.rows ?? []).map((r) => [r.id, r]));
  const headBySig = new Map(head.capabilities.map((c) => [c.signature, c]));
  const headHasControls = head.capabilities.some((c) => c.kind === 'control');
  const out = [];
  const finding = (cap, rule, severity, live, cause) => out.push(makeFinding({
    source: M2_SOURCE, rule, severity, state: cap.id, group: cap.screen ?? '', where: cap.signature,
    design: '', live, cause: cause ?? evidenceText(cap), evidence: 'code-read',
  }));

  for (const cap of baseline.capabilities) {
    const row = rows.get(cap.id);
    const cls = row?.class ?? null;
    const at = headBySig.get(cap.signature);
    const classText = cls ? `its row is ${cls}` : 'it has no plan row';
    if (cap.kind === 'open-issue') continue;
    if (cap.kind === 'control' && !headHasControls) continue; // nothing captured at head to compare with
    if (!at && goneOnBase.has(cap.signature)) continue;

    if (FUNCTIONAL.has(cap.kind)) {
      if (cls === 'remove') {
        if (at) finding(cap, 'remove-still-present', 'P1', `marked remove, but ${headRef} still has it (${evidenceText(at)})`);
        continue;
      }
      if (cls === 'migrate') {
        const to = row.migrateTo;
        if (!to) {
          finding(cap, at ? 'migrate-no-target' : 'lost', at ? 'P2' : 'P1',
            at ? `a migrate row with no migrateTo; the capability is at ${evidenceText(at)}` : `lost at ${headRef}: a migrate row with no migrateTo, and the capability is nowhere`);
          continue;
        }
        if (cap.kind === 'route') {
          const text = head.texts.get(to.file);
          if (!head.files.has(to.file) || text === undefined) finding(cap, 'migrate-missing', 'P1', `migrates to ${to.file}, which ${headRef} does not have`);
          else if (!text.includes(to.control)) finding(cap, 'migrate-missing', 'P1', `migrates to "${to.control}" in ${to.file}, which that file does not name`);
          continue;
        }
        if (!at) finding(cap, 'lost', 'P1', `lost at ${headRef}: the plan migrates it to ${to.file} (${to.control}), and nothing there or anywhere carries it`);
        else if (!at.evidence.some((e) => e.file === to.file)) finding(cap, 'migrated-elsewhere', 'P2', `kept, but at ${evidenceText(at)}, not at ${to.file} as the plan says`);
        continue;
      }
      if (!at) finding(cap, 'lost', 'P1', `lost at ${headRef}; ${classText}${cls === 'keep' || cls === 'change' ? '' : ' (only a remove row may drop it, through a Scope line)'}`);
      continue;
    }

    if (cap.kind === 'copy-key') {
      if (at && cls !== 'keep' && cls !== 'migrate') {
        finding(cap, 'retired-copy-rendered', 'P2', `still rendered at ${evidenceText(at)}, but ${classText}; an old line showing on the new page needs a keep or migrate row`);
      } else if (!at && cls === 'keep') {
        finding(cap, 'kept-copy-gone', 'P2', `its row is keep, but nothing at ${headRef} renders it`);
      }
      continue;
    }

    if (cap.kind === 'e2e-assertion') {
      if (cls === 'remove') continue;
      const old = baseE2e.get(cap.signature);
      const oldSet = new Set(old?.assertions ?? []);
      const carries = (h) => h && [...oldSet].every((x) => h.assertions.includes(x));
      const same = head.e2e.get(cap.signature);
      if (same) {
        if (!carries(same)) {
          const missing = [...oldSet].filter((x) => !same.assertions.includes(x));
          finding(cap, 'e2e-rewritten', 'P1', `the title survives at ${headRef} but its assertions changed: it no longer asserts ${missing.join(', ')}`);
        }
        continue;
      }
      const mapped = (row?.e2eMap ?? []).filter((m) => sameTest(m.baseTest, cap.signature, old?.title));
      if (mapped.length) {
        const targets = mapped.map((m) => findHeadTest(head.e2e, m.branchTest)).filter(Boolean);
        if (!targets.length) finding(cap, 'e2e-mapped-missing', 'P1', `e2eMap names ${mapped.map((m) => `"${m.branchTest}"`).join(', ')}, which ${headRef} does not have`);
        else if (!targets.some(carries)) finding(cap, 'e2e-mapped-mismatch', 'P1', `the mapped test does not assert ${[...oldSet].filter((x) => !targets.some((t) => t.assertions.includes(x))).join(', ')}`);
        continue;
      }
      const sameFile = [...head.e2e.values()].filter((h) => old && h.file === old.file);
      const carrier = sameFile.find(carries);
      if (carrier && oldSet.size) {
        finding(cap, 'e2e-unmapped', 'P2', `carried by "${carrier.title}" at ${headRef}, but the plan has no e2eMap naming both titles`);
        continue;
      }
      const nearest = nearestTest(old, sameFile);
      const asserted = [...oldSet].join(', ') || 'nothing it could read';
      finding(cap, 'e2e-not-carried', 'P1',
        nearest
          ? `not carried at ${headRef}: it asserted ${asserted}; its likely rewrite "${nearest.title}" asserts ${nearest.assertions.join(', ') || 'nothing readable'} instead`
          : `not carried at ${headRef}: it asserted ${asserted}, and nothing asserts that now`);
    }
  }

  // nothing marked remove that has no base capability, and no remove row for a capability still there
  for (const row of plan?.rows ?? []) {
    if (row.class !== 'remove' || !/^CAP-\d{3}$/.test(row.id)) continue;
    if (!baseline.capabilities.some((c) => c.id === row.id)) {
      out.push(makeFinding({ source: M2_SOURCE, rule: 'remove-unknown', severity: 'P2', state: row.id, where: row.id, design: '', live: `a remove row for ${row.id}, which the baseline does not list`, evidence: 'code-read' }));
    }
  }
  return out;
}

function evidenceText(cap) {
  return (cap?.evidence ?? []).slice(0, 2).map((e) => `${e.file}:${e.line}`).join(', ');
}

function sameTest(named, signature, title) {
  const n = String(named);
  return n === signature || n === title || signature.endsWith(`#${n}`);
}

function findHeadTest(e2e, named) {
  for (const [sig, t] of e2e) if (sig === named || t.title === named || sig.endsWith(`#${named}`)) return t;
  return null;
}

/** The head test in the same file most like the base one, by shared title words. */
function nearestTest(old, candidates) {
  if (!old || !candidates.length) return null;
  const words = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const a = words(old.title);
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const b = words(c.title);
    const shared = [...a].filter((w) => b.has(w)).length;
    const score = shared / Math.max(1, Math.min(a.size, b.size));
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return bestScore >= 0.3 ? best : null;
}
