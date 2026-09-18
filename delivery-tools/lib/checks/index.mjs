// The check registry (spec 8.1). Owner: slice B1 (docs/ARCHITECTURE.md); M2 and M13 live in B2's
// files (lib/baseline/diff.mjs, lib/seed/safety.mjs) and are called from here.
//
// Each check returns findings (recorded under source check:<id> with the severity policy applied),
// failures (lines that make the check red without being a finding: M1, M13, M15, a missing input),
// and, for the advisory M5 and M6, hints that go to the auditors instead of findings.json.

import { join } from 'node:path';
import { writeJsonAtomic } from '../core/fs.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { recordFindings } from '../core/findings.mjs';
import { DeliveryError, UsageError, worstExit } from '../core/exit.mjs';
import { checkM2 } from '../baseline/diff.mjs';
import { seedCheckGate } from '../seed/safety.mjs';
import { checkPlan } from '../plan/check.mjs';
import { loadCheckEnv } from './env.mjs';
import { applySeverityPolicy } from './severity.mjs';
import M3 from './m3.mjs';
import M4 from './m4.mjs';
import { M5, M6 } from './m5-m6.mjs';
import M7 from './m7.mjs';
import M8 from './m8.mjs';
import M9 from './m9.mjs';
import M10 from './m10.mjs';
import { M11, M14 } from './m11-m14.mjs';
import M12 from './m12.mjs';
import M15 from './m15.mjs';
import M16 from './m16.mjs';
import M17 from './m17.mjs';

/** Every mechanical check id. M5 and M6 are advisory until the replay proves them (spec 8.1). */
export const CHECK_IDS = Object.freeze(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17']);

/**
 * Checks whose output is advisory: filed as hints for the auditors, never as findings that gate.
 * Remove an id from here once the replay of spec 20.3 has proved that check.
 */
export const ADVISORY = Object.freeze(new Set(['M5', 'M6']));

const M1 = {
  id: 'M1',
  needsCapture: false,
  async run(env) {
    if (!env.plan) return { findings: [], failures: [{ code: 'M1', message: `no plan at ${env.paths.plan}` }] };
    const baseline = await readArtefact(env.paths, 'baseline', { optional: true });
    const intent = await readArtefact(env.paths, 'intent', { optional: true });
    const failures = checkPlan({ plan: env.plan, inventory: env.inventory, baseline, intent, profile: env.profile })
      .map((f) => ({ code: 'M1', message: `${f.code}: ${f.message}` }));
    return { findings: [], failures };
  },
};

const M2 = {
  id: 'M2',
  needsCapture: false,
  async run(env) {
    const findings = await checkM2(env.ctx, {});
    return { findings, failures: [], inScope: () => true };
  },
};

const M13 = {
  id: 'M13',
  needsCapture: false,
  async run(env) {
    const r = await seedCheckGate(env.ctx, {});
    return { findings: [], failures: r.failures.map((f) => ({ code: 'M13', message: `${f.code}: ${f.message}` })), exit: r.ok ? undefined : r.exit };
  },
};

export const CHECKS = Object.freeze({ M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12, M13, M14, M15, M16, M17 });

/**
 * Which checks each capture mode runs (spec 9); "none" is for `check all` with no capture yet.
 * Checks that need no capture (M1, M2, M8, M13) run in every audit mode that runs "all M-checks".
 */
export const MODE_CHECKS = Object.freeze({
  baseline: [],
  branch: ['M3', 'M4', 'M7', 'M9', 'M10', 'M15'],
  wave: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M13', 'M14', 'M15', 'M16', 'M17'],
  full: [...CHECK_IDS],
  staging: ['M3', 'M7', 'M10', 'M12', 'M15'],
  'real-org': ['M12'],
  none: ['M1', 'M2', 'M8', 'M13'],
});

/**
 * Run checks and record their findings (source check:<id>) in findings.json.
 * M13 produces failures, never findings (it refuses the seed).
 * Called by the check and gate commands (B1), ready (A1) and land --check (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string[]} ids a subset of CHECK_IDS
 * @param {{ captureRunId?: string|null, record?: boolean }} [opts] record defaults to true
 * @returns {Promise<{ findings: import('../core/findings.mjs').Finding[], failures: import('../core/gate.mjs').GateFailure[] }>}
 *   also carries hints (M5, M6), notes (lines worth printing), captureRunId and exit (the most
 *   serious non-red exit a check asked for, such as 3 from M13)
 */
export async function runChecks(ctx, ids, opts = {}) {
  return runChecksWith(ctx, ids, opts, {});
}

/**
 * runChecks with injectable pieces, for tests: deps.checks overrides registry entries, and each
 * check receives deps.checkOpts (for example a stub validateCaptureItems for M3).
 */
export async function runChecksWith(ctx, ids, opts = {}, deps = {}) {
  const unknown = ids.filter((id) => !CHECK_IDS.includes(id));
  if (unknown.length) throw new UsageError(`unknown check ${unknown.join(', ')}; one of ${CHECK_IDS.join(', ')} or all`);
  const registry = { ...CHECKS, ...(deps.checks ?? {}) };
  const needsCapture = ids.some((id) => registry[id].needsCapture);
  const env = await loadCheckEnv(ctx, { captureRunId: opts.captureRunId ?? null, needsCapture });
  const record = opts.record !== false;
  const out = { findings: [], failures: [], hints: [], notes: [], captureRunId: env.capture?.runId ?? null, exit: undefined };
  const fixedIn = env.capture?.runId ?? (await ctx.git.revParse('HEAD').catch(() => null)) ?? 'unknown';

  for (const id of ids) {
    const check = registry[id];
    if (check.needsCapture && !env.capture) {
      out.failures.push({ code: id, message: `${id} needs a capture run and there is none; run delivery capture first` });
      continue;
    }
    let res;
    try {
      res = await check.run(env, deps.checkOpts ?? {});
    } catch (err) {
      if (!(err instanceof DeliveryError) && typeof err?.exit !== 'number') throw err;
      if (err.exit === 4) throw err; // wait and retry: the caller must see it
      for (const f of err.failures ?? [{ code: err.code, message: err.message }]) out.failures.push({ code: id, message: `${f.code}: ${f.message}` });
      if (err.exit !== 1) out.exit = worstExit([out.exit ?? 0, err.exit]);
      continue;
    }
    out.failures.push(...(res.failures ?? []));
    out.notes.push(...(res.notes ?? []));
    if (res.exit !== undefined && res.exit !== 1) out.exit = worstExit([out.exit ?? 0, res.exit]);
    const hints = [...(res.hints ?? []), ...(ADVISORY.has(id) ? res.findings ?? [] : [])];
    if (hints.length || ADVISORY.has(id)) {
      out.hints.push(...hints);
      if (record) await writeJsonAtomic(join(env.paths.runDir, 'hints', `${id}.json`), { check: id, captureRunId: env.capture?.runId ?? null, hints });
    }
    if (ADVISORY.has(id)) continue;
    const fresh = (res.findings ?? []).map((f) => applySeverityPolicy(f, env.rows));
    out.findings.push(...fresh);
    if (record && res.inScope) {
      await recordFindings(env.paths, env.runId, { source: `check:${id}`, fresh, fixedIn, inScope: res.inScope });
    }
  }
  return out;
}
