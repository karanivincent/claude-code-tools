// status (spec 11.3): recompute where a run is from its sources and print exactly one NEXT line.
// Writes nothing. Shared by the status command and the SessionStart hook.

import { existsSync } from 'node:fs';
import { EXIT } from '../core/exit.mjs';
import { readArtefact } from '../core/artefacts.mjs';
import { readFindings } from '../core/findings.mjs';
import { latestCaptureRun } from '../capture/validate.mjs';
import { dep } from './compose.mjs';
import { cliPrefix, ctxForRun, trackedClean } from './context.mjs';
import { evaluateRun, verdictLine } from './gates.mjs';
import { findRunEpicNumber, findRunPr } from './github.mjs';
import { checkReady } from './ready.mjs';
import { computeNext } from './next.mjs';
import { redReadyHeadsSincePr, unitStatuses } from './resume.mjs';

/** Lines --brief may print, all included (spec 11.3 step 5). */
export const BRIEF_MAX_LINES = 12;

async function quiet(fn, fallback = null) {
  try { return await fn(); } catch { return fallback; }
}

async function captureInfo(ctx, mode) {
  return quiet(async () => {
    const runId = await dep(ctx, 'latestCaptureRun', latestCaptureRun)(ctx, { mode });
    if (!runId) return null;
    const cap = await readArtefact(ctx.requirePaths(), 'capture', { key: runId });
    return { runId, expectedSha: cap.expectedSha };
  });
}

/** Open findings not accepted, by severity (pure). */
export function openCounts(doc) {
  const open = (doc?.findings ?? []).filter((x) => x.status === 'open');
  return { openP1: open.filter((x) => x.severity === 'P1').length, openP2: open.filter((x) => x.severity === 'P2').length };
}

function unitWord(u) {
  switch (u.status) {
    case 'merged': return `${u.unit} merged`;
    case 'reported': return `${u.unit} reported${u.gateGreen === true ? ' (gate green)' : u.gateGreen === false ? ' (gate red)' : ''}`;
    case 'died': return `${u.unit} stopped with ${u.ahead} commit(s) on ${u.branch} and no report`;
    case 'dispatched': return `${u.unit} dispatched, no work on a branch yet`;
    default: return `${u.unit} not dispatched`;
  }
}

/**
 * @param {object} ctx the command's ctx
 * @param {{ worktree: string, branch: string|null, feature: string, statePath: string, state: object|null, broken: Error|null }} run
 * @param {{ brief?: boolean }} [opts]
 * @returns {Promise<{ lines: string[], next: ReturnType<typeof computeNext>, data: object, exit: number }>}
 */
