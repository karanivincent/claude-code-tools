// The NEXT rule (spec 11.3, 14.1), pure: one next action, naming the skill that drives it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNext, unitsNext } from '../../lib/run/next.mjs';
import { STEPS, stepOf } from '../../lib/run/phases.mjs';

const HEAD = 'c'.repeat(40);
const green = (phase) => ({ step: stepOf(phase), gate: stepOf(phase).gate, ok: true, exit: 0, failures: [], parts: [], notes: [] });
const redV = (phase, parts, exit = 1) => {
  const failures = parts.flatMap((p) => p.result.failures);
  return { step: stepOf(phase), gate: stepOf(phase).gate, ok: false, exit, failures, parts, notes: [] };
};
const part = (id, message, exit = 1) => ({ id, result: { ok: false, failures: [{ code: id, message }], exit } });

function facts(phase, over = {}) {
  const idx = STEPS.findIndex((s) => s.phase === phase);
  const earlier = STEPS.slice(0, idx).filter((s) => s.gate).map((s) => green(s.phase));
  return {
    cli: 'delivery', feature: 'widgets', worktree: '/w/delivery-widgets', here: true,
    state: { phase, wave: 1, pr: 7, epic: 101, branch: 'epic/101-widgets' },
    inconsistent: null,
    evaluation: { earlier, leaving: green(phase), backTo: null },
    files: { preflight: true, candidates: true, inventory: true, plan: true, baseline: false, seedplan: true },
    redesign: false,
    plan: { units: [{ id: 'U1', title: 'Contracts', wave: 0, kind: 'contract' }, { id: 'U2', title: 'List', wave: 1, kind: 'screen' }] },
    units: [],
    pr: { number: 7, state: 'open', isDraft: true, headSha: HEAD, mergeable: 'MERGEABLE', baseRefName: 'main' },
    localHead: HEAD, dirty: false,
    ready: null, waveCapture: { runId: 'c1', expectedSha: HEAD }, fullCapture: null,
    findings: { openP1: 0, openP2: 0 }, redReadyHeads: [],
    limits: { builderParallel: 6, maxFixWaves: 3 }, epic: 101,
    ...over,
  };
}

const BASE = facts('intake');

test('every NEXT is one line starting with "NEXT:" and names the skill that drives it', () => {
  const SKILLS = ['deliver-from-design', 'design-inventory', 'coverage-plan', 'epic-build', 'design-audit'];
  for (const s of STEPS) {
    const n = computeNext(facts(s.phase));
    assert.match(n.line, /^NEXT: [^\n]+$/);
    if (s.skill) assert.ok(SKILLS.includes(n.skill) && n.line.endsWith(`(skill: ${n.skill})`), `${s.phase}: ${n.line}`);
  }
  assert.ok(computeNext(facts('plan')).line.endsWith('(skill: coverage-plan)'));
});

test('a green gate means advance to the next phase', () => {
  assert.equal(computeNext(facts('intake')).text, 'delivery advance preflight');
  assert.equal(computeNext(facts('plan')).text, 'delivery advance wave0');
  assert.equal(computeNext(facts('merged')).text, 'delivery advance landed');
});

test('inconsistency and tampering stop the run first', () => {
  const n = computeNext(facts('build', { inconsistent: 'state.json: journal chain broken at entry 4' }));
  assert.match(n.line, /^NEXT: stop: state\.json: journal chain broken at entry 4; nothing under \.delivery\/ may be edited by hand; run delivery report/);
  const t = facts('build');
  t.evaluation.earlier[3] = redV('plan', [part('plan', 'plan.json fails its schema', 5)], 5);
  assert.match(computeNext(t).text, /^stop: plan\.json fails its schema \(gate phase-3\)/);
});

test('an earlier gate that went red again is where the run is', () => {
  const f = facts('build');
  f.evaluation.earlier[2] = redV('inventory', [part('inventory', 'state OV-05 has no render and no reason')]);
  f.evaluation.backTo = 'inventory';
  const n = computeNext(f);
  assert.equal(n.phase, 'inventory');
  assert.match(n.line, /^NEXT: the inventory gate is red again, so the run is back in inventory: delivery design render \(state OV-05 has no render and no reason\) \(skill: design-inventory\)$/);
});

test('an unevaluable gate (a slice missing, a bad profile) comes before any work', () => {
  const f = facts('plan');
  f.evaluation.leaving = redV('plan', [part('not-implemented', 'not implemented (slice B1): planGate', 2)], 2);
  assert.match(computeNext(f).text, /delivery plugin cannot evaluate gate phase-3/);
  f.evaluation.leaving = redV('plan', [part('profile', '.claude/delivery-profile.json: /limits: missing', 2)], 2);
  assert.match(computeNext(f).text, /^fix the configuration first: \.claude\/delivery-profile\.json/);
});

