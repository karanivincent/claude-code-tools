// The NEXT rule (spec 11.3, 14.1): from facts recomputed by status, exactly one next action, and
// the skill that drives it. Pure: lib/run/status.mjs gathers the facts, this decides.
//
// Precedence: an inconsistency (exit 5) stops the run; an earlier phase whose gate went red again
// is where the run really is; a configuration problem comes before any work; otherwise the phase's
// own step. A finished unit (merged, or with a report) is never dispatched again.

import { isPostMerge, nextPhase, stepOf } from './phases.mjs';

/**
 * @typedef {import('./gates.mjs').StepVerdict} StepVerdict
 * @typedef {import('./resume.mjs').UnitStatus} UnitStatus
 * @typedef {object} Facts
 * @property {string} cli                 how to call the CLI, e.g. "node scripts/delivery.mjs"
 * @property {string} feature
 * @property {string} worktree            the run's integration worktree
 * @property {boolean} here               the session already works in that worktree
 * @property {{ phase: string, wave: number, pr: number|null, epic: number|null, branch: string }} state
 * @property {string|null} inconsistent   an exit-5 problem found while loading the run
 * @property {{ earlier: StepVerdict[], leaving: StepVerdict|null, backTo: string|null }} evaluation
 * @property {{ preflight: boolean, candidates: boolean, inventory: boolean, plan: boolean, baseline: boolean, seedplan: boolean }} files
 * @property {boolean} redesign
 * @property {{ units: { id: string, title: string, wave: number, kind: string }[] }|null} plan
 * @property {UnitStatus[]} units
 * @property {{ number: number, state: string, isDraft: boolean, headSha: string, mergeable: string, baseRefName: string }|null} pr
 * @property {string|null} localHead
 * @property {boolean} dirty             tracked files changed and not committed
 * @property {{ headSha: string, ok: boolean }|null} ready
 * @property {{ ok: boolean, message: string }|null} readyCheck  checkReady for an open PR marked ready
 * @property {{ runId: string, expectedSha: string }|null} waveCapture   newest wave-mode capture
 * @property {{ runId: string, expectedSha: string }|null} fullCapture   newest full-mode capture
 * @property {{ openP1: number, openP2: number }} findings  open, unaccepted
 * @property {string[]} redReadyHeads    heads whose ready came out red since entering "pr"
 * @property {{ builderParallel: number, maxFixWaves: number }} limits
 * @property {number|null} epic
 */

/** @returns {{ line: string, text: string, skill: string|null, phase: string }} */
export function computeNext(f) {
  // A session in another worktree is refused every write into the run's own, and so is every agent
  // it dispatches: enter the run's worktree first (Claude Code's EnterWorktree with this path).
  const where = f.here ? '' : `in ${f.worktree} (the run's worktree: enter it with EnterWorktree first), `;
  const make = (text, skill, phase) => ({ text: where + text, skill: skill ?? null, phase, line: `NEXT: ${where}${text}${skill ? ` (skill: ${skill})` : ''}` });

  if (f.inconsistent) {
    return make(`stop: ${f.inconsistent}; nothing under .delivery/ may be edited by hand; run ${f.cli} report, which leads with it`, 'deliver-from-design', f.state?.phase ?? 'intake');
  }
  const verdicts = [...f.evaluation.earlier, ...(f.evaluation.leaving ? [f.evaluation.leaving] : [])];
  const tampered = verdicts.find((v) => v.exit === 5);
  if (tampered) {
    return make(`stop: ${firstMessage(tampered)} (gate ${tampered.gate}); nothing under .delivery/ may be edited by hand; run ${f.cli} report, which leads with it`, 'deliver-from-design', tampered.step.phase);
  }
  // 11.6: a PR marked ready outside the hook (the web UI, an unmatched API form) with no green
  // record for its head could reach the merge queue; turning it back into a draft comes first.
  const pr = f.pr;
  if (pr && pr.state === 'open' && pr.isDraft === false && f.readyCheck && !f.readyCheck.ok && !isPostMerge(f.state.phase)) {
    return make(`PR #${pr.number} is marked ready for review without a green ready.json for its head (${f.readyCheck.message}); put it back to draft first: gh pr ready ${pr.number} --undo`, 'deliver-from-design', f.state.phase);
  }
  if (f.evaluation.backTo) {
    const v = f.evaluation.earlier.find((e) => e.step.phase === f.evaluation.backTo);
    const r = phaseNext(f, f.evaluation.backTo, v);
    return make(`the ${f.evaluation.backTo} gate is red again, so the run is back in ${f.evaluation.backTo}: ${r.text}`, r.skill, f.evaluation.backTo);
  }
  if (isPostMerge(f.state.phase)) {
    const broken = f.evaluation.earlier.find((e) => !e.ok && (e.exit === 1 || e.exit === 3));
    if (broken) {
      return make(`the ${broken.step.phase} gate is red after the merge (${firstMessage(broken)}), which a merge cannot undo; land --check cannot pass, so the epic stays open: run ${f.cli} report, which leads with it`, 'deliver-from-design', f.state.phase);
    }
  }
  const config = verdicts.find((v) => v.exit === 2);
  if (config) {
    const msg = firstMessage(config);
    const text = /not implemented/.test(msg)
      ? `the delivery plugin cannot evaluate gate ${config.gate} (${msg}); install a complete delivery-tools and run ${f.cli} status again`
      : `fix the configuration first: ${msg} (gate ${config.gate})`;
    return make(text, 'deliver-from-design', config.step.phase);
  }
  const r = phaseNext(f, f.state.phase, f.evaluation.leaving);
  return make(r.text, r.skill, f.state.phase);
}

