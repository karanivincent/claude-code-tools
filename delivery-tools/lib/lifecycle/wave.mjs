// Waves (spec 4.5). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// wave start merges origin/<base> with --no-commit, so the merge never completes before the
// baseline refresh has classed every capability that landed on the base since the run began. A
// modify/delete conflict on a file this branch deleted is resolved (the deletion stands) only once
// nothing is unclassed: the capability decision is the plan row, never the merge. Content
// conflicts are left for the main session and wave start reports them. Only then does it re-read
// the Scope issue, verify the claims, look for duplicate PRs, and write one unit file per unit.

import { createGit } from '../core/git.mjs';
import { gateResult } from '../core/gate.mjs';
import { fillCommand, wrapHeavy } from '../core/profile.mjs';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { updateState, formatEvent } from '../core/state.mjs';
import { exists } from '../core/fs.mjs';
import { DeliveryError, EXIT, UsageError } from '../core/exit.mjs';
import { deps, isNotImplemented } from './deps.mjs';
import {
  readPlan, readState, unitBranch, builtUnits, claimedPaths, matchesAny, findRunPr, lastLine, clip, repoRel, commitRunFiles,
} from './run-info.mjs';
import { readScope } from '../github/scope.mjs';
import { verifyClaims } from '../github/claims.mjs';
import { findDupes } from '../github/dupes.mjs';
import { ciStatus } from '../github/ci.mjs';
import { resolvePreview } from './preview.mjs';

const OUTPUT_CAP = 4000;
const BASE_PORT = 4100;

/** The run, its plan and a git bound to the integration worktree; refuses anywhere else. */
export async function integrationContext(ctx, { requireHere = true } = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const state = await readState(paths);
  if (!state) throw new UsageError(`no run state at ${repoRel(ctx.repoRoot, paths.state)}; run delivery intake first`);
  const plan = await readPlan(paths);
  const git = state.worktree === ctx.repoRoot ? ctx.git : createGit(ctx.runner, { cwd: state.worktree });
  if (requireHere) {
    const current = await git.currentBranch();
    if (state.worktree !== ctx.repoRoot || current !== state.branch) {
      throw new UsageError(`run this from the integration worktree ${state.worktree} on ${state.branch}`);
    }
  }
  return { paths, profile, state, plan, git };
}

/** Porcelain v1 unmerged entries: { code, path }. */
export function unmergedEntries(porcelain) {
  const out = [];
  for (const line of String(porcelain ?? '').split('\n')) {
    const code = line.slice(0, 2);
    if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code)) out.push({ code, path: line.slice(3) });
  }
  return out;
}

/** The longest directory every file shares, or the file itself when there is one. */
export function commonDir(files) {
  if (!files.length) return '.';
  if (files.length === 1) return files[0];
  const parts = files.map((f) => f.split('/'));
  const out = [];
  for (let i = 0; i < parts[0].length - 1; i++) {
    const seg = parts[0][i];
    if (parts.every((p) => p[i] === seg && i < p.length - 1)) out.push(seg); else break;
  }
  return out.length ? out.join('/') : '.';
}

async function mergeInProgress(git) {
  return (await git.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).code === 0;
}

/**
 * The unit file a builder gets with its brief (spec 4.5, 17.7). Pure.
 * reportPath is absolute: the builder writes it from its own worktree into the integration
 * worktree's run directory, where status looks for it.
 */
export function unitFileFor({ plan, unit, profile, integration, reportPath, index, flight, tried }) {
  const spec = commonDir(unit.files);
  return {
    schemaVersion: 1,
    unit,
    rows: plan.rows.filter((r) => r.owner === unit.id),
    contracts: plan.contracts.filter((c) => unit.kind === 'contract' || c.consumers.includes(unit.id)).map((c) => c.id),
    commands: {
      bootstrap: fillCommand(profile.commands.bootstrap, { dir: '.', port: BASE_PORT + index }),
      unitCheck: fillCommand(profile.commands.unitCheck, { spec, dir: '.', port: BASE_PORT + index }),
    },
    baseRef: `origin/${integration}`,
    branch: unitBranch(integration, unit.id),
    reportPath,
    flight: clip(flight ?? '', OUTPUT_CAP),
    tried: clip(tried ?? '', OUTPUT_CAP),
  };
}

