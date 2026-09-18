// The severity policy (spec 8.3): floors, day-one raises, what may catch a P1 or a P2, the caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFinding } from '../../lib/core/findings.mjs';
import { readyBlockers, effectiveSeverity, applySeverityPolicy, floorOf, rowsById, raiseSeverity, maxSeverity, RULE_FLOORS } from '../../lib/checks/severity.mjs';
import { validAgainstSchema } from './helpers.mjs';

const plan = {
  rows: [
    { id: 'WL-01', class: 'change', dayOne: false },
    { id: 'WL-02', class: 'new', dayOne: true },
    { id: 'WL-03', class: 'cut', dayOne: false, scopeLine: 'S1' },
    { id: 'WL-04', class: 'cut', dayOne: false },
    { id: 'WL-05', class: 'adapt', dayOne: false },
  ],
};
const profile = { limits: { maxAcceptedP2PerGroup: 2, maxAcceptedP2: 3 } };
const f = (o) => makeFinding({ source: 'check:M7', rule: 'numeric-date', severity: 'P2', state: 'WL-01', where: 'x.txt:1', group: 'Widgets', ...o });
const doc = (findings) => ({ schemaVersion: 1, runId: 'r-1', findings });
const codes = (fs) => readyBlockers(doc(fs), plan, profile).map((b) => b.code);

test('severities order and raise: P3 to P2, P2 to P1, P1 stays', () => {
  assert.equal(raiseSeverity('P3'), 'P2');
  assert.equal(raiseSeverity('P2'), 'P1');
  assert.equal(raiseSeverity('P1'), 'P1');
  assert.equal(maxSeverity('P2', 'P1'), 'P1');
  assert.equal(maxSeverity('P3', 'P2'), 'P2');
});

test('floors come from the rule: a check finding cannot be lowered by editing findings.json', () => {
  const lowered = f({ rule: 'uuid', severity: 'P3' });
  assert.equal(floorOf(lowered), 'P1');
  assert.equal(effectiveSeverity(lowered, rowsById(plan)).severity, 'P1');
  assert.deepEqual(codes([lowered]), ['P1-open']);
  assert.match(readyBlockers(doc([lowered]), plan, profile)[0].message, /floor P1/);
});

test('an auditor finding in a P1 category is P1 whatever the auditor wrote; others keep their severity', () => {
  const dead = makeFinding({ source: 'auditor:widgets', rule: 'dead-control', severity: 'P3', state: 'WL-01', where: 'WL-01' });
  const misleads = makeFinding({ source: 'auditor:widgets', rule: 'Misleads', severity: 'P2', state: 'WL-01', where: 'WL-01 b' });
  const spacing = makeFinding({ source: 'auditor:widgets', rule: 'spacing', severity: 'P3', state: 'WL-01', where: 'WL-01 c' });
  assert.equal(effectiveSeverity(dead, new Map()).severity, 'P1');
  assert.equal(effectiveSeverity(misleads, new Map()).severity, 'P1');
  assert.equal(effectiveSeverity(spacing, new Map()).severity, 'P3');
});

test('day-one states are raised one level, once', () => {
  const rows = rowsById(plan);
  const p2 = f({ state: 'WL-02' });
  assert.equal(effectiveSeverity(p2, rows).severity, 'P1');
  const applied = applySeverityPolicy(p2, rows);
  assert.equal(applied.severity, 'P1');
  assert.equal(applied.dayOne, true);
  assert.equal(effectiveSeverity(applied, rows).severity, 'P1', 'a finding that carries the raise is not raised again');
  assert.equal(applySeverityPolicy(f({ state: 'WL-02', rule: 'spacing', severity: 'P3', source: 'auditor:x' }), rows).severity, 'P2');
});

test('P1: only fixed, or cut through a Scope line, catches it', () => {
  const p1 = (o) => f({ rule: 'uuid', severity: 'P1', ...o });
  assert.deepEqual(codes([p1({ status: 'fixed' })]), []);
  assert.deepEqual(codes([p1({ status: 'open' })]), ['P1-open']);
  assert.deepEqual(codes([p1({ status: 'filed' })]), ['P1-status']);
  assert.deepEqual(codes([p1({ status: 'accepted', accept: { reasonClass: 'platform-limit', issue: 5, text: 'x' } })]), ['P1-status']);
  assert.deepEqual(codes([p1({ status: 'cut', state: 'WL-03' })]), [], 'cut with a Scope line');
  assert.deepEqual(codes([p1({ status: 'open', state: 'WL-03' })]), [], 'its state cut through a Scope line');
  assert.deepEqual(codes([p1({ status: 'cut', state: 'WL-04' })]), ['P1-cut-no-scope']);
  assert.deepEqual(codes([p1({ status: 'cut', state: 'WL-01' })]), ['P1-cut-invalid']);
});

test("a check's finding is never a duplicate; a judgement can be", () => {
  assert.deepEqual(codes([f({ status: 'duplicate' })]), ['P2-status']);
  assert.deepEqual(codes([makeFinding({ source: 'auditor:x', rule: 'wrong-fact', severity: 'P1', state: 'WL-01', where: 'a', status: 'duplicate' })]), []);
});

test('P2: fixed, accepted with a reason class and an issue, or cut; never filed', () => {
  const acc = (reasonClass, o = {}) => f({ status: 'accepted', accept: { reasonClass, issue: 12, text: 'listed in the PR body' }, ...o });
  assert.deepEqual(codes([f({ status: 'open' })]), ['P2-open']);
  assert.deepEqual(codes([f({ status: 'filed' })]), ['P2-filed']);
  assert.deepEqual(codes([acc('platform-limit')]), []);
  assert.deepEqual(codes([acc('adapt')]), ['P2-accept-invalid'], 'adapt needs an adapt row');
  assert.deepEqual(codes([acc('adapt', { state: 'WL-05' })]), []);
  assert.deepEqual(codes([f({ status: 'accepted' })]), ['P2-accept-invalid']);
  assert.deepEqual(codes([f({ status: 'cut', state: 'WL-04' })]), []);
});

test('accepted P2s are capped per screen group and per run; one over keeps ready red', () => {
  const acc = (n, group) => f({ where: `x.txt:${n}`, group, status: 'accepted', accept: { reasonClass: 'platform-limit', issue: 12, text: 't' } });
  assert.deepEqual(codes([acc(1, 'A'), acc(2, 'A')]), []);
  assert.deepEqual(codes([acc(1, 'A'), acc(2, 'A'), acc(3, 'A')]), ['P2-cap-group']);
  assert.deepEqual(codes([acc(1, 'A'), acc(2, 'A'), acc(3, 'B'), acc(4, 'B')]), ['P2-cap-run']);
});

test('P3: fixed or filed; open blocks; M17 never blocks', () => {
  const p3 = (o) => f({ rule: 'identical-to-primary', source: 'check:M8', severity: 'P3', ...o });
  assert.deepEqual(codes([p3({ status: 'open' })]), ['P3-open']);
  assert.deepEqual(codes([p3({ status: 'filed' })]), []);
  assert.deepEqual(codes([f({ source: 'check:M17', rule: 'load-time', severity: 'P3', status: 'open' })]), []);
});

test('every floor names a real severity, and a policy-applied finding still matches the schema', () => {
  for (const [check, rules] of Object.entries(RULE_FLOORS)) for (const [rule, s] of Object.entries(rules)) assert.ok(['P1', 'P2', 'P3'].includes(s), `${check} ${rule}`);
  assert.ok(validAgainstSchema('findings', doc([applySeverityPolicy(f({ state: 'WL-02' }), rowsById(plan))])));
});
