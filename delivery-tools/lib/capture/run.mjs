// Running a capture (spec 6.2, 9). Owner: slice C (docs/ARCHITECTURE.md).
//
// One capture run: build the job for the mode, refresh the fixture worlds and scan them, write
// captures/<runId>/job.json and extract.js, run the committed capture spec through the heavy wrapper
// (in branch mode the spec's Playwright webServer owns the dev server), judge every item from the
// files it wrote, tear down rows its clicks created, and write capture.json.

import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { ensureDir, exists, writeJsonAtomic } from '../core/fs.mjs';
import { fillCommand, wrapHeavy } from '../core/profile.mjs';
import { guardGate } from '../core/gate.mjs';
import { UsageError, WaitError, DeliveryError, EXIT } from '../core/exit.mjs';
import { resolvePreview } from '../lifecycle/preview.mjs';
import { refreshWorld, seedScanGate, teardownRows } from '../seed/scan.mjs';
import { extractScriptSource } from './page-extract.mjs';
import { buildItems, buildJob, newCaptureRunId, parseVersionProbe, itemKey, MODES, REAL_ORG_WORLD, BASELINE_WORLD } from './job.mjs';
import { judgeInputs } from './validate.mjs';
import { judgeItems } from './judge.mjs';
import { probeServedSha } from './served-sha.mjs';

/** Cross-slice calls, injectable so tests never need another slice's implementation. */
export const DEFAULT_HOOKS = Object.freeze({ resolvePreview, refreshWorld, seedScanGate, teardownRows, probeServedSha });

/** A free loopback port. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function revParse(ctx, ref, cwd = null) {
  const r = await ctx.runner.run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: cwd ?? ctx.repoRoot });
  return r.code === 0 ? String(r.stdout).trim() : null;
}

/**
 * Where to capture, and which SHA must be served there.
 * @returns {Promise<{ baseUrl: string, expectedSha: string, webServer: object|null, detail: string }>}
 */
