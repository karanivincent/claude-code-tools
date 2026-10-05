// B2 of the delivery feedback: a value a state's intercept answers with counts as data the state
// holds, both before the seed (contractGaps) and after the shoot (datacheck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractGaps, interceptHolds } from '../../lib/picture/contract.mjs';
import { checkItem } from '../../lib/picture/datacheck.mjs';

const INTERCEPT = { method: 'GET', url: '/api/lines', status: 200, body: { lines: [{ number: '+999 700 000 001', label: 'Main line', channels: 2 }] } };
const entry = (text, extra = {}) => ({ text, label: 'data', table: 'org_lines', column: 'label', ...extra });

test('interceptHolds: a value in the body holds; a missing value, no intercept or a user entry does not', () => {
  assert.equal(interceptHolds(entry('Main line'), INTERCEPT), true);
  assert.equal(interceptHolds(entry('Call +999 700 000 001', { value: '+999 700 000 001' }), INTERCEPT), true, 'the value inside the words');
  assert.equal(interceptHolds(entry('main   LINE'), INTERCEPT), true, 'case and spacing do not count');
  assert.equal(interceptHolds(entry('Backup line'), INTERCEPT), false);
  assert.equal(interceptHolds(entry('Main line'), null), false);
  assert.equal(interceptHolds({ text: 'Main line', label: 'data', user: 'admin' }, INTERCEPT), false);
  assert.equal(interceptHolds(entry('Main line'), { ...INTERCEPT, body: JSON.stringify(INTERCEPT.body) }), true, 'a body written as a string');
  assert.equal(interceptHolds(entry('Ops line'), INTERCEPT, { 'Ops line': 'Main line' }), true, 'the swapped value');
});

const MAP = {
  worlds: [{ id: 'design', users: [] }],
  states: [
    { id: 'L-01', reach: { world: 'design', role: 'admin', steps: [{ goto: '/l' }], intercept: INTERCEPT } },
    { id: 'L-02', reach: { world: 'design', role: 'admin', steps: [{ goto: '/l' }] } },
  ],
};

test('contractGaps: a value the state\'s intercept answers with is held; the same value without one is a gap', () => {
  const contract = { states: { 'L-01': { texts: [entry('Main line')] }, 'L-02': { texts: [entry('Main line')] } } };
  const r = contractGaps(contract, MAP, { rows: [], users: [] }, new Date('2026-01-15T12:00:00Z'));
  assert.deepEqual(r.gaps.map((g) => g.state), ['L-02']);
});

test('datacheck: a value the intercept answers with and the page lacks is the page\'s to fix, never a data fault', () => {
  const contractState = { texts: [entry('Main line')] };
  const withRows = checkItem({ contractState, liveLines: ['Lines'], rows: [], intercept: INTERCEPT });
  assert.equal(withRows.faults.length, 0);
  assert.equal(withRows.page.length, 1);
  assert.match(withRows.page[0].why, /the state's intercept answers with it/);
  const without = checkItem({ contractState, liveLines: ['Lines'], rows: [] });
  assert.equal(without.faults.length, 1, 'without the intercept the world lacks it: a data fault');
  const shown = checkItem({ contractState, liveLines: ['Main line'], rows: [], intercept: INTERCEPT });
  assert.deepEqual([shown.faults.length, shown.page.length], [0, 0]);
});
