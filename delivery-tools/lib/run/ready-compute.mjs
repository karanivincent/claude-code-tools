// `delivery ready --pr N` (spec 4.6, 5.4, 8.3, 11.6, 12.3): recompute every ready input for the
// PR's head SHA, write ready.json, and record it (state.readyRecords and the journal, whose entry
// carries the file's sha256 so checkReady can tell it from a hand-written one).
//
// Every check is one line of ready.json. A slice that cannot answer (not implemented, a crash)
// makes its line red with that exit, so ready is never green by omission.

import { artefactHash, readArtefact, writeArtefact } from '../core/artefacts.mjs';
import { EXIT, UsageError, worstExit } from '../core/exit.mjs';
import { readFindings } from '../core/findings.mjs';
import { sha256File } from '../core/hash.mjs';
import { fillCommand } from '../core/profile.mjs';
import { formatEvent, parseEvent, updateState } from '../core/state.mjs';
import { ciStatus } from '../github/ci.mjs';
import { findDupes, undecided } from '../github/dupes.mjs';
import { lateChanges } from '../github/scope.mjs';
import { resolvePreview } from '../lifecycle/preview.mjs';
import { refreshBaseline } from '../baseline/refresh.mjs';
import { CHECK_IDS, runChecks } from '../checks/index.mjs';
import { readyBlockers } from '../checks/severity.mjs';
import { latestCaptureRun, validateCaptureItems } from '../capture/validate.mjs';
import { spotRecapture } from '../capture/spot.mjs';
import { probeServedSha } from '../capture/served-sha.mjs';
import { EXIT_MEANING, dep, normalise } from './compose.mjs';
import { requireRunState, trackedClean } from './context.mjs';
import { matchesAny } from './glob.mjs';
import { captureEvidence, readyInputs, sameSha, shortSha } from './ready.mjs';

const BUILT = new Set(['keep', 'change', 'new', 'adapt']);
const STATE_ID = /^[A-Z]{1,6}-\d{2,3}$/;
const CAP_ID = /^CAP-\d{3}$/;

/** A plan row for a designed state (capability rows are CAP-nnn, which the state pattern also fits). */
export function isStateRow(row) {
  return STATE_ID.test(row.id) && !CAP_ID.test(row.id);
}

/**
 * ready.json counts (pure).
 * @param {object|null} plan
 * @param {{ findings: object[] }|null} findingsDoc
 * @param {{ status: string }[]} verdicts the capture's re-validated items
 */
export function readyCounts(plan, findingsDoc, verdicts) {
  const rows = plan?.rows ?? [];
  const built = rows.filter((r) => isStateRow(r) && BUILT.has(r.class));
  const f = findingsDoc?.findings ?? [];
  return {
    statesBuilt: built.length,
    cut: rows.filter((r) => r.class === 'cut').length,
    adapted: rows.filter((r) => r.class === 'adapt').length,
    invented: rows.filter((r) => r.invented === true).length,
    removed: rows.filter((r) => r.class === 'remove').length,
    acceptedP2: f.filter((x) => x.severity === 'P2' && x.status === 'accepted').length,
    p3Filed: f.filter((x) => x.severity === 'P3' && x.status === 'filed').length,
    notReached: (verdicts ?? []).filter((v) => v.status === 'not-reached').length,
    propOrUnseedable: built.filter((r) => r.reach && ['prop', 'unseedable'].includes(r.reach.class)).length,
    reAudits: f.reduce((n, x) => n + (Number(x.reAudits) || 0), 0),
  };
}

/** The newest loop-test result journalled for a head SHA, or null (pure). */
export function loopTestEvidence(journal, headSha) {
  let found = null;
  for (const e of journal ?? []) {
    const { command, exit, counts } = parseEvent(e.event);
    if (command === 'loop-test' && counts.sha && sameSha(counts.sha, headSha)) found = { exit, at: e.at };
  }
  return found;
}

/** The served SHA as the newest full capture of the head saw it, signed in, on every item. */
async function servedByCapture(ctx, headSha) {
  const runId = await dep(ctx, 'latestCaptureRun', latestCaptureRun)(ctx, { mode: 'full' });
  if (!runId) return { ok: false, why: 'and no full capture exists to prove it' };
  const cap = await readArtefact(ctx.requirePaths(), 'capture', { key: runId }).catch(() => null);
  if (!cap || !sameSha(cap.expectedSha, headSha)) return { ok: false, why: `and the newest full capture is not of the head` };
  const seen = (await dep(ctx, 'validateCaptureItems', validateCaptureItems)(ctx, runId)).filter((v) => v.servedSha);
  const other = seen.find((v) => !sameSha(v.servedSha, headSha));
  if (other) return { ok: false, why: `capture ${runId} saw ${shortSha(other.servedSha)} on ${other.state}` };
  if (!seen.length) return { ok: false, why: `capture ${runId} recorded no served SHA` };
  return { ok: true, runId, items: seen.length };
}

