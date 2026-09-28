// delivery retro, end to end: record the run (C1), check what earlier automatic changes did (C4),
// find what repeats (C2), apply what is small and write down what is large (C3).
// Owner: slice A2 (docs/ARCHITECTURE.md).
//
// The retro runs in the delivery session only (land, or NEXT after ready goes green). It writes the
// runs ledger, the run's own steers.md and proposals/, and the plugin checkout through PRs; it
// never schedules itself, never touches production, never seeds, dials or opens a database.
// Nothing large is ever applied.

import { join, relative } from 'node:path';
import { buildRecord } from './record.mjs';
import { ledgerPath, readLedger, writeRecord } from './ledger.mjs';
import { compare, proposalsFromInput } from './compare.mjs';
import { classify } from './size.mjs';
import { assessChanges } from './check.mjs';
import { applyChange, revertChange, writeProposal, writeSteer, removeSteer, resolveCheckout, checkoutSlug, pluginGh, describeChange } from './apply.mjs';

const KINDS = ['tunable', 'steer', 'brief-sentence', 'warn-check'];

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx  aimed at the run (withRun for a land from another worktree)
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {{ dryRun?: boolean, ciFailures?: object[], propose?: unknown, gh?: object }} [opts]
 *   propose: proposals handed in by the session (parsed JSON); gh: the plugin repo's GitHub (tests)
 */
