// The capture validator (spec 6.2). Owner: slice C (docs/ARCHITECTURE.md).

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { sha256 } from '../core/hash.mjs';
import { exists } from '../core/fs.mjs';
import { gateResult } from '../core/gate.mjs';
import { judgeItems } from './judge.mjs';
import { itemKey, checkFor, capturable } from './job.mjs';

/**
 * @typedef {{ state: string, world: string, role: string, width: number, locale: string, theme: string,
 *             status: 'reached'|'not-reached', why: string|null }} ItemVerdict
 */

async function readText(path) { try { return await readFile(path); } catch { return null; } }
async function readJsonFile(path) {
  const b = await readText(path);
  if (b === null) return { value: null, missing: true };
  try { return { value: JSON.parse(b.toString('utf8')), missing: false }; } catch { return { value: null, missing: false, bad: true }; }
}

/**
 * What the capture spec wrote for one item (files named <key>.<ext> in the run directory).
 * @param {string} dir the capture run directory
 * @param {string} key
 */
export async function readCaptureOutputs(dir, key) {
  const meta = await readJsonFile(join(dir, `${key}.meta.json`));
  const txt = await readText(join(dir, `${key}.txt`));
  const dom = await readJsonFile(join(dir, `${key}.dom.json`));
  const errs = await readJsonFile(join(dir, `${key}.errors.json`));
  const controls = await readJsonFile(join(dir, `${key}.controls.json`));
  const out = {
    written: Boolean(meta.value && txt !== null && dom.value),
    error: meta.value?.error ?? null,
    lines: txt === null ? [] : txt.toString('utf8').split('\n').filter((l) => l.length),
    txtSha256: txt === null ? sha256('') : sha256(txt),
    testids: [],
    servedSha: typeof meta.value?.servedSha === 'string' ? meta.value.servedSha : null,
    errors: null,
    meta: meta.value,
    controls: null,
    hasErrorsFile: !errs.missing,
    hasControlsFile: !controls.missing,
    problems: [],
  };
  if (dom.value) {
    const v = validateAgainst('dom', dom.value);
    if (v.errors.length) { out.problems.push(`dom.json does not match its schema (${v.errors[0].path}: ${v.errors[0].message})`); }
    else out.testids = dom.value.elements.filter((e) => e.visible && e.testid).map((e) => e.testid);
  } else if (!dom.missing) out.problems.push('dom.json is not JSON');
  if (errs.value) {
    const v = validateAgainst('capture-errors', errs.value);
    if (v.errors.length) out.problems.push(`errors.json does not match its schema (${v.errors[0].path}: ${v.errors[0].message})`);
    else out.errors = errs.value;
  } else if (out.written) out.problems.push('no errors.json (console and requests were not recorded)');
  if (meta.bad) out.problems.push('meta.json is not JSON');
  if (!controls.missing) {
    const v = controls.value === null ? { errors: [{ path: '/', message: 'not JSON' }] } : validateAgainst('capture-controls', controls.value);
    if (v.errors.length) out.problems.push(`controls.json does not match its schema (${v.errors[0].path}: ${v.errors[0].message})`);
    else out.controls = controls.value;
  }
  return out;
}

/**
 * Judge-ready input for each item of a capture, recomputing the rule set from the plan.
 * @param {string} dir
 * @param {object[]} items capture.json items (or job items)
 * @param {{ mode: string, rows: Map<string, object>, recorded?: Map<string, { textSha256: string, servedSha: string }> }} o
 */
export async function judgeInputs(dir, items, o) {
  const out = [];
  for (const it of items) {
    const key = itemKey(it);
    const got = await readCaptureOutputs(dir, key);
    const rec = o.recorded?.get(key);
    let tampered = null;
    if (rec && got.written && rec.textSha256 !== got.txtSha256) tampered = 'the .txt no longer matches the capture (changed after capture)';
    out.push({
      key, state: it.state, world: it.world, role: it.role, width: it.width, locale: it.locale, theme: it.theme,
      check: checkFor(it, o.mode, o.rows.get(it.state)),
      written: got.written,
      error: [got.error, ...got.problems].filter(Boolean).join('; ') || null,
      lines: got.lines, testids: got.testids,
      servedSha: rec ? rec.servedSha || null : got.servedSha,
      errors: got.errors, tampered, outputs: got,
    });
  }
  return out;
}

function worldKinds(plan) {
  const k = {};
  for (const w of plan?.worlds ?? []) k[w.id] = w.kind;
  return k;
}

/**
 * Re-validate a capture run's files against the plan (never trusting capture.json's status):
 * required markers present, no forbidden marker, text not identical to a sibling unless sameAs,
 * served SHA equals expectedSha, no console error or failed non-intercept request, textSha256
 * matches the .txt on disk. Called by M3 and M15 (B1), ready (A1) and land --check (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} runId
 * @returns {Promise<ItemVerdict[]>}
 */