/**
 * wave start (spec 4.5). Returns what happened; failures are collected, never thrown, except for
 * usage and inconsistency errors.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ wave?: number|null }} [o]
 */
export async function waveStart(ctx, { wave = null } = {}) {
  const { paths, profile, state, plan, git } = await integrationContext(ctx);
  const d = deps(ctx);
  const failures = [];
  const lines = [];
  const base = profile.repo.base;
  const integration = state.branch;
  const built = await builtUnits(git, { plan, integration });
  const waves = [...new Set(plan.units.filter((u) => !built.has(u.id)).map((u) => u.wave))].sort((a, b) => a - b);
  const n = wave ?? waves[0] ?? null;
  if (n === null) return { wave: null, failures, lines: ['every unit of the plan is merged; nothing to start'], units: [], exit: 0 };

  // 1. The base, merged without committing, then the refresh, then conflicts.
  let midMerge = await mergeInProgress(git);
  if (!midMerge && await commitRunFiles(git, paths, `Record the ${paths.feature} run's plan updates before wave ${n}`, { what: 'wave start' })) {
    lines.push(`committed the run's own file changes before merging origin/${base}`);
  }
  await git.fetch('origin', base);
  const baseSha = await git.revParse(`origin/${base}`);
  if (!midMerge) {
    const r = await git.raw(['merge', '--no-ff', '--no-commit', `origin/${base}`]);
    midMerge = await mergeInProgress(git);
    if (r.code !== 0 && !midMerge) {
      throw new DeliveryError(EXIT.RED, `git merge origin/${base} failed: ${lastLine(r.stderr, r.stdout)}`, { code: 'merge' });
    }
    lines.push(midMerge ? `merging origin/${base} (${String(baseSha).slice(0, 7)}), not committed until every new capability is classed` : `origin/${base} is already merged`);
  } else {
    lines.push(`continuing the merge of origin/${base} left by the last wave start`);
  }

  let refresh = { added: [], unclassed: [] };
  if (await exists(paths.baseline)) {
    try {
      refresh = await d.refreshBaseline(ctx);
    } catch (err) {
      if (!isNotImplemented(err) && !(err && typeof err.exit === 'number')) throw err;
      failures.push({ code: 'baseline', message: `the baseline refresh could not run (${err.message}); wave start cannot finish without it` });
    }
    for (const c of refresh.unclassed) failures.push({ code: 'unclassed', message: `${c} landed on origin/${base} since the run began and has no class in the plan; give it a row (default migrate) before the merge completes` });
    if (refresh.added.length) lines.push(`baseline refresh: ${refresh.added.length} new capabilit${refresh.added.length === 1 ? 'y' : 'ies'} (${refresh.added.join(', ')})`);
  } else {
    lines.push('no baseline (not a redesign): nothing to refresh');
  }

  if (midMerge) {
    const unmerged = unmergedEntries((await git.raw(['status', '--porcelain'])).stdout);
    const replaced = unmerged.filter((u) => u.code === 'DU');
    const other = unmerged.filter((u) => u.code !== 'DU');
    if (replaced.length && !failures.length) {
      for (const u of replaced) {
        await git.ok(['rm', '--quiet', '--', u.path]);
        lines.push(`kept this branch's deletion of ${u.path}: origin/${base} changed it, and its capabilities are classed in the plan`);
      }
    } else if (replaced.length) {
      for (const u of replaced) failures.push({ code: 'modify-delete', message: `${u.path} was changed on origin/${base} and deleted on this branch; that is a plan decision, settled once every new capability is classed` });
    }
    for (const u of other) failures.push({ code: 'conflict', message: `${u.path} (${u.code}) conflicts with origin/${base}; resolve it, git add it, then run wave start again` });
    if (!failures.length) {
      // The refresh's plan rows and baseline entries belong to this merge: they class what it brings.
      await git.ok(['add', '--', repoRel(paths.repoRoot, paths.deliveryDir)]);
      await git.ok(['commit', '--no-edit', '-m', `Merge origin/${base} into ${integration} at the start of wave ${n}`]);
      lines.push(`merged origin/${base} (${String(baseSha).slice(0, 7)})`);
    }
  }
  if (failures.length) return finish(ctx, { paths, n, failures, lines, units: [], refresh, baseSha, state });

  // 2. The founder's Scope replies.
  const scope = await readScope(ctx);
  for (const a of scope.applied) lines.push(`Scope ${a.line} ${a.word}: ${a.rows.map((r) => `${r.id} ${r.from} → ${r.to}`).join(', ') || 'no class change'}`);
  for (const u of scope.unmapped) failures.push({ code: 'scope-reply', message: `the founder's comment ${u.id} on the Scope issue is not in the fixed form; map it with the scope-reply extractor, then scope read --apply "<S1 build>" --comment ${u.id}, or scope read --ignore ${u.id}` });
  const planNow = scope.applied.length ? await readPlan(paths) : plan;
  if (await commitRunFiles(git, paths, `Record the plan updates of the wave ${n} start (Scope replies, baseline refresh)`, { what: 'wave start' })) {
    lines.push('committed the plan updates the Scope replies and the baseline refresh made');
  }

  // 3. Claims and duplicates.
  if (profile.claims.mode !== 'none') {
    const pr = await findRunPr(ctx, { profile, feature: paths.feature, state });
    if (!pr) failures.push({ code: 'claims', message: 'the run has no draft PR yet; run delivery claims open before any dispatch' });
    else {
      const v = await verifyClaims(ctx);
      for (const q of v.queued) failures.push({ code: 'claims', message: `the planner still queues #${q.issue} (${q.unit}); its claim is not holding` });
    }
  }
  for (const dup of await findDupes(ctx)) failures.push({ code: 'dupe', message: dup.reason });

  // 4. Unit files for this wave's units not yet merged, flight and tried for the builders.
  const units = planNow.units.filter((u) => u.wave === n && !built.has(u.id));
  const flight = await runQuiet(ctx, profile.commands.flight, {});
  const already = new Set((state.inFlight ?? []).map((f) => f.unit));
  const written = [];
  for (const unit of units) {
    const tried = await runQuiet(ctx, profile.commands.tried, { spec: commonDir(unit.files) });
    const reportPath = paths.unitReport(unit.id);
    const file = unitFileFor({ plan: planNow, unit, profile, integration, reportPath, index: planNow.units.indexOf(unit), flight, tried });
    await writeArtefact(paths, 'unit-file', file, { key: unit.id });
    written.push({ unit, file: paths.unitFile(unit.id), report: reportPath, branch: file.branch });
  }
  if (!failures.length) {
    for (const w of written) {
      if (already.has(w.unit.id)) continue;
      try {
        await d.recordDispatch(ctx, { unit: w.unit.id, agent: 'delivery-builder', branch: w.branch, brief: w.file, report: w.report });
      } catch (err) {
        if (!(err && typeof err.exit === 'number')) throw err;
        failures.push({ code: 'dispatch', message: `could not record the dispatch of ${w.unit.id}: ${err.message}` });
      }
    }
  }
  return finish(ctx, { paths, n, failures, lines, units: written, refresh, baseSha, state, parallel: profile.limits.builderParallel });
}