async function changedPaths(git, base) {
  for (const ref of [`origin/${base}`, base]) {
    const mb = await git.mergeBase(ref, 'HEAD');
    if (mb) return git.diffNames(mb, 'HEAD');
  }
  return null;
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ pr: number }} opts
 * @returns {Promise<{ ready: object, exit: number, digest: string, notes: string[] }>} notes: runChecks' lines worth printing
 */
export async function computeReady(ctx, { pr }) {
  const { paths, state } = await requireRunState(ctx);
  const profile = await ctx.profile();
  const pull = await ctx.gh.prGet(pr);
  if (!pull) throw new UsageError(`PR #${pr} not found in ${ctx.gh.repo}`);
  if (pull.state !== 'open') throw new UsageError(`PR #${pr} is ${pull.state}; ready applies before the merge, and delivery land after it`);
  const headSha = pull.headRefOid;
  if (!headSha) throw new UsageError(`PR #${pr} reports no head SHA`);
  const head = shortSha(headSha);

  const checks = [];
  const exits = [];
  const add = (id, ok, detail, evidence = '', exit = EXIT.RED) => {
    checks.push({ id, ok, detail, evidence });
    if (!ok) exits.push(exit || EXIT.RED);
  };
  const attempt = async (id, fn) => {
    try {
      await fn();
    } catch (err) {
      const known = err && typeof err.exit === 'number';
      add(id, false, known ? err.message : `internal: ${err?.message ?? err}`, '', known ? err.exit : EXIT.USAGE);
    }
  };

  // 5.4: capabilities that landed on the base since the run began get a plan row first, so the
  // head check below sees the plan change they cause.
  await attempt('baseline-refresh', async () => {
    if ((await artefactHash(paths, 'baseline')) === 'absent') return add('baseline-refresh', true, 'no baseline: not a redesign');
    const { added, unclassed } = await dep(ctx, 'refreshBaseline', refreshBaseline)(ctx);
    if (unclassed.length) return add('baseline-refresh', false, `${unclassed.length} capability(ies) landed on the base with no plan row: ${unclassed.slice(0, 5).join(', ')}`, 'baseline.json');
    add('baseline-refresh', true, `${added.length} capability(ies) that landed since the run began are classed`, 'baseline.json');
  });

  await attempt('head', async () => {
    const local = await ctx.git.revParse('HEAD');
    const clean = await trackedClean(ctx.git);
    if (!clean) return add('head', false, 'tracked files are changed and not committed; commit and push, then run ready again', `HEAD ${local}`);
    if (local !== headSha) return add('head', false, `local HEAD ${shortSha(local)} is not the PR head ${head}; push, then run ready again`, `HEAD ${local}`);
    add('head', true, `local HEAD is the PR head ${head}`, `HEAD ${local}`);
  });

  await attempt('ci', async () => {
    const s = await dep(ctx, 'ciStatus', ciStatus)(ctx, { pr, wait: false });
    const detail = s.detail ? `: ${s.detail}` : '';
    if (s.headSha && !sameSha(s.headSha, headSha)) return add('ci', false, `CI reported for ${shortSha(s.headSha)}, not the head ${head}`, '', EXIT.WAIT);
    if (s.state === 'green') return add('ci', true, `every required check is green on ${head}${detail}`, 'ciStatus');
    if (s.state === 'pending') return add('ci', false, `CI is pending on ${head}${detail}`, 'ciStatus', EXIT.WAIT);
    if (s.state === 'conflicting') return add('ci', false, `PR #${pr} is mergeable: CONFLICTING, so no CI runs at all`, 'ciStatus');
    add('ci', false, `CI is red on ${head}${detail}`, 'ciStatus');
  });

  let previewUrl = '';
  await attempt('preview', async () => {
    if (profile.environments?.previews === 'none') return add('preview', true, 'no previews: a local production build stands in');
    const p = await dep(ctx, 'resolvePreview', resolvePreview)(ctx, { sha: headSha });
    if (p.pending) return add('preview', false, `the preview for ${head} is not built yet${p.detail ? `: ${p.detail}` : ''}`, '', EXIT.WAIT);
    if (!p.url) return add('preview', false, `no preview serves ${head}${p.detail ? `: ${p.detail}` : ''}`);
    previewUrl = p.url;
    add('preview', true, `resolved by SHA ${head}`, p.url);
  });
  if (previewUrl) {
    await attempt('served-sha', async () => {
      const served = await dep(ctx, 'probeServedSha', probeServedSha)(ctx, previewUrl);
      if (!served) {
        // A version route behind sign-in never answers this anonymous probe (a repository whose
        // middleware sends it to /login). The full capture of the head read the served SHA on every item after signing
        // in, so it is the proof, provided every item that recorded one saw the head.
        const proof = await servedByCapture(ctx, headSha);
        if (proof.ok) return add('served-sha', true, `the version route answers a signed-in session only; the full capture ${proof.runId} signed in and saw the head ${head} on ${proof.items} item(s)`, proof.runId);
        return add('served-sha', false, `the version route of ${previewUrl} did not answer, so the served commit is unproven${proof.why ? ` (${proof.why})` : ''}`);
      }
      if (!sameSha(served, headSha)) return add('served-sha', false, `the preview serves ${shortSha(served)}, not the head ${head}`, served);
      add('served-sha', true, `the preview serves the head ${head}`, served);
    });
  }

  await attempt('dupes', async () => {
    const hits = await dep(ctx, 'findDupes', findDupes)(ctx);
    const red = undecided(hits);
    if (red.length) return add('dupes', false, `${red.length} other PR(s) claim this run's work: ${red.slice(0, 5).map((h) => `#${h.pr} (${h.reason})`).join(', ')}`);
    const decided = hits.filter((h) => h.decided);
    if (decided.length) return add('dupes', true, `${decided.length} overlap(s) decided: ${decided.map((h) => `#${h.pr} (${h.note})`).join('; ')}`);
    add('dupes', true, 'no other PR references a claimed child or touches a claimed path');
  });

  const owedAfterMerge = [];
  await attempt('loop-test', async () => {
    const lt = profile.commands.loopTest;
    const changed = await changedPaths(ctx.git, profile.repo.base);
    if (changed === null) return add('loop-test', false, `cannot list the paths this branch changes against ${profile.repo.base}`);
    const hits = changed.filter((p) => matchesAny(p, lt.when));
    if (!hits.length) return add('loop-test', true, 'not owed: no changed path matches loopTest.when');
    const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
    const epic = state.epic ?? plan?.epic ?? null;
    let code = loopTestEvidence(state.journal, headSha)?.exit ?? null;
    if (code !== 0 && code !== 6) {
      const cmd = fillCommand(lt.command, { epic, pr });
      const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs: 45 * 60_000 });
      code = r.code;
      await ctx.journal({ command: 'loop-test', exit: code, counts: { sha: headSha, target: 'preview' }, inputs: { cmd }, outputs: { code } });
    }
    if (code === 0) return add('loop-test', true, `passed on the preview (${hits.length} voice-path file(s) changed)`, 'journal: loop-test');
    if (code === 6) {
      owedAfterMerge.push(`loop test: the preview cannot be dialled while the inbound leg routes to staging; land runs it on staging (${fillCommand(lt.stagingCommand, { epic })})`);
      return add('loop-test', true, 'owed after the merge (broker exit 6), run by land on staging', 'journal: loop-test');
    }
    if (code === 4) return add('loop-test', false, 'the loop-test allowance is spent until its reset: wait and retry, never skip', 'journal: loop-test', EXIT.WAIT);
    if (code === 3) return add('loop-test', false, 'the loop test completed and its evidence failed (exit 3), a P1', 'journal: loop-test');
    add('loop-test', false, `the loop test could not complete (exit ${code})`, 'journal: loop-test');
  });

  let captureRunId = null;
  let verdicts = [];
  await attempt('capture', async () => {
    captureRunId = await dep(ctx, 'latestCaptureRun', latestCaptureRun)(ctx, { mode: 'full' });
    if (!captureRunId) return add('capture', false, `no full-mode capture; run delivery capture --mode full on the preview of ${head}`);
    const evidence = captureEvidence(captureRunId);
    const cap = await readArtefact(paths, 'capture', { key: captureRunId });
    if (!sameSha(cap.expectedSha, headSha)) return add('capture', false, `capture ${captureRunId} is of ${shortSha(cap.expectedSha)}, not the head ${head}; capture the head`, evidence);
    verdicts = await dep(ctx, 'validateCaptureItems', validateCaptureItems)(ctx, captureRunId);
    const nr = verdicts.filter((v) => v.status === 'not-reached');
    if (nr.length) return add('capture', false, `${nr.length} of ${verdicts.length} item(s) re-validate as not reached: ${nr.slice(0, 5).map((v) => `${v.state} (${v.why ?? 'not reached'})`).join(', ')}`, evidence);
    add('capture', true, `${verdicts.length} item(s) re-validated as reached`, evidence);
  });

  const checkNotes = [];
  await attempt('checks', async () => {
    const ids = [...dep(ctx, 'CHECK_IDS', CHECK_IDS)];
    const res = await dep(ctx, 'runChecks', runChecks)(ctx, ids, { captureRunId, record: true });
    const failures = res.failures ?? [];
    checkNotes.push(...(res.notes ?? []));
    // runChecks' exit is the most serious non-red exit a check asked for (M13 refusing a seed
    // is 3, blocked on the founder); it is never green, with or without failure lines.
    const asked = typeof res.exit === 'number' && res.exit > EXIT.RED ? res.exit : null;
    if (failures.length || asked) {
      const lines = failures.length ? `${failures.length} check failure(s): ${failures.slice(0, 4).map((f) => `${f.code} ${f.message}`).join('; ')}` : 'no failure line';
      return add('checks', false, asked ? `${lines}; exit ${asked}, ${EXIT_MEANING[asked] ?? 'unknown'}` : lines, 'findings.json', asked ?? EXIT.RED);
    }
    const hints = (res.hints ?? []).length;
    add('checks', true, `${ids.length} checks ran; ${(res.findings ?? []).length} finding(s) recorded${hints ? `; ${hints} advisory hint(s)` : ''}`, 'findings.json');
  });

  if (captureRunId) {
    await attempt('spot', async () => {
      const pct = profile.limits.spotRecapturePct;
      const r = normalise('spot', await dep(ctx, 'spotRecapture', spotRecapture)(ctx, { runId: captureRunId, pct, seed: headSha }));
      if (!r.ok) return add('spot', false, r.failures.slice(0, 3).map((f) => f.message).join('; '), '', r.exit ?? EXIT.RED);
      add('spot', true, `a ${pct}% sample (at least five states) re-captured with unchanged visible text`);
    });
  }

  await attempt('severity', async () => {
    const doc = await readFindings(paths, state.runId);
    const plan = await readArtefact(paths, 'plan');
    const blockers = dep(ctx, 'readyBlockers', readyBlockers)(doc, plan, profile);
    if (blockers.length) return add('severity', false, `${blockers.length} blocker(s): ${blockers.slice(0, 4).map((b) => b.message).join('; ')}`, 'findings.json');
    add('severity', true, 'no open P1; every open P2 accepted with a reason class, within the caps', 'findings.json');
  });

  let late = [];
  await attempt('late-changes', async () => {
    late = (await dep(ctx, 'lateChanges', lateChanges)(ctx)).map((c) => `${c.row}: ${c.from} -> ${c.to}${c.scopeLine ? ` (${c.scopeLine})` : ''}`);
  });

  const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
  const findingsDoc = await readFindings(paths, state.runId).catch(() => null);
  const at = ctx.clock.now().toISOString();
  const ok = checks.length > 0 && checks.every((c) => c.ok);
  const ready = {
    schemaVersion: 1,
    headSha,
    previewUrl,
    generatedAt: at,
    cli: { version: ctx.cli.version, manifestSha256: ctx.cli.manifestSha256 ?? 'none' },
    inputs: await readyInputs(ctx, { captureRunId }),
    checks,
    counts: readyCounts(plan, findingsDoc, verdicts),
    lateChanges: late,
    waivers: state.waivers.map((w) => `${w.probe}: ${w.note}`),
    owedAfterMerge,
    ok,
  };
  await writeArtefact(paths, 'ready', ready);
  const digest = await sha256File(paths.ready);
  const exit = ok ? EXIT.PASS : (worstExit(exits) || EXIT.RED);
  await updateState(paths, (s) => ({ ...s, pr: s.pr ?? pr, readyRecords: [...s.readyRecords, { sha: headSha, ok, at, readySha256: digest }] }), {
    at, event: formatEvent({ command: 'ready', exit, counts: { sha: headSha, ok, red: checks.filter((c) => !c.ok).length } }),
    inputs: ready.inputs, outputs: digest,
  });
  return { ready, exit, digest, notes: checkNotes };
}