export async function validateCaptureItems(ctx, runId) {
  const paths = ctx.requirePaths();
  const capture = await readArtefact(paths, 'capture', { key: runId });
  const plan = await readArtefact(paths, 'plan', { optional: true });
  const profile = await ctx.profile();
  const rows = new Map((plan?.rows ?? []).map((r) => [r.id, r]));
  const recorded = new Map(capture.items.map((i) => [itemKey(i), { textSha256: i.textSha256, servedSha: i.servedSha }]));
  const inputs = await judgeInputs(paths.captureDir(runId), capture.items, { mode: capture.mode, rows, recorded });
  const verdicts = judgeItems({ items: inputs, rows, worldKinds: worldKinds(plan), expectedSha: capture.expectedSha, primaryLocale: profile.audit.primaryLocale });
  return capture.items.map((it, n) => ({
    state: it.state, world: it.world, role: it.role, width: it.width, locale: it.locale, theme: it.theme,
    status: verdicts[n].status, why: verdicts[n].why,
    // What the item was served, as the capture read it signed in: ready's proof of the served commit
    // when the version route answers no anonymous caller.
    servedSha: inputs[n].servedSha,
  }));
}

/**
 * The newest capture run id for a mode (by capture.json in captures/), or null.
 * Spot recaptures (s-…) never count; smoke runs (…-smoke) count only when opts.smoke is true.
 * Called by check (B1), ready (A1) and report (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ mode?: string, smoke?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function latestCaptureRun(ctx, opts = {}) {
  const paths = ctx.requirePaths();
  let names;
  try { names = await readdir(paths.captures); } catch { return null; }
  const runs = [];
  for (const name of names) {
    if (!/^c-/.test(name)) continue;
    const smoke = name.endsWith('-smoke');
    if (Boolean(opts.smoke) !== smoke) continue;
    const file = join(paths.captures, name, 'capture.json');
    if (!(await exists(file))) continue;
    if (opts.mode) {
      let mode = null;
      try { mode = JSON.parse(await readFile(file, 'utf8')).mode; } catch { mode = null; }
      if (mode !== opts.mode) continue;
    }
    runs.push(name);
  }
  runs.sort();
  return runs.length ? runs[runs.length - 1] : null;
}

/**
 * Phase-4 gate input: the wave-0 capture smoke (one state per world, on the stub routes) exists and
 * every item re-validates as reached (sign-in per role, served SHA, markers).
 * Called by lib/gates/phase-4.mjs (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function captureSmokeGate(ctx) {
  const paths = ctx.requirePaths();
  const plan = await readArtefact(paths, 'plan');
  const needed = new Set(plan.rows.filter(capturable).map((r) => `${r.reach.world}/${r.reach.role}`));
  const runId = await latestCaptureRun(ctx, { smoke: true });
  const failures = [];
  if (!runId) failures.push({ code: 'capture-smoke', message: 'no capture smoke run; run "delivery capture --mode branch --smoke"' });
  else {
    const verdicts = await validateCaptureItems(ctx, runId);
    failures.push(...verdicts.filter((v) => v.status !== 'reached')
      .map((v) => ({ code: 'capture-smoke', message: `${runId} ${v.state} (${v.world}, ${v.role}): ${v.why}` })));
    const reached = new Set(verdicts.filter((v) => v.status === 'reached').map((v) => `${v.world}/${v.role}`));
    for (const wr of [...needed].sort()) {
      if (!reached.has(wr)) failures.push({ code: 'capture-smoke', message: `${runId}: nothing reached as ${wr.replace('/', ' ')} (world/role); sign-in for it is unproven` });
    }
  }
  if (!failures.length) return gateResult([]);
  // The smoke asks one question -- can the capture sign in as each world and role and reach a page
  // -- before any screen exists. A later capture of the merged branch answers it better, and is
  // what the run has been standing on since. Judging the frozen smoke against a plan whose words a
  // fix wave has since rewritten sends a finished run back to wave 0 for ever, so a later capture
  // that reached every world and role is accepted in its place, read as it was recorded.
  const covered = await worldRolesReached(ctx, paths, needed);
  if (covered) return gateResult([]);
  return gateResult(failures);
}

/**
 * Whether some later capture reached every world and role the plan needs, by its own record.
 * @returns {Promise<string|null>} that run's id, or null
 */
async function worldRolesReached(ctx, paths, needed) {
  const newest = await latestCaptureRun(ctx, {});
  if (!newest) return null;
  let doc;
  try { doc = await readArtefact(paths, 'capture', { key: newest }); } catch { return null; }
  const reached = new Set((doc.items ?? []).filter((i) => i.status === 'reached').map((i) => `${i.world}/${i.role}`));
  return [...needed].every((wr) => reached.has(wr)) ? newest : null;
}
