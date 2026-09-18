// Bringing auditor reports into findings.json (spec 8.2), so no agent ever writes findings.json:
// auditors write .delivery/<feature>/audit/<group>.json, and `delivery audit compile` records them.
//
//   <group>.json          { schemaVersion?, runId?, findings: [...] } or a bare array of findings.
//                         Source is always auditor:<group>; an entry claiming any other source is
//                         refused. A finding whose rule is a P1 category (missing-element,
//                         dead-control, wrong-fact, wrong-number, misleads) is P1 whatever it says.
//   <group>.refute.json   { refutations: [{ id, verdict: "duplicate"|"explained-by", row?, why }] }
//                         the second auditor's pass over judgement-only P1s: it may mark one a
//                         duplicate, or explained by a cut or adapt plan row. It never sets a severity.
//   <group>.spot.json     { judged, disagreed } the 10% second-auditor spot check, journalled.
//
// Ingestion is idempotent by file hash (read back from the journal). A group ingested again from a
// different file is a re-audit: journalled and counted on its findings.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeFinding, recordFindings, readFindings, writeFindings } from '../core/findings.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { withLock } from '../core/fs.mjs';
import { sha256 } from '../core/hash.mjs';
import { loadState, parseEvent } from '../core/state.mjs';
import { idPart } from '../design/claude-dc.mjs';

export const P1_CATEGORIES = new Set(['missing-element', 'dead-control', 'wrong-fact', 'wrong-number', 'misleads']);

/**
 * Normalise one auditor report (pure).
 * @param {unknown} raw
 * @param {string} fileGroup the report's file stem, the group when an entry names none
 * @returns {{ findings: import('../core/findings.mjs').Finding[], problems: string[] }}
 */
export function normaliseAuditorFindings(raw, fileGroup) {
  const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.findings) ? raw.findings : null;
  if (!entries) return { findings: [], problems: ['not a findings document (expected { findings: [...] } or an array)'] };
  const findings = [];
  const problems = [];
  entries.forEach((e, n) => {
    if (!e || typeof e !== 'object') { problems.push(`entry ${n}: not an object`); return; }
    const group = String(e.group || fileGroup);
    const source = `auditor:${idPart(group)}`;
    if (e.source && e.source !== source && !String(e.source).startsWith('auditor:')) {
      problems.push(`entry ${n}: an auditor may not write source ${e.source}`);
      return;
    }
    const floor = typeof e.rule === 'string' && P1_CATEGORIES.has(e.rule);
    let f;
    try {
      f = makeFinding({
        source, rule: typeof e.rule === 'string' ? e.rule : undefined, severity: floor ? 'P1' : e.severity,
        dayOne: Boolean(e.dayOne), state: e.state, group, where: e.where, design: e.design ?? '', live: e.live ?? '',
        cause: typeof e.cause === 'string' ? e.cause : undefined, evidence: e.evidence ?? 'seen', status: 'open',
      });
    } catch (err) {
      problems.push(`entry ${n}: ${err.message}`);
      return;
    }
    const v = validateAgainst('findings', { schemaVersion: 1, runId: 'check', findings: [f] });
    if (v.errors.length) { problems.push(`entry ${n}: ${v.errors[0].path} ${v.errors[0].message}`); return; }
    findings.push(f);
  });
  return { findings, problems };
}

/** The file hash last ingested per event subject, from journal events "<verb> <subject> | … | file=<sha12>". */
export function lastIngested(journal, verb) {
  const out = new Map();
  for (const e of journal ?? []) {
    const p = parseEvent(e.event);
    if (!p.command.startsWith(`${verb} `) || !p.counts.file) continue;
    out.set(p.command.slice(verb.length + 1), p.counts.file);
  }
  return out;
}

/**
 * Ingest every auditor report under .delivery/<feature>/audit/.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ runId: string, fixedIn: string, plan: object|null }} o
 * @returns {Promise<{ ingested: { source: string, findings: number, added: number, fixed: number, reopened: number, reAudit: boolean }[],
 *                     unchanged: number, refuted: number, spot: { source: string, judged: number, disagreed: number }[], problems: string[] }>}
 */