/** The first failure's message of a verdict or result. */
export function firstMessage(v) {
  const f = v?.failures?.[0];
  return f ? f.message : 'red';
}

function part(v, id) {
  return v?.parts?.find((p) => p.id === id)?.result ?? null;
}

function redPart(v, ids) {
  for (const id of ids) {
    const r = part(v, id);
    if (r && !r.ok) return { id, result: r, message: firstMessage(r) };
  }
  return null;
}

/** The verdict of an earlier step's gate, for facts one phase needs from another (CI from phase 5). */
function earlierVerdict(f, gate) {
  return f.evaluation.earlier.find((e) => e.gate === gate) ?? null;
}

function advance(f, phase) {
  return `${f.cli} advance ${nextPhase(phase)}`;
}

/**
 * @param {Facts} f
 * @param {string} phase the phase to act in
 * @param {StepVerdict|null} v that phase's leaving gate
 * @returns {{ text: string, skill: string|null }}
 */
function phaseNext(f, phase, v) {
  const skill = stepOf(phase).skill;
  const cli = f.cli;
  const green = v?.ok === true;
  switch (phase) {
    case 'intake': {
      if (green) return { text: advance(f, phase), skill };
      const epic = redPart(v, ['epic']);
      const intake = redPart(v, ['intake']);
      if (intake) return { text: `finish intake: ${intake.message}`, skill };
      if (epic) return { text: `${cli} issues sync --epic-only (${epic.message})`, skill };
      return { text: `finish intake: ${firstMessage(v)}`, skill };
    }
    case 'preflight': {
      if (!f.files.preflight) return { text: `${cli} preflight`, skill };
      if (green) return { text: advance(f, phase), skill };
      if (v.exit === 3) return { text: `blocked on the founder: ${firstMessage(v)}; he fixes it now, or names a waiver where the probe allows one (${cli} waive <probe> --note "<his words>")`, skill };
      if (v.exit === 4) return { text: `wait and retry: ${firstMessage(v)}; then ${cli} preflight`, skill };
      return { text: `preflight is red: ${firstMessage(v)}; fix it, then ${cli} preflight`, skill };
    }
    case 'inventory': {
      if (!f.files.candidates) return { text: `${cli} design candidates`, skill };
      if (!f.files.inventory) return { text: `dispatch one delivery-extractor per screen group with briefs/extractor-design.md to write docs/delivery/${f.feature}/inventory.json, then ${cli} design render`, skill };
      if (green) return { text: advance(f, phase), skill };
      const inv = redPart(v, ['inventory']);
      if (inv) {
        if (/render/i.test(inv.message)) return { text: `${cli} design render (${inv.message})`, skill };
        return { text: `fix the inventory: ${inv.message}; then ${cli} inventory check`, skill };
      }
      const base = redPart(v, ['baseline']);
      if (base) {
        if (f.redesign && !f.files.baseline) return { text: `${cli} baseline, then ${cli} capture --mode baseline`, skill };
        return { text: `fix the baseline: ${base.message}`, skill };
      }
      return { text: `inventory gate is red: ${firstMessage(v)}`, skill };
    }
    case 'plan': {
      if (!f.files.plan) return { text: `write docs/delivery/${f.feature}/plan.json from the inventory${f.redesign ? ' and the baseline' : ''}, then ${cli} plan verify and ${cli} plan check`, skill };
      if (green) return { text: advance(f, phase), skill };
      const plan = redPart(v, ['plan']);
      if (plan) return { text: `fix the plan: ${plan.message}; then ${cli} plan check`, skill };
      const issues = redPart(v, ['issues']);
      if (issues) return { text: `${cli} issues sync (${issues.message})`, skill };
      const scope = redPart(v, ['scope']);
      if (scope) return { text: `${cli} scope post (${scope.message})`, skill };
      return { text: `plan gate is red: ${firstMessage(v)}`, skill };
    }
    case 'wave0': {
      if (!f.pr) return { text: `${cli} claims open (the draft PR claims every child before any builder starts)`, skill };
      const units = unitsNext(f, 0);
      if (units) return { text: units, skill };
      if (green) return { text: advance(f, phase), skill };
      const seed = redPart(v, ['seed-scan']);
      if (seed) {
        if (!f.files.seedplan) return { text: `${cli} seed --plan, then ${cli} seed --check and ${cli} seed --apply`, skill };
        return { text: `seed the worlds safely: ${seed.message}; ${cli} seed --check, then ${cli} seed --apply and ${cli} seed --scan`, skill };
      }
      const smoke = redPart(v, ['capture-smoke']);
      if (smoke) return { text: `run the capture smoke, one state per world on the stub routes: ${cli} capture --mode branch (${smoke.message})`, skill };
      const claims = redPart(v, ['claims']);
      if (claims) return { text: `${cli} claims verify (${claims.message})`, skill };
      const contract = redPart(v, ['contract-unit']);
      if (contract) return { text: `wave 0 is red: ${contract.message}`, skill };
      return { text: `wave-0 gate is red: ${firstMessage(v)}`, skill };
    }
    case 'build': return buildNext(f, v, skill);
    case 'pr': return prNext(f, v, skill);
    case 'ready': {
      const pr = f.pr;
      if (!pr) return { text: `the run has no PR; ${cli} report, then stop`, skill };
      if (pr.state === 'merged') return { text: advance(f, phase), skill };
      if (pr.state === 'closed') return { text: `stop: PR #${pr.number} was closed without a merge; ${cli} report`, skill };
      return { text: `wait for the founder's merge of PR #${pr.number}; print ${cli} report for him and stop`, skill };
    }
    case 'merged': {
      if (green) return { text: advance(f, phase), skill };
      const epic = f.epic ?? '<epic>';
      if (v?.exit === 4) return { text: `wait and retry: ${firstMessage(v)}; then ${cli} land --epic ${epic}`, skill };
      return { text: `${cli} land --epic ${epic} (${firstMessage(v)})`, skill };
    }
    case 'landed': {
      if (green) return { text: advance(f, phase), skill };
      return { text: `${cli} land --epic ${f.epic ?? '<epic>'}; it closes the epic through the profile's epicClose command once the staging proof is green`, skill };
    }
    case 'closed':
      return { text: `nothing: the run is closed; the production release is the founder's (the release block on epic #${f.epic ?? '?'})`, skill: null };
    default:
      return { text: `unknown phase ${phase}; ${cli} status --json`, skill: null };
  }
}