export async function statusReport(ctx, run, opts = {}) {
  const rctx = await ctxForRun(ctx, run);
  const paths = rctx.requirePaths();
  const cli = cliPrefix(run.worktree, ctx.pluginRoot);
  const here = ctx.repoRoot === run.worktree;
  const empty = { earlier: [], leaving: null, backTo: null };

  if (run.broken || !run.state) {
    const message = run.broken?.message ?? 'state.json could not be read';
    const next = computeNext({ cli, feature: run.feature, worktree: run.worktree, here, state: { phase: 'intake' }, inconsistent: message, evaluation: empty });
    const exit = run.broken?.exit ?? EXIT.INCONSISTENT;
    return {
      lines: [`run ${run.feature} in ${run.worktree}: state.json is inconsistent`, `red: ${message}`, next.line],
      next, exit, data: { feature: run.feature, worktree: run.worktree, inconsistent: message, next },
    };
  }

  const state = run.state;
  let profile = null;
  try { profile = await rctx.profile(); } catch { profile = null; }
  let inconsistent = null;
  const plan = await readArtefact(paths, 'plan', { optional: true }).catch(() => null);
  const intent = await readArtefact(paths, 'intent', { optional: true }).catch(() => null);
  const ready = await readArtefact(paths, 'ready', { optional: true }).catch((err) => {
    if (err?.exit === EXIT.INCONSISTENT) inconsistent = err.message;
    return null;
  });
  const evaluation = await evaluateRun(rctx, state);
  const units = await quiet(() => unitStatuses(rctx, state, plan), []);
  const pr = await quiet(() => findRunPr(rctx, state));
  // 11.6: an open PR marked ready is compared with the ready records whatever the phase.
  let readyCheck = null;
  if (pr && pr.state === 'open' && !pr.isDraft) {
    const r = await quiet(() => dep(rctx, 'checkReady', checkReady)(rctx, { pr: pr.number }), { ok: false, failures: [{ message: 'ready.json could not be checked' }] });
    readyCheck = { ok: r.ok, message: r.ok ? '' : r.failures.map((f) => f.message).join('; ') };
  }
  const epic = await quiet(() => findRunEpicNumber(rctx, state));
  const localHead = await quiet(() => rctx.git.revParse('HEAD'));
  const dirty = !(await quiet(() => trackedClean(rctx.git), true));
  const findings = openCounts(await quiet(() => readFindings(paths, state.runId)));

  const facts = {
    cli, feature: run.feature, worktree: run.worktree, here,
    state: { phase: state.phase, wave: state.wave, pr: state.pr, epic: state.epic, branch: state.branch },
    inconsistent,
    evaluation,
    files: {
      preflight: existsSync(paths.preflight), candidates: existsSync(paths.candidates), inventory: existsSync(paths.inventory),
      plan: existsSync(paths.plan), baseline: existsSync(paths.baseline), seedplan: existsSync(paths.seedplan),
    },
    redesign: Boolean(intent?.redesign),
    plan: plan ? { units: plan.units.map((u) => ({ id: u.id, title: u.title, wave: u.wave, kind: u.kind })) } : null,
    units,
    pr: pr ? { number: pr.number, state: pr.state, isDraft: pr.isDraft, headSha: pr.headRefOid, mergeable: pr.mergeable, baseRefName: pr.baseRefName } : null,
    localHead, dirty,
    ready: ready ? { headSha: ready.headSha, ok: ready.ok } : null,
    readyCheck,
    waveCapture: await captureInfo(rctx, 'wave'),
    fullCapture: await captureInfo(rctx, 'full'),
    findings,
    redReadyHeads: redReadyHeadsSincePr(state.journal),
    limits: { builderParallel: profile?.limits?.builderParallel ?? 6, maxFixWaves: profile?.limits?.maxFixWaves ?? 3 },
    epic,
  };
  const next = computeNext(facts);
  const verdicts = [...evaluation.earlier, ...(evaluation.leaving ? [evaluation.leaving] : [])];
  const exit = inconsistent || verdicts.some((v) => v.exit === EXIT.INCONSISTENT) ? EXIT.INCONSISTENT : EXIT.PASS;

  const phaseText = `phase ${state.phase}${['wave0', 'build'].includes(state.phase) ? `, wave ${state.wave}` : ''}`;
  const prText = facts.pr ? `PR #${facts.pr.number} ${facts.pr.state === 'open' ? (facts.pr.isDraft ? 'draft' : 'ready') : facts.pr.state} at ${String(facts.pr.headSha).slice(0, 12)}${facts.pr.state === 'open' ? ` (${facts.pr.mergeable.toLowerCase()})` : ''}` : 'no PR yet';
  const header = [
    `run ${run.feature} (${state.runId}) in ${run.worktree} on ${state.branch}`,
    `${phaseText}; epic ${epic ? `#${epic}` : 'not found'}; ${prText}`,
  ];
  const redLines = [];
  if (inconsistent) redLines.push(`red ready.json: ${inconsistent}`);
  const earlyReady = readyCheck && !readyCheck.ok ? `red PR #${facts.pr.number} is marked ready for review without a green ready.json for its head: ${readyCheck.message}` : null;
  if (earlyReady) redLines.push(earlyReady);
  for (const v of verdicts) for (const fl of v.failures) redLines.push(`red ${v.gate} ${fl.code}: ${fl.message}`);
  const unitLine = units.length ? `units: ${units.map(unitWord).join('; ')}` : null;

  let lines;
  if (opts.brief) {
    const room = BRIEF_MAX_LINES - header.length - 1 - (unitLine ? 1 : 0);
    const shown = redLines.length > room ? [...redLines.slice(0, room - 1), `red: and ${redLines.length - (room - 1)} more (${cli} status)`] : redLines;
    lines = [...header, ...shown, ...(unitLine ? [unitLine] : []), next.line];
  } else {
    lines = [...header];
    if (earlyReady) lines.push(earlyReady);
    for (const v of verdicts) {
      lines.push(verdictLine(v));
      for (const fl of v.failures) lines.push(`  red ${fl.code}: ${fl.message}`);
    }
    if (inconsistent) lines.push(`red ready.json: ${inconsistent}`);
    if (unitLine) lines.push(unitLine);
    lines.push(next.line);
  }
  const data = {
    feature: run.feature, runId: state.runId, worktree: run.worktree, branch: state.branch, here,
    phase: state.phase, wave: state.wave, epic, pr: facts.pr, inconsistent,
    backTo: evaluation.backTo,
    gates: verdicts.map((v) => ({ gate: v.gate, phase: v.step.phase, ok: v.ok, exit: v.exit, failures: v.failures, notes: v.notes })),
    units, next: { text: next.text, skill: next.skill, phase: next.phase },
  };
  return { lines, next, data, exit };
}