export async function resolveTarget(ctx, o) {
  const { mode, profile, hooks } = o;
  const appUrl = profile.environments.test.appUrl;
  if (mode === 'branch') {
    let dir = ctx.repoRoot;
    if (o.unit) {
      const branch = o.unit.branch;
      const wts = await ctx.git.worktrees();
      const wt = wts.find((w) => w.branch === branch || w.branch === `refs/heads/${branch}`);
      if (!wt) throw new UsageError(`no worktree has the unit's branch ${branch} checked out; branch mode serves the unit's own tree`);
      dir = wt.path;
    }
    const expectedSha = o.sha ?? (await revParse(ctx, 'HEAD', dir));
    if (!expectedSha) throw new UsageError(`cannot read HEAD in ${dir}`);
    const port = o.port ?? (await freePort());
    const baseUrl = o.baseUrl ?? `http://127.0.0.1:${port}`;
    const webServer = o.baseUrl ? null : {
      command: fillCommand(profile.commands.devServer, { dir, port }),
      url: baseUrl,
      cwd: ctx.repoRoot,
      timeoutMs: 300_000,
      env: { BUILD_SHA: expectedSha, PORT: String(port) },
    };
    return { baseUrl, expectedSha, webServer, detail: `dev server for ${dir}` };
  }
  if (mode === 'wave' || mode === 'full') {
    const expectedSha = o.sha ?? (await revParse(ctx, 'HEAD'));
    if (!expectedSha) throw new UsageError('cannot read HEAD');
    if (o.baseUrl) return { baseUrl: o.baseUrl, expectedSha, webServer: null, detail: 'given --base-url' };
    const pv = await hooks.resolvePreview(ctx, { sha: expectedSha });
    if (pv.pending) throw new WaitError(`the preview for ${expectedSha.slice(0, 12)} is not ready: ${pv.detail}`, { code: 'preview' });
    if (pv.url) return { baseUrl: pv.url, expectedSha, webServer: null, detail: pv.detail || 'preview by SHA' };
    // No previews: a local production build stands in (spec 4.5), owned by the capture's webServer.
    const port = o.port ?? (await freePort());
    const baseUrl = `http://127.0.0.1:${port}`;
    return {
      baseUrl, expectedSha,
      webServer: {
        command: `${fillCommand(profile.commands.prodBuild, {})} && ${fillCommand(profile.commands.prodStart, { port })}`,
        url: baseUrl, cwd: ctx.repoRoot, timeoutMs: 900_000, env: { BUILD_SHA: expectedSha, PORT: String(port) },
      },
      detail: `a local production build stands in: ${pv.detail}`,
    };
  }
  // baseline, staging, real-org: the test environment's deployment of the base branch
  const base = profile.repo.base;
  const expectedSha = o.sha ?? (mode === 'baseline' ? o.baselineSha : null) ?? (await revParse(ctx, `origin/${base}`));
  if (!expectedSha) throw new UsageError(`cannot resolve origin/${base}; pass --sha`);
  const baseUrl = o.baseUrl ?? appUrl;
  if (!/^https?:\/\//.test(baseUrl)) throw new UsageError(`no usable app URL for ${mode} (profile environments.test.appUrl is "${appUrl}"); pass --base-url`);
  return { baseUrl, expectedSha, webServer: null, detail: `${profile.environments.test.name} at ${baseUrl}` };
}

/** Whether the app's routes sit under a [locale] segment (then baseline routes get the primary locale). */
function appUsesLocaleSegment(profile) {
  return (profile.paths.appRouteGlobs ?? []).some((g) => g.includes('locale]'));
}

/**
 * Build, run and judge a capture.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ mode: string, states?: string[]|null, unit?: string|null, baseUrl?: string|null, sha?: string|null,
 *           smoke?: boolean, dryRun?: boolean, timeoutMs?: number, port?: number, runId?: string,
 *           items?: object[] }} opts items: capture exactly these (spot recapture)
 * @param {typeof DEFAULT_HOOKS} [hooks] other slices' functions; tests inject theirs (or set ctx.captureHooks)
 * @returns {Promise<{ runId: string, capture: object|null, notReached: number, skipped: object[], command: string,
 *                     failures: { code: string, message: string }[], jobPath: string }>}
 */
export async function captureRun(ctx, opts, hooks = ctx.captureHooks ?? DEFAULT_HOOKS) {
  const mode = opts.mode;
  if (!MODES.includes(mode)) throw new UsageError(`--mode must be one of ${MODES.join(', ')}`);
  if (opts.smoke && mode !== 'branch') throw new UsageError('--smoke is a branch-mode capture');
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readArtefact(paths, 'plan', { optional: mode === 'baseline' || mode === 'real-org' });
  const unit = opts.unit ? (await readArtefact(paths, 'unit-file', { key: opts.unit })) : null;
  const baseline = mode === 'baseline' ? await readArtefact(paths, 'baseline', { optional: true }) : null;
  if (mode === 'baseline' && !plan && !baseline) throw new UsageError('a baseline capture needs baseline.json (run delivery baseline) or a plan');
  const failures = [];

  let realOrg = null;
  if (['baseline', 'full', 'staging', 'real-org'].includes(mode) && !opts.smoke) {
    try {
      const s = (await ctx.safety()).safety;
      realOrg = s.realOrg ? { observerEmail: s.realOrg.observerEmail, role: s.realOrg.role } : null;
      if (!realOrg) failures.push({ code: 'real-org', message: 'the safety file names no observer: the founder\'s organisation is not captured' });
    } catch (err) {
      if (typeof err.exit !== 'number') throw err;
      failures.push({ code: 'real-org', message: `the founder's organisation is not captured: ${err.message}` });
    }
  }
  if (mode === 'real-org' && !realOrg) throw new DeliveryError(EXIT.BLOCKED, 'real-org capture needs safety.realOrg (the observer the founder names)', { code: 'real-org' });

  const target = await resolveTarget(ctx, {
    mode, profile, hooks, unit: unit ? { branch: unit.branch } : null, sha: opts.sha ?? null,
    baseUrl: opts.baseUrl ?? null, port: opts.port, baselineSha: baseline?.base?.sha ?? null,
  });

  let built;
  if (opts.items) built = { items: opts.items, skipped: [], targets: {} };
  else {
    built = buildItems({
      mode, profile, plan, baseline, realOrg, states: opts.states ?? null, smoke: Boolean(opts.smoke),
      unit: unit ? { states: unit.unit.states, capabilities: unit.unit.capabilities } : null,
      appLocalePrefix: appUsesLocaleSegment(profile),
    });
  }
  if (plan && !opts.items) for (const r of plan.rows) if (r.markers) built.targets[r.id] = { text: r.markers.text, testids: r.markers.testids };
  if (!built.items.length) {
    throw new UsageError(`nothing to capture in ${mode} mode${built.skipped.length ? `: ${built.skipped.slice(0, 3).map((s) => `${s.state} (${s.why})`).join('; ')}` : ''}`);
  }

  const baseId = opts.runId ?? newCaptureRunId(ctx.clock, mode, opts.smoke ? `${opts.unit ?? 'run'}-smoke` : opts.unit ?? null);
  let runId = baseId;
  // A second run in the same second: number the stamp, keeping any -smoke suffix last.
  for (let n = 2; await exists(paths.captureDir(runId)); n++) runId = baseId.replace(/^([cs]-\d{8}-\d{6})/, `$1.${n}`);
  const dir = paths.captureDir(runId);
  await ensureDir(dir);
  const extractScript = join(dir, 'extract.js');
  await writeFile(extractScript, extractScriptSource());
  const probe = parseVersionProbe(profile.commands.versionProbe);
  const job = buildJob({
    runId, mode, feature: paths.feature, baseUrl: target.baseUrl, expectedSha: target.expectedSha, outDir: dir,
    extractScript, versionProbe: probe, auth: { module: join(ctx.repoRoot, profile.auth.supportModule), fn: profile.auth.signInFunction },
    webServer: target.webServer, items: built.items, targets: built.targets,
  });
  const jobPath = join(dir, 'job.json');
  await writeJsonAtomic(jobPath, job);
  const command = wrapHeavy(profile, fillCommand(profile.commands.e2e, { spec: profile.paths.captureSpec }));
  const env = { DELIVERY_CAPTURE_JOB: jobPath, E2E_BASE_URL: target.baseUrl };
  if (opts.dryRun) return { runId, capture: null, notReached: 0, skipped: built.skipped, command, failures, jobPath, env, target };

  // Fixture worlds are re-applied and scanned before anything is captured in them (spec 6.2 rule 5, 7.4).
  const worlds = [...new Set(job.items.map((i) => i.world).filter((w) => w !== REAL_ORG_WORLD && w !== BASELINE_WORLD))].sort();
  const seeding = profile.testData?.mode !== 'none';
  if (seeding && worlds.length) {
    for (const w of worlds) {
      const r = await guardGate('seed-refresh', () => hooks.refreshWorld(ctx, w));
      if (!r.ok) throw new DeliveryError(r.exit ?? EXIT.RED, `world ${w} could not be refreshed; nothing captured`, { code: 'seed-refresh', failures: r.failures });
    }
    const scan = await guardGate('seed-scan', () => hooks.seedScanGate(ctx));
    if (!scan.ok) throw new DeliveryError(scan.exit ?? EXIT.RED, 'the seed scan is red; nothing captured', { code: 'seed-scan', failures: scan.failures });
  }
  if (!target.webServer) {
    const served = await hooks.probeServedSha(ctx, target.baseUrl);
    if (served && !served.startsWith(target.expectedSha.slice(0, 7).toLowerCase()) && !target.expectedSha.toLowerCase().startsWith(served)) {
      throw new WaitError(`${target.baseUrl} serves ${served.slice(0, 12)}, not ${target.expectedSha.slice(0, 12)}; retry when the deploy finishes`, { code: 'served-sha' });
    }
  }

  const res = await ctx.runner.sh(command, { cwd: ctx.repoRoot, env, timeoutMs: opts.timeoutMs ?? 90 * 60_000 });

  // Judge from the files, never from the spec's own exit code.
  const rows = new Map((plan?.rows ?? []).map((r) => [r.id, r]));
  const inputs = await judgeInputs(dir, job.items, { mode, rows });
  const kinds = {};
  for (const w of plan?.worlds ?? []) kinds[w.id] = w.kind;
  const verdicts = judgeItems({ items: inputs, rows, worldKinds: kinds, expectedSha: target.expectedSha, primaryLocale: profile.audit.primaryLocale });
  if (res.code !== 0 && !inputs.some((i) => i.written)) {
    const tail = captureExcerpt(res);
    failures.push({ code: 'capture-run', message: `the capture command exited ${res.code}${res.timedOut ? ' (timed out)' : ''} and wrote nothing${tail ? `: ${tail}` : ''}` });
  }

  const items = job.items.map((it, n) => {
    const got = inputs[n].outputs;
    const key = itemKey(it);
    const v = verdicts[n];
    return {
      state: it.state, world: it.world, role: it.role, width: it.width, locale: it.locale, theme: it.theme,
      status: v.status, ...(v.why ? { why: v.why } : {}),
      servedSha: got.servedSha ?? '',
      files: {
        png: `${key}.png`, txt: `${key}.txt`, dom: `${key}.dom.json`,
        ...(got.hasErrorsFile ? { errors: `${key}.errors.json` } : {}),
        ...(got.hasControlsFile ? { controls: `${key}.controls.json` } : {}),
      },
      textSha256: got.txtSha256,
      createdRowIds: (got.meta?.createdRows ?? []).map((r) => String(r.id)),
    };
  });

  // Rows the clicks created are torn down, then the worlds scanned again (spec 7.4).
  const created = [];
  for (const [n, it] of job.items.entries()) {
    const ids = items[n].createdRowIds;
    if (!ids.length) continue;
    const tables = [...new Set((rows.get(it.state)?.data ?? []).map((d) => d.table))];
    if (!tables.length) { failures.push({ code: 'teardown', message: `${it.state}: rows ${ids.join(', ')} were created by clicks and the plan names no table to delete them from` }); continue; }
    for (const id of ids) for (const table of tables) created.push({ table, id });
  }
  if (created.length && seeding) {
    const td = await guardGate('teardown', () => hooks.teardownRows(ctx, created));
    if (!td.ok) failures.push(...td.failures);
    const scan = await guardGate('seed-scan', () => hooks.seedScanGate(ctx));
    if (!scan.ok) failures.push(...scan.failures);
  }

  const capture = { schemaVersion: 1, runId, mode, expectedSha: target.expectedSha, baseUrl: target.baseUrl, items };
  await writeArtefact(paths, 'capture', capture, { key: runId });
  const notReached = items.filter((i) => i.status !== 'reached').length;
  await ctx.journal({
    command: `capture ${mode}${opts.unit ? ` ${opts.unit}` : ''}${opts.smoke ? ' smoke' : ''}`,
    exit: notReached || failures.length ? EXIT.RED : EXIT.PASS,
    counts: { run: runId, items: items.length, reached: items.length - notReached, notReached, sha: target.expectedSha.slice(0, 12) },
    inputs: { job }, outputs: capture,
  });
  return { runId, capture, notReached, skipped: built.skipped, command, failures, jobPath };
}

/**
 * Write the job file, run the committed capture spec through profile.commands.heavy (the spec owns
 * its server through Playwright's webServer in branch mode), validate every item, and write
 * captures/<runId>/capture.json. Before each world: refreshWorld and seedScanGate (B2).
 * Called by the capture command (C) and gate <unit> (B1, mode "branch").
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ mode: 'baseline'|'branch'|'wave'|'full'|'staging'|'real-org', states?: string[]|null,
 *           unit?: string|null, baseUrl?: string|null, sha?: string|null }} opts
 * @returns {Promise<{ runId: string, capture: object, notReached: number }>} capture is capture.json's value
 */
export async function runCapture(ctx, opts) {
  const r = await captureRun(ctx, opts);
  for (const f of r.failures) ctx.out.warn(`${f.code}: ${f.message}`);
  return { runId: r.runId, capture: r.capture, notReached: r.notReached };
}

/**
 * What a failed capture command actually said, for the capture-run failure.
 *
 * The last line alone is worth nothing here. A Playwright run prints its error near the TOP and
 * ends with the package manager's own epitaph, so the wave-0 smoke reported "exited 1 and wrote
 * nothing: Exit status 1" over a plain ERR_CONNECTION_REFUSED twenty-five lines above it: the
 * Playwright config had no `webServer: deliveryWebServer()` and nothing was serving the base URL.
 * So the first line that names an error comes first, and the last two lines follow it.
 */
export function captureExcerpt(res, width = 400) {
  const lines = `${String(res?.stdout ?? '')}\n${String(res?.stderr ?? '')}`
    .split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return '';
  const first = lines.find((l) => /^\s*(Error\b|✘|✗|FAIL\b)|\bError:\s/.test(l));
  const picked = [...new Set([...(first ? [first] : []), ...lines.slice(-2)])];
  return picked.join(' / ').slice(0, width);
}
