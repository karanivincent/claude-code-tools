// Severity policy (spec 8.3), pure. A check's finding carries the severity its rule gives it
// (spec 8.1), raised one level on a day-one state; nobody can lower it: every read recomputes the
// floor from the source and rule, so an edited findings.json changes nothing. An auditor's finding
// in a P1 category is P1 whatever the auditor wrote.

import { M7_RULES } from './copy-lint.mjs';
import { M8_RULES } from './message-lint.mjs';

const RANK = { P3: 1, P2: 2, P1: 3 };

/** @param {string} a @param {string} b */
export function maxSeverity(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** P3 to P2, P2 to P1 (spec 8.3, day-one states). */
export function raiseSeverity(s) {
  return s === 'P3' ? 'P2' : 'P1';
}

const m7 = Object.fromEntries(Object.entries(M7_RULES).map(([k, v]) => [k, v.severity]));

/** The floor for every rule a check writes, by check id (spec 8.1's severity column). */
export const RULE_FLOORS = Object.freeze({
  M3: { 'not-reached': 'P1', 'not-captured': 'P1' },
  M4: { 'missing-control-label': 'P1', 'missing-heading': 'P1', 'missing-text': 'P2' },
  M7: m7,
  M8: { ...M8_RULES },
  M9: { 'control-missing': 'P1', 'dead-control': 'P1', 'wrong-target': 'P1', 'wrongly-disabled': 'P1', 'member-treatment': 'P1', 'member-not-captured': 'P1' },
  M10: { 'console-error': 'P1', 'failed-request': 'P1' },
  M11: { 'e2e-failed': 'P1' },
  M12: { invariant: 'P1', ...Object.fromEntries(Object.entries(m7).map(([k, v]) => [`copy:${k}`, v])), 'errors:console-error': 'P1', 'errors:failed-request': 'P1' },
  M14: { 'leftover-rows': 'P2', 'e2e-leftovers': 'P2' },
  M16: { 'axe-critical': 'P2', 'axe-serious': 'P2', 'axe-moderate': 'P3' },
  M17: { 'request-count': 'P3', 'load-time': 'P3' },
});

/** Checks whose findings never block ready (spec 8.1: M17 is P3 and never blocking). */
export const NEVER_BLOCKING = Object.freeze(new Set(['check:M17']));

/**
 * Auditor rule categories that are P1 whatever the auditor wrote (spec 8.2): a missing element, a
 * dead control, a wrong fact or number, something that misleads.
 */
export const AUDITOR_P1_CATEGORIES = Object.freeze(new Set([
  'missing-element', 'dead-control', 'wrong-fact', 'wrong-number', 'misleads', 'misleading',
]));

/** Reason classes a P2 may be accepted under, and no others (spec 8.3). */
export const ACCEPT_REASONS = Object.freeze(new Set(['adapt', 'data-not-in-product', 'platform-limit', 'shared-component-follow-up']));

/**
 * The severity a finding can never go below, or null when its rule sets none.
 * @param {{ source: string, rule?: string }} f
 */
export function floorOf(f) {
  const m = /^check:(M\d+)$/.exec(f.source ?? '');
  if (m) return RULE_FLOORS[m[1]]?.[f.rule ?? ''] ?? null;
  if (/^(auditor(:|$)|review$)/.test(f.source ?? '') && AUDITOR_P1_CATEGORIES.has(String(f.rule ?? '').toLowerCase())) return 'P1';
  return null;
}

/** Plan rows by id. */
export function rowsById(plan) {
  return new Map((plan?.rows ?? []).map((r) => [r.id, r]));
}

/**
 * The severity that counts: the recorded one, never below its floor, raised once for a day-one
 * state unless the finding already carries the raise (dayOne true).
 * @param {import('../core/findings.mjs').Finding} f
 * @param {Map<string, object>} rows rowsById(plan)
 * @returns {{ severity: 'P1'|'P2'|'P3', notes: string[] }}
 */
export function effectiveSeverity(f, rows) {
  const notes = [];
  let s = f.severity;
  const floor = floorOf(f);
  if (floor && maxSeverity(s, floor) !== s) { notes.push(`recorded ${s}, floor ${floor} for rule ${f.rule}`); s = floor; }
  if (!f.dayOne && rows.get(f.state)?.dayOne) {
    const raised = raiseSeverity(s);
    if (raised !== s) notes.push(`raised from ${s}: day-one state`);
    s = raised;
  }
  return { severity: s, notes };
}

/**
 * What a check applies when it writes a finding: the rule's severity (never lower) and the day-one
 * raise, recorded with dayOne true so nobody raises it twice.
 * @param {import('../core/findings.mjs').Finding} f
 * @param {Map<string, object>} rows
 */
export function applySeverityPolicy(f, rows) {
  const floor = floorOf(f);
  let severity = floor ? maxSeverity(f.severity, floor) : f.severity;
  let dayOne = f.dayOne;
  if (!dayOne && rows.get(f.state)?.dayOne) { severity = raiseSeverity(severity); dayOne = true; }
  return { ...f, severity, dayOne };
}

const describe = (f) => `${f.id} ${f.state} ${f.where}${f.rule ? ` (${f.rule})` : ''} from ${f.source}`;

/**
 * What keeps ready red under the severity policy (spec 8.3). Pure.
 * - P1: fixed, or its state cut through a Scope line; nothing else.
 * - P2: fixed; accepted with a reason class, an issue and text (adapt only on an adapt row); or cut
 *   with its state; within limits.maxAcceptedP2PerGroup and limits.maxAcceptedP2.
 * - P3: fixed or filed (M17's never block).
 * - Filing alone never catches a P1 or a P2. A check's finding is never a duplicate: only a
 *   judgement (auditor or review) can be.
 * @param {import('../core/findings.mjs').FindingsDoc} findings
 * @param {object} plan
 * @param {object} profile
 * @returns {import('../core/gate.mjs').GateFailure[]}
 */
export function readyBlockers(findings, plan, profile) {
  const rows = rowsById(plan);
  const limits = profile?.limits ?? {};
  const perGroupCap = limits.maxAcceptedP2PerGroup ?? 3;
  const runCap = limits.maxAcceptedP2 ?? 10;
  const out = [];
  const accepted = [];

  for (const f of findings?.findings ?? []) {
    if (f.status === 'fixed') continue;
    const { severity, notes } = effectiveSeverity(f, rows);
    const why = notes.length ? ` [${notes.join('; ')}]` : '';
    const isCheck = /^check:/.test(f.source);
    const row = rows.get(f.state);

    if (f.status === 'duplicate') {
      if (isCheck) out.push({ code: `${severity}-status`, message: `${describe(f)} is marked duplicate, but a check's finding cannot be; fix it${why}` });
      continue;
    }
    // A state the plan cuts is not audited (spec 8.3): its findings are settled by the cut itself,
    // which for a P1 must have gone through a Scope line.
    const cutByPlan = row?.class === 'cut';
    if (f.status === 'cut' || (f.status === 'open' && cutByPlan)) {
      if (!cutByPlan) out.push({ code: `${severity}-cut-invalid`, message: `${describe(f)} is marked cut, but plan row ${f.state} is not a cut${why}` });
      else if (severity === 'P1' && !row.scopeLine) out.push({ code: 'P1-cut-no-scope', message: `${describe(f)} is P1 and its state is cut without a Scope line the founder saw${why}` });
      continue;
    }
    if (NEVER_BLOCKING.has(f.source)) continue;

    if (severity === 'P1') {
      if (f.status === 'open') out.push({ code: 'P1-open', message: `${describe(f)}: P1 open${why}` });
      else out.push({ code: 'P1-status', message: `${describe(f)}: P1 marked ${f.status}, which does not catch a P1; fix it or cut its state through a Scope line${why}` });
      continue;
    }
    if (severity === 'P2') {
      if (f.status === 'open') { out.push({ code: 'P2-open', message: `${describe(f)}: P2 open; fix it or accept it with a reason class and an issue${why}` }); continue; }
      if (f.status === 'filed') { out.push({ code: 'P2-filed', message: `${describe(f)}: P2 filed; filing alone does not catch a P2${why}` }); continue; }
      if (f.status === 'accepted') {
        const a = f.accept;
        const bad = !a ? 'no accept record'
          : !ACCEPT_REASONS.has(a.reasonClass) ? `reason class ${a.reasonClass} is not one of ${[...ACCEPT_REASONS].join(', ')}`
          : !(Number.isInteger(a.issue) && a.issue > 0) ? 'no issue'
          : !String(a.text ?? '').trim() ? 'no text for the PR body'
          : a.reasonClass === 'adapt' && row?.class !== 'adapt' ? `reason adapt, but plan row ${f.state} is not an adapt row`
          : null;
        if (bad) out.push({ code: 'P2-accept-invalid', message: `${describe(f)}: accepted with ${bad}${why}` });
        else accepted.push(f);
      }
      continue;
    }
    // P3
    if (f.status === 'open') out.push({ code: 'P3-open', message: `${describe(f)}: P3 open; fix it or file it on the polish issue${why}` });
  }

  const byGroup = new Map();
  for (const f of accepted) {
    const g = f.group || String(f.state).split('-')[0];
    byGroup.set(g, [...(byGroup.get(g) ?? []), f]);
  }
  for (const [g, list] of [...byGroup].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length > perGroupCap) {
      out.push({ code: 'P2-cap-group', message: `screen group ${g} has ${list.length} accepted P2s; the cap is ${perGroupCap}: fix ${list.length - perGroupCap} of ${list.map((f) => f.id).join(', ')}` });
    }
  }
  if (accepted.length > runCap) {
    out.push({ code: 'P2-cap-run', message: `${accepted.length} accepted P2s in the run; the cap is ${runCap}: fix ${accepted.length - runCap} more` });
  }
  return out;
}