test('outside the run worktree, NEXT says where to work', () => {
  assert.match(computeNext(facts('intake', { here: false })).line, /^NEXT: in \/w\/delivery-widgets \(the run's worktree: enter it with EnterWorktree first\), delivery advance preflight/);
});

test('phase steps: preflight, inventory, plan', () => {
  assert.equal(computeNext(facts('preflight', { files: { ...BASE.files, preflight: false } })).text, 'delivery preflight');
  const pf = facts('preflight');
  pf.evaluation.leaving = redV('preflight', [part('P3', 'P3: test database refused the service role', 3)], 3);
  assert.match(computeNext(pf).text, /^blocked on the founder: P3: test database refused/);
  assert.equal(computeNext(facts('inventory', { files: { ...BASE.files, candidates: false } })).text, 'delivery design candidates');
  assert.match(computeNext(facts('inventory', { files: { ...BASE.files, inventory: false } })).text, /^dispatch one delivery-extractor per screen group/);
  const inv = facts('inventory', { redesign: true });
  inv.evaluation.leaving = redV('inventory', [{ id: 'inventory', result: { ok: true, failures: [] } }, part('baseline', 'no baseline.json for a redesign')]);
  assert.equal(computeNext(inv).text, 'delivery baseline, then delivery capture --mode baseline');
  assert.match(computeNext(facts('plan', { files: { ...BASE.files, plan: false } })).text, /^write docs\/delivery\/widgets\/plan\.json/);
  const pl = facts('plan');
  pl.evaluation.leaving = redV('plan', [{ id: 'plan', result: { ok: true, failures: [] } }, part('issues', 'unit U2 has no issue')]);
  assert.equal(computeNext(pl).text, 'delivery issues sync (unit U2 has no issue)');
});

test('wave 0: claims before any builder, then units, then seeding and the capture smoke', () => {
  assert.match(computeNext(facts('wave0', { pr: null })).text, /^delivery claims open/);
  const w = facts('wave0', { files: { ...BASE.files, seedplan: false } });
  w.evaluation.leaving = redV('wave0', [{ id: 'contract-unit', result: { ok: true, failures: [] } }, part('seed-scan', 'no seed plan')]);
  assert.equal(computeNext(w).text, 'delivery seed --plan, then delivery seed --check and delivery seed --apply');
  w.units = [{ unit: 'U1', title: 'Contracts', wave: 0, status: 'pending', unitFile: '.delivery/widgets/units/U1.json', brief: '.delivery/widgets/units/U1.json', hasRecord: false }];
  assert.equal(computeNext(w).text, 'dispatch builder for U1 (Contracts); brief .delivery/widgets/units/U1.json');
});

test('units: dead builders continue on their branch, all dispatches at once; finished units never again', () => {
  const f = facts('build', {
    units: [
      { unit: 'U2', title: 'List', wave: 1, status: 'merged', hasRecord: false, unitFile: 'u/U2.json', brief: 'u/U2.json' },
      { unit: 'U3', title: 'Detail', wave: 1, status: 'reported', gateGreen: null, hasRecord: true, unitFile: 'u/U3.json', brief: 'u/U3.json' },
      { unit: 'U4', title: 'Editor', wave: 1, status: 'died', branch: 'epic/101-widgets-U4', ahead: 2, hasRecord: true, unitFile: 'u/U4.json', brief: 'u/U4.json' },
      { unit: 'U5', title: 'Words', wave: 1, status: 'dispatched', hasRecord: true, unitFile: 'u/U5.json', brief: 'u/U5.json' },
      { unit: 'U6', title: 'Shell', wave: 1, status: 'pending', hasRecord: false, unitFile: 'u/U6.json', brief: 'u/U6.json' },
    ],
  });
  const n = computeNext(f);
  assert.equal(n.text, 'dispatch builders in parallel for U4 (Editor) to continue on branch epic/101-widgets-U4; brief u/U4.json; U5 (Words); brief u/U5.json; U6 (Shell); brief u/U6.json');
  assert.doesNotMatch(n.text, /U2|U3/);
  f.units = f.units.filter((u) => ['U2', 'U3'].includes(u.unit));
  assert.equal(computeNext(f).text, 'delivery gate U3');
  f.units[1].gateGreen = true;
  assert.equal(computeNext(f).text, 'delivery wave merge U3');
  assert.equal(unitsNext({ ...f, units: [{ ...f.units[0] }] }, 1), null);
  f.units = [{ unit: 'U7', title: 'Menu', wave: 1, status: 'pending', hasRecord: false, unitFile: null, brief: null }];
  assert.equal(computeNext(f).text, 'delivery wave start (it writes the unit files for U7)');
});

test('build: wave end, the next wave, fix units, CI, then advance', () => {
  const f = facts('build', { units: [{ unit: 'U2', wave: 1, status: 'merged', hasRecord: false }] });
  assert.equal(computeNext(facts('build', { state: { ...BASE.state, phase: 'build', wave: 0 } })).text, 'delivery wave start (wave 1)');
  assert.match(computeNext({ ...f, localHead: 'd'.repeat(40) }).text, /^delivery wave end \(wave 1/);
  assert.match(computeNext({ ...f, waveCapture: null }).text, /^delivery wave end/);
  assert.equal(computeNext({ ...f, plan: { units: [...f.plan.units, { id: 'F1', title: 'Fix', wave: 2, kind: 'fix' }] } }).text, 'delivery wave start (wave 2: F1)');
  assert.match(computeNext({ ...f, findings: { openP1: 2, openP2: 1 } }).text, /^add fix units for wave 2 to plan\.json for the 2 P1 and 1 P2 findings still open/);
  const ci = { ...f, evaluation: { ...f.evaluation, leaving: redV('build', [part('ci', 'CI is pending on PR #7', 4)], 4) } };
  assert.equal(computeNext(ci).text, 'wait for CI on PR #7 (delivery ci --pr 7)');
  assert.equal(computeNext(f).text, 'delivery advance pr');
});

test('land before the merge: push, CI, full audit, ready, then gh pr ready', () => {
  const f = facts('pr');
  assert.match(computeNext({ ...f, localHead: 'd'.repeat(40) }).text, /^commit and push the integration branch/);
  assert.match(computeNext({ ...f, pr: { ...f.pr, mergeable: 'CONFLICTING' } }).text, /conflicts with its base/);
  f.evaluation.leaving = redV('pr', [part('ready', 'no ready.json for PR #7; run delivery ready --pr 7')]);
  const audit = computeNext(f);
  assert.match(audit.line, /^NEXT: full audit of the preview for c{12}: delivery capture --mode full, then delivery check all and the auditors \(skill: design-audit\)$/);
  f.fullCapture = { runId: 'c9', expectedSha: HEAD };
  assert.equal(computeNext(f).text, 'delivery ready --pr 7, after /pr-reviewer 7 --fix, delivery handover and delivery pr-body');
  f.ready = { headSha: HEAD, ok: false };
  f.evaluation.leaving = redV('pr', [part('ready-red', 'ready.json is red for cccc: severity (2 blockers)')]);
  assert.match(computeNext(f).line, /^NEXT: fix wave for what ready\.json lists as red .* \(skill: epic-build\)$/);
  f.redReadyHeads = ['a', 'b', 'c', 'd'];
  assert.equal(computeNext(f).text, 'stop: 3 fix waves left ready red; run delivery report and end the run red');
  const ok = facts('pr', { ready: { headSha: HEAD, ok: true }, fullCapture: { runId: 'c9', expectedSha: HEAD } });
  assert.equal(computeNext(ok).text, 'gh pr ready 7 (the hook checks ready.json), then delivery advance ready');
  assert.equal(computeNext({ ...ok, pr: { ...ok.pr, isDraft: false } }).text, 'delivery advance ready');
});

test('a PR marked ready without a green record for its head leads the pr step', () => {
  const f = facts('pr', { pr: { ...BASE.pr, isDraft: false }, fullCapture: { runId: 'c9', expectedSha: HEAD } });
  f.evaluation.leaving = redV('pr', [part('ready-missing', 'no ready.json')]);
  assert.match(computeNext(f).text, /^PR #7 is marked ready without a green ready record for its head; delivery ready --pr 7/);
});

test('a PR marked ready outside the hook, with no green record for its head, is put back to draft first', () => {
  const f = facts('build', { pr: { ...BASE.pr, isDraft: false }, readyCheck: { ok: false, message: 'no ready.json for PR #7' } });
  assert.equal(computeNext(f).text, 'PR #7 is marked ready for review without a green ready.json for its head (no ready.json for PR #7); put it back to draft first: gh pr ready 7 --undo');
  assert.equal(computeNext({ ...f, readyCheck: { ok: true, message: '' } }).text.startsWith('PR #7'), false);
  assert.equal(computeNext({ ...f, pr: { ...f.pr, state: 'merged' }, state: { ...f.state, phase: 'merged' } }).text.includes('--undo'), false);
});

test('after the merge a red earlier gate is reported, never undone', () => {
  const f = facts('merged');
  const i = f.evaluation.earlier.findIndex((e) => e.gate === 'phase-6');
  f.evaluation.earlier[i] = redV('pr', [part('ready-red', 'ready.json is red for cccc')]);
  assert.equal(computeNext(f).text, 'the pr gate is red after the merge (ready.json is red for cccc), which a merge cannot undo; land --check cannot pass, so the epic stays open: run delivery report, which leads with it');
});

test('after ready: wait for his merge, then land, then the epic', () => {
  const r = facts('ready');
  r.evaluation.leaving = redV('ready', [part('merge', 'PR #7 is not merged yet', 3)], 3);
  assert.equal(computeNext(r).text, "wait for the founder's merge of PR #7; print delivery report for him and stop");
  assert.equal(computeNext(facts('ready', { pr: { ...BASE.pr, state: 'merged' } })).text, 'delivery advance merged');
  const m = facts('merged');
  m.evaluation.leaving = redV('merged', [part('staging', 'E2E (staging) has not run for the merge SHA')]);
  assert.equal(computeNext(m).text, 'delivery land --epic 101 (E2E (staging) has not run for the merge SHA)');
  const l = facts('landed');
  l.evaluation.leaving = redV('landed', [part('epic-closed', 'epic #101 is still open')]);
  assert.match(computeNext(l).text, /^delivery land --epic 101; it closes the epic/);
  assert.match(computeNext(facts('closed')).text, /^nothing: the run is closed/);
});
