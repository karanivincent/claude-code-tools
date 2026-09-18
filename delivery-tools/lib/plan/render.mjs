// spec.md rendering (spec 4.3: the plan is the spec). Owner: slice B1 (docs/ARCHITECTURE.md).
// Pure and deterministic: the same plan gives the same bytes, so issues sync can update the epic's
// spec comment only when something changed, and plan render --check can tell a stale spec.md.

import { BUILD_CLASSES } from './check.mjs';

const cell = (v) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
const code = (v) => (v === null || v === undefined || v === '' ? '—' : `\`${String(v).replace(/`/g, "'")}\``);
const quote = (v) => `"${String(v).replace(/\r?\n/g, ' ')}"`;

function table(head, rows) {
  if (!rows.length) return ['_None._'];
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)];
}

function step(s) {
  if ('goto' in s) return `go to ${code(s.goto)}`;
  if ('click' in s) {
    const c = s.click;
    return `click ${c.testid ? code(c.testid) : `${c.role ?? 'element'}${c.name ? ` ${quote(c.name)}` : ''}`}`;
  }
  if ('type' in s) return `type ${quote(s.type.text)} into ${code(s.type.testid)}`;
  if ('select' in s) return `select ${quote(s.select.value)} in ${code(s.select.testid)}`;
  if ('press' in s) return `press ${s.press}`;
  if ('waitFor' in s) return `wait for ${s.waitFor.testid ? code(s.waitFor.testid) : quote(s.waitFor.text)}`;
  return JSON.stringify(s);
}

function rowLines(r) {
  const out = [];
  const title = `#### ${r.id} · ${r.class}${r.owner ? ` · ${r.owner}` : ''}${r.invented ? ' · invented' : ''}`;
  out.push(title, '');
  const facts = [];
  if (r.requested) facts.push(`Requested in design round item ${r.requested}.`);
  if (r.reason) facts.push(`Reason: ${r.reason.code}, ${r.reason.text}.`);
  if (r.issue) facts.push(`Issue #${r.issue}.`);
  if (r.scopeLine) facts.push(`Scope line ${r.scopeLine}.`);
  if (r.route) facts.push(`Route ${code(r.route)}.`);
  if (r.component) facts.push(`Component ${code(r.component)}.`);
  if (r.migrateTo) facts.push(`Migrates to ${code(r.migrateTo.file)}, control ${quote(r.migrateTo.control)}.`);
  if (r.adapt) facts.push(`Adapted (${r.adapt.rule}): the design's ${quote(r.adapt.designText)} becomes ${quote(r.adapt.productText)}.`);
  if (r.dayOne) facts.push('Day-one state: its findings are raised one level.');
  if (facts.length) out.push(...facts.map((f) => `- ${f}`), '');

  if (r.reach) {
    const x = r.reach;
    let line = `**Reach.** ${x.class}, world ${code(x.world)}, as ${x.role}`;
    if ((x.steps ?? []).length) line += `: ${x.steps.map(step).join(' → ')}`;
    line += '.';
    out.push(line);
    if (x.intercept) out.push(`Intercept: ${x.intercept.method} ${code(x.intercept.url)} answers ${x.intercept.status}${x.intercept.timeoutMs ? ` after ${x.intercept.timeoutMs} ms` : ''}.`);
    if (x.test) out.push(`Component test: ${code(x.test.file)} › ${quote(x.test.name)}.`);
    if (x.why) out.push(`Not seedable: ${x.why}.`);
    out.push('');
  }
  if (r.markers) {
    const m = r.markers;
    out.push(`**Markers.** Text: ${(m.text ?? []).map(quote).join(', ') || '—'}. Test ids: ${(m.testids ?? []).map(code).join(', ') || '—'}. Must not show: ${(m.forbidden ?? []).map(quote).join(', ') || '—'}.${m.sameAs ? ` Same as ${m.sameAs.state}: ${m.sameAs.why}.` : ''}`, '');
  }
  if ((r.controls ?? []).length) {
    out.push('**Controls.**', '', ...table(['Label', 'Test id', 'Effect', 'Leads to', 'Enabled when'],
      r.controls.map((c) => [c.label, c.testid, c.effect, c.target, c.enabledWhen ?? 'always'])), '');
  }
  if (r.permission) out.push(`**Member.** Controls are ${r.permission.member} for a member.`, '');
  if ((r.copy ?? []).length) {
    out.push('**Copy.**', '', ...table(['Key', 'English', 'Plural'], r.copy.map((c) => [c.key, c.en, c.plural ? 'yes' : 'no'])), '');
  }
  if ((r.data ?? []).length || (r.backend ?? []).length) {
    const lines = [
      ...(r.data ?? []).map((d) => `${code(`${d.table}.${d.column}`)} ${d.exists ? 'exists' : '**missing**'} (verified by ${d.verifiedBy})`),
      ...(r.backend ?? []).map((b) => `${b.method} ${code(b.route)}${b.discriminator ? ` ${code(b.discriminator)}` : ''} ${b.exists ? 'exists' : `**missing**${b.unit ? `, built by ${b.unit}` : ''}`} (verified by ${b.verifiedBy})`),
    ];
    out.push('**Data and backend.**', '', ...lines.map((l) => `- ${l}`), '');
  }
  if ((r.invariants ?? []).length) out.push('**Invariants.**', '', ...r.invariants.map((i) => `- ${i}`), '');
  if ((r.e2eMap ?? []).length) out.push('**Carried e2e assertions.**', '', ...r.e2eMap.map((e) => `- ${quote(e.baseTest)} → ${quote(e.branchTest)}`), '');
  return out;
}