export async function ingestAuditReports(ctx, o) {
  const paths = ctx.requirePaths();
  const dir = join(paths.runDir, 'audit');
  const result = { ingested: [], unchanged: 0, refuted: 0, spot: [], problems: [] };
  let names;
  try { names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort(); } catch { return result; }
  const state = await loadState(paths.state, { optional: true }).catch(() => null);
  const seen = lastIngested(state?.journal, 'audit ingest');
  const seenSpot = lastIngested(state?.journal, 'audit spot');

  for (const name of names.filter((n) => !n.endsWith('.refute.json') && !n.endsWith('.spot.json'))) {
    const bytes = await readFile(join(dir, name));
    const fileSha = sha256(bytes).slice(0, 12);
    let raw;
    try { raw = JSON.parse(bytes.toString('utf8')); } catch (err) { result.problems.push(`${name}: not JSON (${err.message})`); continue; }
    const { findings, problems } = normaliseAuditorFindings(raw, name.replace(/\.json$/, ''));
    for (const p of problems) result.problems.push(`${name}: ${p}`);
    const bySource = new Map();
    for (const f of findings) {
      if (!bySource.has(f.source)) bySource.set(f.source, []);
      bySource.get(f.source).push(f);
    }
    if (!bySource.size && !problems.length) bySource.set(`auditor:${idPart(name.replace(/\.json$/, ''))}`, []); // a clean report fixes the group's findings
    for (const [source, fresh] of bySource) {
      if (seen.get(source) === fileSha) { result.unchanged++; continue; }
      const reAudit = seen.has(source);
      const r = await recordFindings(paths, o.runId, { source, fresh, fixedIn: o.fixedIn, inScope: (f) => f.source === source });
      if (reAudit) {
        await withLock(`${paths.findings}.lock`, async () => {
          const doc = await readFindings(paths, o.runId);
          await writeFindings(paths, { ...doc, findings: doc.findings.map((f) => (f.source === source ? { ...f, reAudits: f.reAudits + 1 } : f)) });
        });
      }
      await ctx.journal({ command: `audit ingest ${source}`, exit: 0, counts: { file: fileSha, findings: fresh.length, added: r.added, fixed: r.fixed, reopened: r.reopened }, inputs: { name, fileSha } });
      if (reAudit) await ctx.journal({ command: `re-audit ${source}`, exit: 0, counts: { reAudits: 1, file: fileSha } });
      seen.set(source, fileSha);
      result.ingested.push({ source, findings: fresh.length, added: r.added, fixed: r.fixed, reopened: r.reopened, reAudit });
    }
  }

  for (const name of names.filter((n) => n.endsWith('.refute.json'))) {
    let raw;
    try { raw = JSON.parse(await readFile(join(dir, name), 'utf8')); } catch (err) { result.problems.push(`${name}: not JSON (${err.message})`); continue; }
    const list = Array.isArray(raw?.refutations) ? raw.refutations : null;
    if (!list) { result.problems.push(`${name}: expected { refutations: [...] }`); continue; }
    await withLock(`${paths.findings}.lock`, async () => {
      const doc = await readFindings(paths, o.runId);
      const byId = new Map(doc.findings.map((f) => [f.id, f]));
      for (const r of list) {
        const f = byId.get(r?.id);
        if (!f) { result.problems.push(`${name}: no finding ${r?.id}`); continue; }
        if (!f.source.startsWith('auditor:') || f.severity !== 'P1') { result.problems.push(`${name}: ${f.id} is not a judgement-only P1; only those are refuted`); continue; }
        if (f.status !== 'open') continue;
        if (r.verdict === 'duplicate') { f.status = 'duplicate'; result.refuted++; continue; }
        if (r.verdict === 'explained-by') {
          const row = o.plan?.rows.find((x) => x.id === r.row);
          if (row?.class === 'cut') { f.status = 'cut'; result.refuted++; continue; }
          if (row?.class === 'adapt' && row.issue) {
            f.status = 'accepted';
            f.accept = { reasonClass: 'adapt', issue: row.issue, text: String(r.why || `explained by ${row.id}`) };
            result.refuted++;
            continue;
          }
          result.problems.push(`${name}: ${f.id} explained-by ${r.row ?? '(no row)'} needs a cut row, or an adapt row with an issue`);
          continue;
        }
        result.problems.push(`${name}: ${f.id} verdict must be duplicate or explained-by`);
      }
      await writeFindings(paths, { ...doc, findings: [...byId.values()] });
    });
  }

  for (const name of names.filter((n) => n.endsWith('.spot.json'))) {
    const bytes = await readFile(join(dir, name));
    const fileSha = sha256(bytes).slice(0, 12);
    const source = `auditor:${idPart(name.replace(/\.spot\.json$/, ''))}`;
    let raw;
    try { raw = JSON.parse(bytes.toString('utf8')); } catch { result.problems.push(`${name}: not JSON`); continue; }
    const judged = Number(raw?.judged), disagreed = Number(raw?.disagreed);
    if (!Number.isInteger(judged) || !Number.isInteger(disagreed) || disagreed < 0 || disagreed > judged) { result.problems.push(`${name}: expected { judged, disagreed } whole numbers`); continue; }
    result.spot.push({ source, judged, disagreed });
    if (seenSpot.get(source) === fileSha) continue;
    await ctx.journal({ command: `audit spot ${source}`, exit: 0, counts: { file: fileSha, judged, disagreed } });
  }
  return result;
}