async function runQuiet(ctx, template, values) {
  if (!template) return '';
  let cmd;
  try { cmd = fillCommand(template, values); } catch (err) { return `(not run: ${err.message})`; }
  const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 5 * 60_000 });
  const text = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim();
  return r.code === 0 ? text : `(${cmd} exited ${r.code}) ${text}`;
}

async function finish(ctx, { paths, n, failures, lines, units, refresh, baseSha, state, parallel = 6 }) {
  const exit = failures.length ? EXIT.RED : EXIT.PASS;
  if (!failures.length) {
    for (const [i, w] of units.entries()) {
      lines.push(`NEXT: dispatch delivery-builder for ${w.unit.id} (${w.unit.title}); brief ${repoRel(paths.repoRoot, w.file)}${i >= parallel ? ' (queued: at most ' + parallel + ' at once)' : ''}`);
    }
  }
  await updateState(paths, (s) => ({ ...s, wave: exit === EXIT.PASS ? n : s.wave }), {
    at: ctx.clock.now().toISOString(),
    event: formatEvent({ command: 'wave start', exit, counts: { wave: n, units: units.length, base: String(baseSha ?? 'none').slice(0, 12), added: refresh.added.length, unclassed: refresh.unclassed.length, failures: failures.length } }),
    inputs: { wave: n, base: baseSha, inFlight: state.inFlight?.length ?? 0 },
    outputs: { units: units.map((u) => u.unit.id), failures },
  });
  return { wave: n, failures, lines, units, exit };
}