/** The dispatch, gate or merge a wave's units need, or null when every unit is merged. */
export function unitsNext(f, wave) {
  const cli = f.cli;
  const inWave = f.units.filter((u) => u.wave === wave || (u.hasRecord && u.status !== 'merged'));
  const died = inWave.filter((u) => u.status === 'died');
  const fresh = inWave.filter((u) => u.status === 'dispatched');
  const pending = inWave.filter((u) => u.status === 'pending' && u.wave === wave);
  const dispatchable = [...died, ...fresh, ...pending.filter((u) => u.unitFile)];
  if (dispatchable.length) {
    const cap = Math.max(1, f.limits?.builderParallel ?? 6);
    const shown = dispatchable.slice(0, cap).map((u) => describeDispatch(f, u));
    const more = dispatchable.length > cap ? `; then ${dispatchable.length - cap} more as builders finish` : '';
    const one = shown.length === 1;
    return `${one ? 'dispatch builder for ' : 'dispatch builders in parallel for '}${shown.join('; ')}${more}`;
  }
  if (pending.length) return `${cli} wave start (it writes the unit files for ${pending.map((u) => u.unit).join(', ')})`;
  const reported = inWave.filter((u) => u.status === 'reported');
  const mergeable = reported.find((u) => u.gateGreen === true);
  if (mergeable) return `${cli} wave merge ${mergeable.unit}`;
  if (reported.length) return `${cli} gate ${reported[0].unit}`;
  return null;
}

