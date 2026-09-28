// lib/seed/data.mjs, pure: A1's stateDataGaps (a map state's data need against the rows the worlds
// seed) and A2's CHECK-constraint/enum parsing and allow-list checking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  columnAllowList, columnConstraintViolations, describeWhere, parseCheckConstraint, stateDataGaps, tablesWithoutGuard,
} from '../../lib/seed/data.mjs';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function row(world, table, values) {
  return { world, table, values };
}

test('A1: a state with enough matching rows has no gap; one short is named with what was wanted and found', () => {
  const states = [
    { id: 'KC-05', reach: { world: 'design' }, data: [{ table: 'call_scripts', where: { category: 'renewals' }, min: 2 }] },
    { id: 'KC-06', reach: { world: 'design' } }, // no data: unaffected
  ];
  const rows = [
    row('design', 'call_scripts', { category: 'renewals' }),
    row('design', 'call_scripts', { category: 'onboarding' }),
  ];
  const gaps = stateDataGaps(states, rows, NOW);
  assert.deepEqual(gaps, [{ state: 'KC-05', table: 'call_scripts', where: { category: 'renewals' }, wanted: 2, found: 1 }]);
});

test('A1: min defaults to 1, and a data entry with no world defaults to the state\'s reach.world', () => {
  const states = [{ id: 'KC-05', reach: { world: 'design' }, data: [{ table: 'org_scripts', where: { active: true } }] }];
  assert.equal(stateDataGaps(states, [], NOW).length, 1);
  const rows = [row('design', 'org_scripts', { active: true }), row('messy', 'org_scripts', { active: true })];
  // Only the reach world's rows count when the entry names no world of its own.
  assert.deepEqual(stateDataGaps(states, rows, NOW), []);
});

test('A1: a data entry naming its own world counts only that world\'s rows, even off the state\'s reach', () => {
  const states = [{ id: 'KC-05', reach: { world: 'design' }, data: [{ world: 'messy', table: 'org_scripts', where: {}, min: 1 }] }];
  assert.deepEqual(stateDataGaps(states, [row('design', 'org_scripts', {})], NOW).map((g) => g.state), ['KC-05']);
  assert.deepEqual(stateDataGaps(states, [row('messy', 'org_scripts', {})], NOW), []);
});

test('A1: describeWhere reads like a filter, and "every row" for an empty one', () => {
  assert.equal(describeWhere({ category: 'renewals', active: true }), 'category = "renewals" and active = true');
  assert.equal(describeWhere({}), 'every row');
});

test('A2: parseCheckConstraint reads a plain IN list and an ANY(ARRAY[...]) list; anything else is left unparsed', () => {
  assert.deepEqual(parseCheckConstraint("CHECK ((status IN ('draft', 'active', 'archived')))"), { column: 'status', values: ['draft', 'active', 'archived'] });
  assert.deepEqual(
    parseCheckConstraint("CHECK (((category)::text = ANY (ARRAY[('pricing'::character varying)::text, ('support'::character varying)::text])))"),
    { column: 'category', values: ['pricing', 'support'] },
  );
  assert.equal(parseCheckConstraint('CHECK ((price > (0)::numeric))'), null, 'a range check is not a value list, and is silently skipped');
  assert.equal(parseCheckConstraint('CHECK ((char_length(name) < 200))'), null);
});

test('A2: columnAllowList merges CHECK constraints and enum labels by table.column; an enum wins a clash', () => {
  const checks = [{ table_name: 'widgets', definition: "CHECK ((state IN ('idle', 'busy')))" }];
  const enums = [{ table_name: 'widgets', column_name: 'state', labels: ['idle', 'busy', 'done'] }];
  const allowed = columnAllowList(checks, enums);
  assert.deepEqual(allowed.get('widgets.state'), ['idle', 'busy', 'done']);
});

test('A2: columnConstraintViolations names a world value outside the allow-list, with the value and what is allowed; null is never reported', () => {
  const allowed = columnAllowList(
    [{ table_name: 'org_scripts', definition: "CHECK ((category IN ('renewals', 'onboarding')))" }], [],
  );
  const rows = [
    row('design', 'org_scripts', { category: 'renewals' }),
    row('design', 'org_scripts', { category: 'support' }),
    row('design', 'org_scripts', { category: null }),
  ];
  const violations = columnConstraintViolations(rows, allowed, NOW);
  assert.deepEqual(violations, [{ world: 'design', table: 'org_scripts', column: 'category', value: 'support', allowed: ['renewals', 'onboarding'] }]);
});

test('A2: tablesWithoutGuard lists a table no guard\'s covers names, deduplicated and sorted; a wildcard or a named predicate both count as covering', () => {
  const rows = [row('design', 'widgets', {}), row('design', 'widgets', {}), row('design', 'call_scripts', {}), row('design', 'org_lines', {})];
  const safety = { guards: [{ id: 'g1', covers: ['widgets:*'] }, { id: 'g2', covers: ['call_scripts:some-predicate'] }] };
  assert.deepEqual(tablesWithoutGuard(rows, safety), ['org_lines']);
});