/**
 * wave merge <unit>: merge a unit whose gate is green with --no-ff, then push.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ unit: string }} o
 */
export async function waveMerge(ctx, { unit: unitId }) {
  const { paths, profile, state, plan, git } = await integrationContext(ctx);
  const d = deps(ctx);
  const unit = plan.units.find((u) => u.id === unitId);
  if (!unit) throw new UsageError(`no unit ${unitId} in the plan (units: ${plan.units.map((u) => u.id).join(', ')})`);
  const branch = unitBranch(state.branch, unit.id);
  const sha = await git.revParse(`refs/heads/${branch}`);
  if (!sha) throw new DeliveryError(EXIT.RED, `no branch ${branch}: the builder has not committed yet`, { code: 'branch' });
  if ((await git.raw(['merge-base', '--is-ancestor', sha, 'HEAD'])).code === 0) {
    await clearQuietly(ctx, d, unit.id);
    // Journalled too, in the shape status reads (`wave merge <unit> | exit=0`), for a unit merged by hand.
    await ctx.journal({ command: `wave merge ${unit.id}`, exit: 0, counts: { already: 1 }, inputs: { unit: unit.id, branch: sha }, outputs: {} });
    return { unit: unit.id, merged: false, already: true, failures: [], lines: [`${unit.id} (${sha.slice(0, 7)}) is already merged`] };
  }
  await commitRunFiles(git, paths, `Record the ${paths.feature} run's plan updates before merging ${unit.id}`, { what: 'wave merge' });

  const gate = await d.unitGateStatus(ctx, unit.id);
  if (!gate.ok) {
    return { unit: unit.id, merged: false, failures: gate.failures.map((f) => ({ code: f.code || 'gate', message: `${unit.id}: ${f.message}` })), exit: gate.exit ?? EXIT.RED, lines: [] };
  }
  const r = await git.merge(branch, { noFf: true, message: `Merge unit ${unit.id}: ${unit.title}` });
  if (r.code !== 0) {
    const unmerged = unmergedEntries((await git.raw(['status', '--porcelain'])).stdout).map((u) => u.path);
    await git.raw(['merge', '--abort']);
    return {
      unit: unit.id, merged: false, exit: EXIT.RED, lines: [],
      failures: [{ code: 'conflict', message: `${branch} conflicts with ${state.branch}${unmerged.length ? ` in ${unmerged.join(', ')}` : `: ${lastLine(r.stderr, r.stdout)}`}; the builder merges origin/${state.branch} into its branch and resolves them` }],
    };
  }
  const head = await git.revParse('HEAD');
  await git.ok(['push', 'origin', state.branch]);
  await clearQuietly(ctx, d, unit.id);
  await ctx.journal({ command: `wave merge ${unit.id}`, exit: 0, counts: { sha: head.slice(0, 12) }, inputs: { unit: unit.id, branch: sha }, outputs: { head } });
  return { unit: unit.id, merged: true, failures: [], lines: [`merged ${unit.id} (${sha.slice(0, 7)}) into ${state.branch} and pushed (${head.slice(0, 7)})`], exit: 0, head };
}

async function clearQuietly(ctx, d, unitId) {
  try { await d.clearDispatch(ctx, unitId); } catch (err) {
    if (!(err && typeof err.exit === 'number')) throw err;
    ctx.out.warn(`could not clear the in-flight record of ${unitId}: ${err.message}`);
  }
}

/**
 * wave end: optionally the local CI chain, then push, duplicates, CI (mergeable first) and the
 * preview for the pushed head. Exit 0 ready for the wave capture, 1 red, 4 pending.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ final?: boolean }} [o]
 */
