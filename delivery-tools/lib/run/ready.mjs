// Ready (spec 4.6 step 8, 11.4, 11.6). Owner: slice A1 (docs/ARCHITECTURE.md).
//
// `delivery ready --pr N` recomputes everything and writes ready.json for the PR's head SHA
// (lib/run/ready-compute.mjs). checkReady is the fast verification the pre-bash hook, phase 6,
// land and the report use: it never recomputes a check, it proves that the ready.json on disk was
// written by `delivery ready` (its hash is in the journal), is green, is for the PR's current head,
// and that none of its inputs changed since. A hand-written ready.json therefore has no effect.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXIT } from '../core/exit.mjs';
import { gateResult } from '../core/gate.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { artefactHash } from '../core/artefacts.mjs';
import { sha256, sha256File } from '../core/hash.mjs';
import { loadState, parseEvent } from '../core/state.mjs';

/** The keys of ready.json's inputs, in schema order. */
export const READY_INPUTS = Object.freeze(['plan', 'inventory', 'baseline', 'capture', 'findings', 'safety']);

/** The `capture` check's evidence names the capture manifest ready used, relative to the run dir. */
export const CAPTURE_EVIDENCE_RE = /^captures\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/capture\.json$/;

/** @param {string} runId */
export function captureEvidence(runId) {
  return `captures/${runId}/capture.json`;
}

/** The capture run a ready.json was computed from, or null. */
export function captureRunIdOf(ready) {
  const ev = ready?.checks?.find((c) => c.id === 'capture')?.evidence ?? '';
  return ev.match(CAPTURE_EVIDENCE_RE)?.[1] ?? null;
}

/** Two SHAs name the same commit when one is a prefix of the other (both at least 7 hex). */
export function sameSha(a, b) {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 12) : '(none)';
}

async function fileHash(path) {
  try { return await sha256File(path); } catch (err) {
    if (err.code === 'ENOENT') return 'absent';
    throw err;
  }
}

async function safetyHash(ctx) {
  try {
    return (await ctx.safety()).sha256;
  } catch {
    try {
      const profile = await ctx.profile();
      return await fileHash(join(ctx.repoRoot, profile.safetyFile));
    } catch {
      return 'absent';
    }
  }
}

/**
 * The sha256 of every ready input as it is on disk now ("absent" when missing).
 * @param {object} ctx
 * @param {{ captureRunId: string|null }} opts the capture run ready used
 */
export async function readyInputs(ctx, { captureRunId }) {
  const paths = ctx.requirePaths();
  return {
    plan: await artefactHash(paths, 'plan'),
    inventory: await artefactHash(paths, 'inventory'),
    baseline: await artefactHash(paths, 'baseline'),
    capture: captureRunId ? await fileHash(paths.captureManifest(captureRunId)) : 'absent',
    findings: await artefactHash(paths, 'findings'),
    safety: await safetyHash(ctx),
  };
}

/** "M3 (1 state not reached); ci (pending)" for a ready.json's red checks. */
export function redChecksText(ready, max = 4) {
  const red = (ready.checks ?? []).filter((c) => !c.ok);
  if (!red.length) return 'no check is red, but ok is false';
  const shown = red.slice(0, max).map((c) => `${c.id} (${c.detail || 'red'})`);
  return shown.join('; ') + (red.length > max ? `; and ${red.length - max} more` : '');
}

/**
 * The ready --check logic: ready.json exists, validates, is ok, its headSha is the PR's current head,
 * and every input hash still matches the file on disk. Never recomputes the checks themselves.
 * Called by the pre-bash hook (A1), land --check (A2) and report (C).
 *
 * Also proves the file was written by `delivery ready`: its sha256 must be the output of a `ready`
 * entry in the journal (exit 5 when it is not). For a merged PR the input hashes are not compared:
 * the merged head's record is history, and the audit on staging adds findings after the merge.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number }} opts
 * @returns {Promise<import('../core/gate.mjs').GateResult & { headSha: string|null }>}
 */
export async function checkReady(ctx, { pr }) {
  const paths = ctx.requirePaths();
  const fix = `run delivery ready --pr ${pr}`;
  const pull = await ctx.gh.prGet(pr);
  if (!pull) return { ...gateResult([{ code: 'ready', message: `PR #${pr} not found in ${ctx.gh.repo}` }], EXIT.USAGE), headSha: null };
  const headSha = pull.headRefOid || null;

  let bytes;
  try {
    bytes = await readFile(paths.ready);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { ...gateResult([{ code: 'ready-missing', message: `no ready.json for PR #${pr}; ${fix}` }], EXIT.RED), headSha };
  }
  let ready;
  try {
    ready = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ...gateResult([{ code: 'ready-invalid', message: `ready.json is not valid JSON; only delivery ready writes it; ${fix}` }], EXIT.INCONSISTENT), headSha };
  }
  const { errors } = validateAgainst('ready', ready);
  if (errors.length) {
    const e = errors[0];
    return { ...gateResult([{ code: 'ready-invalid', message: `ready.json does not match its schema (${e.path}: ${e.message}); only delivery ready writes it; ${fix}` }], EXIT.INCONSISTENT), headSha };
  }

  const failures = [];
  let exit = EXIT.RED;
  const digest = sha256(bytes);
  if (!existsSync(paths.state)) {
    return { ...gateResult([{ code: 'ready', message: `no state.json for run ${paths.feature} in this worktree, so ready.json cannot be proven` }], EXIT.USAGE), headSha };
  }
  const state = await loadState(paths.state);
  const recorded = state.journal.some((e) => e.outputs === digest && parseEvent(e.event).command === 'ready');
  if (!recorded) {
    failures.push({ code: 'ready-unrecorded', message: `ready.json was not written by delivery ready (its hash is in no journal entry); ${fix}` });
    exit = EXIT.INCONSISTENT;
  }
  if (!headSha || !sameSha(ready.headSha, headSha)) {
    failures.push({ code: 'ready-stale', message: `ready.json is for ${shortSha(ready.headSha)}, but PR #${pr} is at ${shortSha(headSha)}; ${fix}` });
  }
  if (!ready.ok) {
    failures.push({ code: 'ready-red', message: `ready.json is red for ${shortSha(ready.headSha)}: ${redChecksText(ready)}` });
  }
  if (pull.state !== 'merged') {
    const now = await readyInputs(ctx, { captureRunId: captureRunIdOf(ready) });
    for (const k of READY_INPUTS) {
      if (now[k] !== ready.inputs[k]) {
        failures.push({ code: 'ready-stale', message: `${k} changed since ready.json was written (${label(ready.inputs[k])} -> ${label(now[k])}); ${fix}` });
      }
    }
  }
  return { ...gateResult(failures, failures.length ? exit : undefined), headSha };
}

function label(hash) {
  return hash === 'absent' ? 'absent' : String(hash).slice(0, 12);
}