function describeDispatch(f, u) {
  const title = u.title ? ` (${u.title})` : '';
  const brief = u.brief ?? u.unitFile ?? `.delivery/${f.feature}/units/${u.unit}.json`;
  if (u.status === 'died') return `${u.unit}${title} to continue on branch ${u.branch}; brief ${brief}`;
  return `${u.unit}${title}; brief ${brief}`;
}

function buildNext(f, v, skill) {
  const cli = f.cli;
  const wave = f.state.wave;
  if (!wave) return { text: `${cli} wave start (wave 1)`, skill };
  const units = unitsNext(f, wave);
  if (units) return { text: units, skill };
  const pushed = f.pr && f.localHead && f.pr.headSha === f.localHead && !f.dirty;
  const ended = pushed && f.waveCapture && f.localHead && f.waveCapture.expectedSha && f.localHead.startsWith(f.waveCapture.expectedSha);
  if (!ended) return { text: `${cli} wave end (wave ${wave}: push, wait for CI, capture the preview in wave mode and audit it)`, skill: 'epic-build' };
  const later = (f.plan?.units ?? []).filter((u) => u.wave > wave);
  if (later.length) return { text: `${cli} wave start (wave ${wave + 1}: ${later.map((u) => u.id).join(', ')})`, skill };
  const { openP1, openP2 } = f.findings;
  if (openP1 + openP2 > 0) {
    return { text: `add fix units for wave ${wave + 1} to plan.json for the ${openP1} P1 and ${openP2} P2 findings still open, then ${cli} wave start`, skill };
  }
  if (v?.ok) return { text: advance(f, 'build'), skill };
  const ci = redPart(v, ['ci']);
  if (ci) {
    if (ci.result.exit === 4) return { text: `wait for CI on PR #${f.pr?.number} (${cli} ci --pr ${f.pr?.number})`, skill };
    return { text: `fix CI on PR #${f.pr?.number}: ${ci.message}`, skill };
  }
  const rest = redPart(v, ['units', 'wave-sync']);
  return { text: `build gate is red: ${rest ? rest.message : firstMessage(v)}`, skill };
}

function prNext(f, v, skill) {
  const cli = f.cli;
  const pr = f.pr;
  if (!pr) return { text: `the run has no PR; ${cli} claims open`, skill: 'epic-build' };
  const n = pr.number;
  const maxFix = f.limits?.maxFixWaves ?? 3;
  const readyRed = f.ready && !f.ready.ok;
  if (readyRed && f.redReadyHeads.length - 1 >= maxFix) {
    return { text: `stop: ${maxFix} fix waves left ready red; run ${cli} report and end the run red`, skill };
  }
  if (!f.localHead || f.localHead !== pr.headSha || f.dirty) {
    return { text: `commit and push the integration branch (git push origin ${f.state.branch}); PR #${n} is at ${String(pr.headSha).slice(0, 12)}`, skill };
  }
  if (pr.mergeable === 'CONFLICTING') return { text: `PR #${n} conflicts with its base; merge origin/<base> through ${cli} wave start and class what it brings`, skill: 'epic-build' };
  const ci = part(earlierVerdict(f, 'phase-5'), 'ci');
  if (ci && !ci.ok) {
    if (ci.exit === 4) return { text: `wait for CI on PR #${n} (${cli} ci --pr ${n})`, skill };
    return { text: `fix CI on PR #${n}: ${firstMessage(ci)}`, skill };
  }
  if (!f.fullCapture || !String(pr.headSha).startsWith(f.fullCapture.expectedSha)) {
    return { text: `full audit of the preview for ${String(pr.headSha).slice(0, 12)}: ${cli} capture --mode full, then ${cli} check all and the auditors`, skill: 'design-audit' };
  }
  if (v?.ok) {
    const marked = pr.isDraft ? `gh pr ready ${n} (the hook checks ready.json), then ` : '';
    return { text: `${marked}${cli} advance ready`, skill };
  }
  if (!f.ready || f.ready.headSha == null || !String(pr.headSha).startsWith(f.ready.headSha)) {
    const prefix = pr.isDraft ? '' : `PR #${n} is marked ready without a green ready record for its head; `;
    return { text: `${prefix}${cli} ready --pr ${n}, after /pr-reviewer ${n} --fix, ${cli} handover and ${cli} pr-body`, skill };
  }
  if (readyRed) return { text: `fix wave for what ready.json lists as red (${firstMessage(v)}), then the audit again and ${cli} ready --pr ${n}`, skill: 'epic-build' };
  return { text: `${cli} ready --pr ${n} (${firstMessage(v)})`, skill };
}