export async function waveEnd(ctx, { final = false } = {}) {
  const { paths, profile, state, git } = await integrationContext(ctx);
  const failures = [];
  const lines = [];
  await commitRunFiles(git, paths, `Record the ${paths.feature} run's plan updates at the wave end`, { what: 'wave end' });
  if (final) {
    const cmd = wrapHeavy(profile, profile.commands.gate);
    const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 120 * 60_000 });
    if (r.code !== 0) {
      failures.push({ code: 'local-ci', message: `the full local CI chain failed (exit ${r.code}): ${lastLine(r.stderr, r.stdout)}; fix it before the last push` });
      return endResult(ctx, { failures, lines, exit: EXIT.RED });
    }
    lines.push('the full local CI chain passed');
  }
  await git.ok(['push', 'origin', state.branch]);
  const local = await git.revParse('HEAD');
  lines.push(`pushed ${state.branch} (${local.slice(0, 7)})`);
  const pr = await findRunPr(ctx, { profile, feature: paths.feature, state });
  if (!pr) {
    failures.push({ code: 'claims', message: 'the run has no draft PR; run delivery claims open' });
    return endResult(ctx, { failures, lines, exit: EXIT.RED });
  }
  for (const dup of await findDupes(ctx)) failures.push({ code: 'dupe', message: dup.reason });
  const ci = await ciStatus(ctx, { pr: pr.number, wait: true });
  lines.push(ci.detail);
  if (ci.state === 'conflicting' || ci.state === 'red') failures.push({ code: ci.state === 'conflicting' ? 'mergeable' : 'ci', message: ci.detail });
  if (ci.state === 'pending') return endResult(ctx, { failures, lines, exit: failures.length ? EXIT.RED : EXIT.WAIT, sha: ci.headSha });
  if (ci.headSha && ci.headSha !== local) lines.push(`note: the PR head is ${ci.headSha.slice(0, 7)}, not the local HEAD ${local.slice(0, 7)}`);
  const preview = await resolvePreview(ctx, { sha: ci.headSha || local });
  lines.push(preview.detail);
  if (preview.pending) return endResult(ctx, { failures, lines, exit: failures.length ? EXIT.RED : EXIT.WAIT, sha: ci.headSha });
  if (!preview.url && profile.environments.previews !== 'none') failures.push({ code: 'preview', message: preview.detail });
  if (!failures.length) {
    lines.push(`NEXT: capture --mode wave for ${String(ci.headSha || local).slice(0, 7)}${preview.url ? ` at ${preview.url}` : ' on a local production build'}, then check all and the wave audit`);
  }
  return endResult(ctx, { failures, lines, exit: failures.length ? EXIT.RED : EXIT.PASS, sha: ci.headSha || local, url: preview.url });
}

async function endResult(ctx, { failures, lines, exit, sha = null, url = null }) {
  await ctx.journal({ command: 'wave end', exit, counts: { sha: String(sha ?? 'none').slice(0, 12), preview: url ? 'resolved' : 'none', failures: failures.length }, inputs: { sha }, outputs: { url, failures } });
  return { failures, lines, exit, sha, url };
}

/**
 * Phase-5 gate input, recomputed from git and the plan: no merge left half done in the
 * integration worktree, every capability a baseline refresh added has a plan row, and origin/<base>
 * has not changed a claimed path since the last wave start merged it.
 * Called by lib/gates/phase-5.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function waveSyncGate(ctx) {
  const { paths, profile, plan, git } = await integrationContext(ctx, { requireHere: false });
  const failures = [];
  if (await mergeInProgress(git)) failures.push({ code: 'wave-sync', message: 'a merge of the base is still in progress in the integration worktree (run delivery wave start)' });
  const unmerged = unmergedEntries((await git.raw(['status', '--porcelain'])).stdout);
  for (const u of unmerged) failures.push({ code: 'wave-sync', message: `${u.path} is still conflicted (${u.code})` });

  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  if (baseline) {
    const rows = new Set(plan.rows.map((r) => r.id));
    const added = [...new Set(baseline.refreshes.flatMap((r) => r.added))];
    for (const id of added) if (!rows.has(id)) failures.push({ code: 'unclassed', message: `${id} landed on the base since the run began and has no plan row` });
  }

  const base = `origin/${profile.repo.base}`;
  if (await git.revParse(base)) {
    const r = await git.raw(['log', '--format=', '--name-only', `HEAD..${base}`]);
    const claimed = claimedPaths(plan);
    const touched = [...new Set(String(r.stdout ?? '').split('\n').filter(Boolean))].filter((f) => matchesAny(f, claimed));
    if (touched.length) failures.push({ code: 'wave-sync', message: `${base} changed ${touched.length} claimed path${touched.length === 1 ? '' : 's'} since the last merge (first ${touched[0]}); run delivery wave start` });
  }
  return gateResult(failures);
}

