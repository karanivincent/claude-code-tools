// delivery audit compile: record the auditors' reports in findings.json and compile the punch-list
// page from findings and captures (spec 8.2, 11.5). Owner: slice C (docs/ARCHITECTURE.md).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { readFindings } from '../core/findings.mjs';
import { loadState } from '../core/state.mjs';
import { writeFileAtomic } from '../core/fs.mjs';
import { EXIT } from '../core/exit.mjs';
import { ingestAuditReports } from '../report/audit.mjs';
import { renderPunchList, locatePictures, featureName } from '../report/punch-list.mjs';

const EMBED_BUDGET = 12 * 1024 * 1024; // the published page must stay under 16MB with its data: URIs

export default defineCommand({
  name: "audit compile",
  summary: "Compile the punch-list page from findings and captures",
  usage: `usage: delivery audit compile [--embed] [--no-ingest]

Record the auditors' reports in findings.json, then write .delivery/<feature>/punch-list.html
(findings with design and live side by side) for the main session to publish as a private
Artifact. No agent writes findings.json itself: auditors write .delivery/<feature>/audit/:
  <group>.json          { findings: [...] } (source auditor:<group>; a finding whose rule is
                        missing-element, dead-control, wrong-fact, wrong-number or misleads is P1)
  <group>.refute.json   { refutations: [{ id, verdict: duplicate|explained-by, row, why }] }
  <group>.spot.json     { judged, disagreed } (the second auditor's spot check)
A group ingested again from a changed file is a re-audit: journalled and counted.

The page names its pictures by relative path (design/<ID>.png, captures/<run>/<key>.png);
publish them with it as supporting files (the list is printed, and is data.files in --json),
or pass --embed to inline them as data: URIs within a 12MB budget.

options:
  --embed        inline the pictures in the page instead of referencing them
  --no-ingest    only render the page from findings.json as it is

exit: 0 written; 2 an auditor report is malformed (the others are still recorded, the page still written)

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { embed: { type: 'boolean', default: false }, 'no-ingest': { type: 'boolean', default: false } } });
    const paths = ctx.requirePaths();
    const state = await loadState(paths.state, { optional: true });
    const runId = state?.runId ?? 'no-run';
    const plan = await readArtefact(paths, 'plan', { optional: true });
    let profile = null;
    try { profile = await ctx.profile(); } catch { profile = null; }
    const head = await ctx.git.revParse('HEAD').catch(() => null);

    let problems = [];
    if (!values['no-ingest']) {
      const ing = await ingestAuditReports(ctx, { runId, fixedIn: head ?? runId, plan });
      problems = ing.problems;
      for (const i of ing.ingested) ctx.out.line(`recorded ${i.source}: ${i.findings} findings (${i.added} new, ${i.fixed} fixed, ${i.reopened} reopened)${i.reAudit ? ', a re-audit' : ''}`);
      if (ing.unchanged) ctx.out.line(`${ing.unchanged} auditor report(s) unchanged since last recorded`);
      if (ing.refuted) ctx.out.line(`${ing.refuted} judgement-only P1(s) refuted`);
      for (const s of ing.spot) ctx.out.line(`spot check ${s.source}: ${s.disagreed} of ${s.judged} disagreed`);
      for (const p of problems) ctx.out.fail('auditor-report', p);
    }

    const doc = await readFindings(paths, runId);
    const { pictures, files, runs } = await locatePictures(paths, doc.findings, { primaryLocale: profile?.audit?.primaryLocale });
    let embedded = 0;
    if (values.embed) {
      let budget = EMBED_BUDGET;
      const cache = new Map();
      for (const pics of pictures.values()) {
        for (const k of ['design', 'live']) {
          const rel = pics[k];
          if (!rel) continue;
          if (!cache.has(rel)) {
            const bytes = await readFile(join(paths.runDir, rel)).catch(() => null);
            if (!bytes || bytes.length > budget) { cache.set(rel, null); continue; }
            budget -= bytes.length;
            cache.set(rel, `data:image/png;base64,${bytes.toString('base64')}`);
            embedded++;
          }
          if (cache.get(rel)) pics[k] = cache.get(rel);
        }
      }
      if (embedded < files.length) ctx.out.warn(`${files.length - embedded} pictures over the embed budget stay as relative paths`);
    }
    const template = await readFile(join(ctx.pluginRoot, 'templates', 'punch-list.html'), 'utf8');
    const generated = ctx.clock.now().toISOString().replace(/\.\d+Z$/, 'Z');
    const meta = [
      `Run <code>${runId}</code>`,
      head ? `head <code>${head.slice(0, 12)}</code>` : null,
      runs.length ? `latest capture <code>${runs[0]}</code>` : 'no captures yet',
      `generated ${generated}`,
    ].filter(Boolean).join(' · ');
    const footer = `${featureName(paths.feature)} · ${doc.findings.length} findings from checks and auditors · written by <code>delivery audit compile</code>; the report and ready read the same findings.json`;
    const html = renderPunchList({ template, feature: paths.feature, findings: doc.findings, pictures, meta, footer });
    await writeFileAtomic(paths.punchList, html);

    const open = doc.findings.filter((f) => f.status === 'open');
    ctx.out.line(`wrote ${paths.punchList}: ${doc.findings.length} findings, ${open.length} open (${['P1', 'P2', 'P3'].map((s) => `${open.filter((f) => f.severity === s).length} ${s}`).join(', ')})`);
    if (!values.embed && files.length) ctx.out.line(`publish with ${files.length} picture(s) as supporting files, paths relative to ${paths.runDir}`);
    ctx.out.set('path', paths.punchList);
    ctx.out.set('files', values.embed ? [] : files);
    ctx.out.set('root', paths.runDir);
    ctx.out.set('findings', doc.findings.length);
    const exit = problems.length ? EXIT.USAGE : EXIT.PASS;
    await ctx.journal({
      command: 'audit compile', exit,
      counts: { findings: doc.findings.length, open: open.length, p1: open.filter((f) => f.severity === 'P1').length, problems: problems.length },
      outputs: { findings: doc.findings.map((f) => [f.id, f.status, f.severity]) },
    });
    return exit;
  },
});
