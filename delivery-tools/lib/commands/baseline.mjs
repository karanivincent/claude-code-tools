// delivery baseline: extract today's capabilities at a ref; M2 diff and refresh.
// Owner: slice B2 (docs/ARCHITECTURE.md).

import { readdir } from 'node:fs/promises';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { readJson } from '../core/fs.mjs';
import { recordFindings } from '../core/findings.mjs';
import { loadState, newRunId } from '../core/state.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { extractAtRef, numberCapabilities, baselineGate, KIND_ORDER } from '../baseline/extract.mjs';
import { runM2, M2_SOURCE } from '../baseline/diff.mjs';
import { refreshBaseline } from '../baseline/refresh.mjs';

export default defineCommand({
  name: 'baseline',
  summary: "Extract today's capabilities at a ref; M2 diff and refresh",
  usage: `usage: delivery baseline [--ref <ref>] [--refresh] [--against <ref>]

Extract every capability of the in-scope routes at a ref (default: the run's start SHA on
origin/<base>): routes and tabs, controls (from a baseline capture, when one exists), API calls
with discriminating fields, e2e assertions, copy keys, data fields, open issues naming those
files. Writes baseline.json. Re-running keeps every id already given out.

options:
  --ref <ref>        extract at this ref (with --refresh: refresh against it instead of
                     origin/<base>)
  --refresh          re-read origin/<base>; a capability that landed since the run began gets
                     a plan row (default migrate, a Tier 1 decision file); red while any is unclassed
  --against <ref>    extract at <ref> (usually HEAD) into baseline-head.json and run the M2 diff
                     against baseline.json; findings are recorded as check:M2

exit: 0 green; 1 M2 red or an unclassed new capability; 2 no intent or no profile

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: { ref: { type: 'string' }, refresh: { type: 'boolean' }, against: { type: 'string' } },
    });
    if (values.refresh && values.against) throw new UsageError('--refresh and --against are separate steps; run one at a time');
    if (values.refresh) return refreshMode(ctx, values.ref);
    if (values.against) return againstMode(ctx, values.against);
    return extractMode(ctx, values.ref);
  },
});

async function extractMode(ctx, refFlag) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const intent = await readArtefact(paths, 'intent');
  const existing = await readArtefact(paths, 'baseline', { optional: true });
  const baseName = `origin/${profile.repo.base}`;
  let ref = refFlag ?? existing?.base.sha ?? null;
  if (!ref) {
    ref = await ctx.git.mergeBase('HEAD', baseName);
    if (!ref) throw new UsageError(`HEAD and ${baseName} share no commit; pass --ref <the run's start SHA>`);
  }
  const captureDir = await latestBaselineCapture(paths);
  const r = await extractAtRef(ctx, { ref, profile, intent, issues: true, captureDir });
  if (existing && existing.base.sha !== r.sha && !refFlag) {
    throw new UsageError(`baseline.json was taken at ${existing.base.sha.slice(0, 9)}; pass --ref ${r.sha.slice(0, 9)} to retake it deliberately`);
  }
  let capabilities;
  if (existing && existing.base.sha === r.sha) {
    const bySig = new Map(r.capabilities.map((c) => [c.signature, c]));
    const kept = existing.capabilities.map((c) => (bySig.has(c.signature) ? { ...c, evidence: bySig.get(c.signature).evidence } : c));
    const known = new Set(existing.capabilities.map((c) => c.signature));
    let next = existing.capabilities.reduce((m, c) => Math.max(m, Number(c.id.slice(4))), 0) + 1;
    const fresh = r.capabilities.filter((c) => !known.has(c.signature))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.signature < b.signature ? -1 : 1))
      .map((c) => ({ id: `CAP-${String(next++).padStart(3, '0')}`, kind: c.kind, signature: c.signature, screen: c.screen ?? '', evidence: c.evidence }));
    capabilities = [...kept, ...fresh];
  } else {
    capabilities = numberCapabilities(r.capabilities);
  }
  if (capabilities.length > 999) throw new UsageError(`${capabilities.length} capabilities do not fit the CAP-### id format; narrow the intent's in-scope routes`);
  const baseline = {
    schemaVersion: 1,
    base: { ref: refFlag ?? baseName, sha: r.sha },
    capabilities,
    refreshes: existing && existing.base.sha === r.sha ? existing.refreshes : [],
  };
  await writeArtefact(paths, 'baseline', baseline);
  const counts = {};
  for (const c of capabilities) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  ctx.out.line(`baseline at ${r.sha.slice(0, 9)}: ${capabilities.length} capabilit(ies) (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}) -> ${paths.baseline}`);
  for (const n of r.notes) ctx.out.warn(n);
  if (!captureDir) ctx.out.line('controls: none yet (they come from delivery capture --mode baseline; re-run delivery baseline after it)');
  const gate = await baselineGate(ctx);
  for (const f of gate.failures) ctx.out.fail(f.code, f.message);
  ctx.out.set('baseline', { sha: r.sha, counts });
  const exit = gate.ok ? EXIT.PASS : (gate.exit ?? EXIT.RED);
  await ctx.journal({ command: 'baseline', exit, counts: { capabilities: capabilities.length }, outputs: capabilities.map((c) => c.signature) });
  return exit;
}

async function refreshMode(ctx, ref) {
  const { added, unclassed } = await refreshBaseline(ctx, ref ? { ref } : {});
  ctx.out.line(`baseline refresh: ${added.length} new capabilit(ies)${added.length ? `: ${added.join(', ')}` : ''}`);
  for (const id of unclassed) ctx.out.fail('unclassed', `${id} landed on the base since the run began and has no plan row yet`);
  ctx.out.set('refresh', { added, unclassed });
  return unclassed.length ? EXIT.RED : EXIT.PASS;
}

async function againstMode(ctx, against) {
  const paths = ctx.requirePaths();
  const { findings, notes, head } = await runM2(ctx, { against });
  for (const n of notes) ctx.out.warn(n);
  const state = await loadState(paths.state, { optional: true });
  const runId = state?.runId ?? newRunId(ctx.clock);
  if (head) await recordFindings(paths, runId, { source: M2_SOURCE, fresh: findings, fixedIn: head.sha });
  for (const f of findings) ctx.out.fail(`M2-${f.severity}`, `${f.state} ${f.where}: ${f.live}`);
  const bySev = { P1: 0, P2: 0, P3: 0 };
  for (const f of findings) bySev[f.severity]++;
  ctx.out.line(`M2 against ${against}${head ? `@${head.sha.slice(0, 9)}` : ''}: ${findings.length ? `${bySev.P1} P1, ${bySev.P2} P2` : 'every capability kept, moved or removed through its row'}`);
  ctx.out.set('m2', { findings: findings.map((f) => ({ id: f.id, severity: f.severity, capability: f.state, signature: f.where, rule: f.rule, live: f.live })) });
  const exit = findings.length ? EXIT.RED : EXIT.PASS;
  await ctx.journal({ command: `baseline --against ${against}`, exit, counts: { P1: bySev.P1, P2: bySev.P2 }, outputs: findings.map((f) => f.id) });
  return exit;
}

/** The newest capture run in baseline mode, if any. */
async function latestBaselineCapture(paths) {
  let dirs = [];
  try { dirs = (await readdir(paths.captures, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return null; }
  for (const runId of dirs.reverse()) {
    const manifest = await readJson(paths.captureManifest(runId), { optional: true }).catch(() => null);
    if (manifest?.mode === 'baseline') return paths.captureDir(runId);
  }
  return null;
}
