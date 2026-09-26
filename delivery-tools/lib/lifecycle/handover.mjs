// The integration branch's one handover (spec 4.4 step 2, 11.5). The main session writes the
// prose; `delivery handover` regenerates the sections between markers: Verification performed,
// in the past tense, from the journal; Migrations, from the branch's own diff; Known limitations,
// as prose (never checkboxes), from the findings, the plan, ready.json and the waivers.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEvent } from '../core/state.mjs';
import { upsertBlock } from '../core/markers.mjs';
import { readFindings } from '../core/findings.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { writeFileAtomic, exists } from '../core/fs.mjs';
import { isoDate } from '../core/clock.mjs';
import { runMarkers, readState, readPlan, clip, matchesAny } from './run-info.mjs';

/** A regexp for the profile's handover pattern with the date free and the slug fixed. */
export function handoverPathRegExp(pattern, feature) {
  let re = '';
  for (const part of String(pattern).split(/(\{date\}|\{slug\})/)) {
    if (part === '{date}') re += '\\d{4}-\\d{2}-\\d{2}';
    else if (part === '{slug}') re += feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else re += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** The handover path for a date: the profile's pattern filled. */
export function handoverPathFor(pattern, { date, feature }) {
  return String(pattern).replace(/\{date\}/g, date).replace(/\{slug\}/g, feature);
}

/**
 * The branch's handover, repo-relative: one added on this branch since it left origin/<base>
 * (committed), else (unless committedOnly) one in the working tree that the base does not have.
 * @returns {Promise<string|null>}
 */
export async function findHandover(ctx, { profile, feature, committedOnly = false }) {
  const re = handoverPathRegExp(profile.decisions.handoverPattern, feature);
  const base = `origin/${profile.repo.base}`;
  const mb = await ctx.git.mergeBase(base, 'HEAD');
  if (mb) {
    const r = await ctx.git.raw(['diff', '--name-only', '--diff-filter=A', mb, 'HEAD', '--', profile.paths.handovers]);
    const added = String(r.stdout ?? '').split('\n').filter((p) => re.test(p)).sort();
    if (added.length) return added[0];
  }
  if (committedOnly) return null;
  const dir = join(ctx.repoRoot, profile.paths.handovers);
  let names = [];
  try { names = await readdir(dir); } catch { return null; }
  let merged = null;
  for (const name of names.sort()) {
    const rel = `${profile.paths.handovers.replace(/\/$/, '')}/${name}`;
    if (!re.test(rel)) continue;
    if (!mb || !(await ctx.git.show(base, rel))) return rel;
    merged ??= rel;
  }
  // After the merge (land), the run's handover is on the base branch; it is still the run's file.
  return merged;
}

/**
 * "Verification performed" from the journal: the last result of each distinct command, in the
 * order they last ran, in the past tense. Pure.
 * @param {{ at: string, event: string }[]} journal
 */
export function verificationLines(journal) {
  const last = new Map();
  for (const e of journal ?? []) {
    const ev = parseEvent(e.event);
    if (ev.command === 'genesis' || ev.exit === null) continue;
    const prev = last.get(ev.command);
    last.set(ev.command, { ...ev, at: e.at, runs: (prev?.runs ?? 0) + 1 });
  }
  const rows = [...last.values()].sort((a, b) => a.at.localeCompare(b.at));
  return rows.map((r) => {
    const counts = Object.entries(r.counts).map(([k, v]) => `${k}=${v}`).join(', ');
    const when = r.at.replace('T', ' ').replace(/:\d{2}(\.\d+)?Z$/, ' UTC');
    return `- \`delivery ${r.command}\` exited ${r.exit}${counts ? ` (${counts})` : ''}, last run ${when}${r.runs > 1 ? `, ${r.runs} runs in all` : ''}.`;
  });
}

/** Files this branch added or changed that look like migrations. */
export function migrationFiles(changed, sqlGlobs = []) {
  return changed.filter((p) => (sqlGlobs.length && matchesAny(p, sqlGlobs)) || /(^|\/)migrations?\/.+\.sql$/.test(p)).sort();
}

/** The three generated sections' content. Pure. */
export function handoverSections({ journal, migrations, findingsDoc, plan, ready, waivers }) {
  const verification = ['## Verification performed', ''];
  const vlines = verificationLines(journal);
  verification.push(...(vlines.length ? vlines : ['No delivery command has recorded a result yet.']));

  const mig = ['## Migrations', ''];
  if (migrations.length) mig.push('Added or changed on this branch:', '', ...migrations.map((m) => `- \`${m}\``));
  else mig.push('None on this branch.');

  const lim = ['## Known limitations', ''];
  const items = [];
  for (const f of (findingsDoc?.findings ?? []).filter((x) => x.status === 'accepted')) {
    items.push(`- ${f.state} (${f.severity}) differs from the design at \`${f.where}\` and was accepted as ${f.accept?.reasonClass ?? 'unknown'}${f.accept?.issue ? `, tracked in #${f.accept.issue}` : ''}: ${clip(f.accept?.text ?? f.live, 200)}`);
  }
  for (const r of (plan?.rows ?? []).filter((x) => x.class === 'cut')) {
    items.push(`- ${r.id} was not built (cut, ${r.reason?.code ?? 'no reason'}: ${clip(r.reason?.text ?? '', 160)})${r.issue ? `; its follow-up is #${r.issue}` : ''}.`);
  }
  for (const o of ready?.owedAfterMerge ?? []) items.push(`- Owed after the merge, by the suite: ${o}.`);
  for (const w of waivers ?? []) items.push(`- Preflight probe ${w.probe} was waived by the founder: ${clip(w.note, 200)}.`);
  lim.push(...(items.length ? items : ['None recorded.']));

  return { verification: verification.join('\n'), migrations: mig.join('\n'), limitations: lim.join('\n') };
}

/**
 * Regenerate the handover's sections. Creates the file (from the profile's pattern and today's
 * date) when the branch has none yet. Returns the path and the text.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ print?: boolean }} [o]
 */
export async function writeHandover(ctx, { print = false } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const feature = paths.feature;
  const state = await readState(paths);
  const plan = await readPlan(paths, { optional: true });
  const findingsDoc = await readFindings(paths, state?.runId ?? 'unknown').catch(() => null);
  const ready = await readArtefact(paths, 'ready', { optional: true }).catch(() => null);

  const base = `origin/${profile.repo.base}`;
  const mb = await ctx.git.mergeBase(base, 'HEAD');
  let changed = [];
  if (mb) {
    const r = await ctx.git.raw(['diff', '--name-only', '--diff-filter=AM', mb, 'HEAD']);
    changed = String(r.stdout ?? '').split('\n').filter(Boolean);
  }
  let sqlGlobs = [];
  try { sqlGlobs = (await ctx.safety()).safety.workers.sqlGlobs; } catch { sqlGlobs = []; }
  const sections = handoverSections({
    journal: state?.journal ?? [], migrations: migrationFiles(changed, sqlGlobs), findingsDoc, plan, ready, waivers: state?.waivers ?? [],
  });

  const rel = (await findHandover(ctx, { profile, feature })) ?? handoverPathFor(profile.decisions.handoverPattern, { date: isoDate(ctx.clock), feature });
  const abs = join(ctx.repoRoot, rel);
  const marks = runMarkers(profile, feature);
  const existed = await exists(abs);
  let text = existed ? await readFile(abs, 'utf8') : `# Handover: the ${feature} delivery run${plan?.epic ? ` (#${plan.epic})` : ''}\n`;
  text = upsertBlock(text, marks.block('verification'), sections.verification);
  text = upsertBlock(text, marks.block('migrations'), sections.migrations);
  text = upsertBlock(text, marks.block('limitations'), sections.limitations);
  if (!print) await writeFileAtomic(abs, text);
  return { path: rel, text, created: !existed };
}

/** Upsert one generated block into the branch's handover (land's release block). */
export async function upsertHandoverBlock(ctx, { profile, feature, name, content }) {
  const rel = (await findHandover(ctx, { profile, feature })) ?? handoverPathFor(profile.decisions.handoverPattern, { date: isoDate(ctx.clock), feature });
  const abs = join(ctx.repoRoot, rel);
  const text = (await exists(abs)) ? await readFile(abs, 'utf8') : `# Handover: the ${feature} delivery run\n`;
  const next = upsertBlock(text, runMarkers(profile, feature).block(name), content);
  if (next !== text) await writeFileAtomic(abs, next);
  return { path: rel, changed: next !== text };
}