export async function runRetro(ctx, paths, opts = {}) {
  const file = ledgerPath(paths);
  const all = await readLedger(file);
  const previous = all.find((r) => r.feature === paths.feature) ?? null;
  const record = await buildRecord(ctx, paths, { previous, ciFailures: opts.ciFailures });
  const others = all.filter((r) => r.feature !== paths.feature);
  const res = { record, ledger: relative(paths.repoRoot, file), wrote: !opts.dryRun, changed: [], reverted: [], checked: [], needsYou: [], notes: [] };
  const dry = Boolean(opts.dryRun);

  const profile = await ctx.profile().catch(() => null);
  const checkout = resolveCheckout(ctx, profile);
  let slug = ctx.env?.DELIVERY_PLUGIN_GH || profile?.retro?.pluginRepoSlug || null;
  if (!checkout.reason && !slug && !dry) slug = await checkoutSlug(ctx, checkout).catch(() => null);
  if (!checkout.reason) checkout.slug = slug;
  const gh = pluginGh(ctx, opts, slug);
  const touched = new Set();
  const now = ctx.clock.now().toISOString();

  // C4: judge the earlier automatic changes; undo one that got worse in two runs in a row.
  const { updates, reverts } = assessChanges([...others, record], paths.feature);
  const byFeature = (f) => (f === record.feature ? record : others.find((r) => r.feature === f));
  for (const u of updates) {
    const entry = byFeature(u.feature).autoChanges.find((e) => e.id === u.id);
    if (entry.status !== u.status || entry.measured?.length !== u.measured.length) touched.add(u.feature);
    if (!dry) Object.assign(entry, { status: u.status, measured: u.measured });
    res.checked.push(`${u.id}: ${u.status} (${entry.metric.name} ${u.measured.map((m) => m.value).join(', ')} after baseline ${entry.metric.baseline})`);
  }
  for (const { feature, entry: seen } of reverts) {
    const entry = byFeature(feature).autoChanges.find((e) => e.id === seen.id);
    const why = `${entry.metric.name} was worse than ${entry.metric.baseline} in the last two runs (${seen.measured.slice(-2).map((m) => m.value).join(', ')})`;
    if (dry) { res.reverted.push(`(dry run) ${entry.id}: would be reverted; ${why}`); continue; }
    if (entry.kind === 'steer') {
      const done = entry.file ? removeSteer(join(paths.repoRoot, entry.file), entry.change.text) : false;
      if (done) Object.assign(entry, { status: 'reverted', measured: seen.measured });
      (done ? res.reverted : res.needsYou).push(done ? `${entry.id}: steer taken out of ${entry.file}; ${why}` : `${entry.id}: ${why}; take the steer out by hand`);
      if (done) touched.add(feature);
      continue;
    }
    const out = await revertChange(ctx, { entry, feature: paths.feature, checkout, gh });
    if (out.status === 'reverted') {
      Object.assign(entry, { status: 'reverted', revertPr: out.revertPr, measured: seen.measured });
      touched.add(feature);
      res.reverted.push(`${entry.id}: reverted in PR #${out.revertPr}; ${why}`);
    } else {
      res.needsYou.push(`${entry.id}: ${why}; it was not reverted (${out.reason}), so revert PR #${entry.pr ?? '?'} by hand`);
    }
  }

  // Proposals still open from an earlier retro of this run stay in "Needs you".
  for (const e of previous?.autoChanges ?? []) if (e.status === 'proposed') res.needsYou.push(needsLine(e, e.file, e.issue));

  // C2: what repeats. C3: apply the small, write down the large.
  const history = [...others, record].flatMap((r) => r.autoChanges ?? []);
  const fresh = compare(others, record, { history });
  if (opts.propose !== undefined) {
    for (const p of proposalsFromInput(opts.propose)) {
      if (history.some((h) => h.id === p.id) || fresh.some((f) => f.id === p.id)) res.notes.push(`${p.id}: already in the ledger, left as it is`);
      else fresh.push(p);
    }
  }
  for (const p of fresh) {
    const { size, reasons } = classify(p.change, null, { history });
    const entry = { id: p.id, at: now, kind: KINDS.includes(p.change.kind) ? p.change.kind : 'other', change: p.change, size, status: 'proposed', metric: p.metric, measured: [] };
    if (dry) { res.needsYou.push(`(dry run) ${p.id}: ${size}, would be ${size === 'small' ? 'applied' : 'proposed'}: ${describeChange(p.change)}`); continue; }

    if (size === 'small' && p.change.kind === 'steer') {
      entry.file = writeSteer(paths, p.change.text);
      entry.status = 'applied';
      res.changed.push(`${p.id}: steer added to ${entry.file}: ${p.change.text}`);
    } else if (size === 'small') {
      const out = await applyChange(ctx, { proposal: p, feature: paths.feature, checkout, gh, history });
      if (out.status === 'applied') {
        Object.assign(entry, { status: 'applied', pr: out.pr, mergeSha: out.mergeSha });
        res.changed.push(`${p.id}: ${describeChange(p.change)} (PR #${out.pr}); judged by ${p.metric.name}, baseline ${p.metric.baseline ?? 'unknown'}`);
      } else {
        // Could not be applied on its own: it becomes a proposal. A change that turned out large is filed like one.
        if (out.large) entry.size = 'large';
        const w = await writeProposal(ctx, paths, p, { size: entry.size, reasons: [out.reason], gh, file: Boolean(out.large) });
        Object.assign(entry, { file: w.file, issue: w.issue, note: out.reason, ...(out.pr ? { pr: out.pr } : {}) });
        res.needsYou.push(needsLine(entry, w.file, w.issue, w.note ?? out.reason));
      }
    } else {
      const w = await writeProposal(ctx, paths, p, { size, reasons, gh });
      Object.assign(entry, { file: w.file, issue: w.issue });
      res.needsYou.push(needsLine(entry, w.file, w.issue, w.note));
    }
    record.autoChanges.push(entry);
    history.push(entry);
    touched.add(record.feature);
  }

  if (!dry) {
    for (const f of touched) if (f !== record.feature) await writeRecord(file, byFeature(f));
    await writeRecord(file, record);
  }
  return res;
}

function needsLine(entry, file, issue, note) {
  return `${entry.id}: ${describeChange(entry.change)}${file ? ` (${file}${issue ? `, issue #${issue}` : ''})` : ''}${note ? `; ${note}` : ''}`;
}

/** The report lines of a retro. */
export function reportLines(res) {
  const lines = [`retro ${res.record.feature}: ${res.wrote ? `recorded in ${res.ledger} (commit it with the run)` : 'dry run, nothing written'}`];
  if (res.checked.length) lines.push('Earlier changes checked:', ...res.checked.map((c) => `  ${c}`));
  lines.push('Changed automatically:');
  lines.push(...(res.changed.length ? res.changed.map((c) => `  ${c}`) : ['  none']));
  lines.push('Reverted:');
  lines.push(...(res.reverted.length ? res.reverted.map((c) => `  ${c}`) : ['  none']));
  lines.push('Needs you:');
  lines.push(...(res.needsYou.length ? res.needsYou.map((c) => `  ${c}`) : ['  nothing']));
  if (res.notes.length) lines.push('Notes:', ...res.notes.map((c) => `  ${c}`));
  return lines;
}