/**
 * Render spec.md from plan.json; deterministic (same plan, same bytes).
 * Called by issues sync (A2), which posts it to the epic as one comment.
 * @param {object} plan a plan.json value (schemas/plan.schema.json)
 * @returns {string} markdown
 */
export function renderSpec(plan) {
  const rows = plan.rows ?? [];
  const units = plan.units ?? [];
  const count = (pred) => rows.filter(pred).length;
  const out = [];
  out.push(`# ${plan.feature}: the build spec`, '');
  out.push('Rendered from `plan.json` by `delivery plan render`. Edit the plan, never this file.', '');
  out.push(`Epic #${plan.epic}. Scope issue: ${plan.scopeIssue ? `#${plan.scopeIssue}` : 'not posted yet'}. Scope snapshot: ${plan.scopeSnapshot ? code(plan.scopeSnapshot.slice(0, 12)) : 'none yet'}.`, '');

  out.push('## Coverage', '');
  out.push(...table(['Class', 'Rows'], ['new', 'change', 'keep', 'migrate', 'adapt', 'remove', 'cut'].map((c) => [c, String(count((r) => r.class === c))])), '');
  out.push(`${count((r) => BUILD_CLASSES.has(r.class))} rows built, ${count((r) => r.class === 'cut')} cut, ${count((r) => r.class === 'adapt')} adapted, ${count((r) => r.invented)} invented, ${count((r) => r.class === 'remove')} removed.`, '');

  out.push('## Units', '');
  const byWave = [...units].sort((a, b) => a.wave - b.wave);
  out.push(...table(['Wave', 'Unit', 'Kind', 'Title', 'Issue', 'Model', 'Risk', 'Rows', 'Files'],
    byWave.map((u) => [String(u.wave), u.id, u.kind, u.title, u.issue ? `#${u.issue}` : '—', u.model, u.risk,
      [...(u.states ?? []), ...(u.capabilities ?? [])].join(', '), (u.files ?? []).join(', ')])), '');

  out.push('## Contracts', '');
  out.push(...table(['Contract', 'File', 'Stub', 'Consumers'], (plan.contracts ?? []).map((c) => [c.id, c.file, c.stub, (c.consumers ?? []).join(', ')])), '');

  out.push('## Fixture worlds', '');
  out.push(...table(['World', 'Kind', 'Organisation', 'Users', 'Notes'],
    (plan.worlds ?? []).map((w) => [w.id, w.kind, w.orgName, (w.users ?? []).map((u) => `${u.role} ${u.email}`).join(', '), w.notes])), '');
  if ((plan.seed?.globalRows ?? []).length) {
    out.push('Rows outside any world:', '', ...plan.seed.globalRows.map((g) => `- ${code(g.table)}: ${g.why}`), '');
  }

  out.push('## Scope lines', '');
  if ((plan.scope ?? []).length) {
    for (const s of plan.scope) {
      out.push(`- ${s.line} · ${s.text} Default: ${s.default}. Applies at wave ${s.appliesAtWave}.${s.reply ? ` Reply: ${quote(s.reply)}.` : ''} Rows: ${s.rows.join(', ')}.`);
    }
    out.push('');
  } else out.push('_None._', '');

  out.push('## Rows, by owning unit', '');
  const seen = new Set();
  for (const u of units) {
    const own = rows.filter((r) => r.owner === u.id);
    if (!own.length) continue;
    out.push(`### ${u.id}: ${u.title}`, '');
    for (const r of own) { seen.add(r); out.push(...rowLines(r)); }
  }
  const rest = rows.filter((r) => !seen.has(r));
  if (rest.length) {
    out.push('### Not built, or not owned', '');
    for (const r of rest) out.push(...rowLines(r));
  }
  while (out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}
