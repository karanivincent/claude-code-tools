// The button map: its checks, the checklist it renders, and the conversion from a coverage plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFromPlan, renderChecklist, sameControl, validateMap, writesData } from '../../lib/picture/map.mjs';

export function sampleMap(over = {}) {
  return {
    schemaVersion: 1,
    feature: 'knowledge-page',
    title: 'Knowledge',
    kind: 'redesign',
    route: '/dashboard/knowledge',
    pageArea: { left: 240, designLeft: 240 },
    worlds: [
      { id: 'design', users: [{ role: 'admin', email: 'delivery+kp-design-admin@example.invalid' }, { role: 'member', email: 'delivery+kp-design-member@example.invalid' }] },
    ],
    states: [
      { id: 'KC-05', screen: 'To check', name: 'Everything', reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge?view=check' }] },
        buttons: [
          { label: 'Add knowledge', testid: 'kb-add-knowledge', opens: 'KC-04', effect: 'free', member: 'hidden' },
          { label: 'Save', testid: 'kb-asked-save', opens: 'KC-08', effect: 'free', member: 'hidden' },
          { label: 'Read my website', testid: 'kb-read-website', effect: 'metered' },
        ] },
      { id: 'KC-04', screen: 'To check', name: 'Add menu open', reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge?view=check' }, { click: { testid: 'kb-add-knowledge' } }] }, buttons: [] },
      { id: 'KC-08', screen: 'To check', name: 'Answer saved', reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge?view=check' }, { type: { testid: 'kb-asked-answer-input-0', text: 'Silver' } }, { click: { testid: 'kb-asked-save-0' } }] }, buttons: [] },
      { id: 'KC-01', screen: 'To check', name: 'Loading', reach: { test: 'frame.state.test.tsx :: KC-01 loading' } },
    ],
    keep: [{ what: 'Export as CSV', where: 'old-page.tsx', how: 'moves to the Sources menu' }],
    ...over,
  };
}
const designed = new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']);

test('a complete map has no problems', () => {
  assert.deepEqual(validateMap(sampleMap(), { designed }), []);
});

test('every design picture needs a state, and every state a picture or "design": false', () => {
  const p = validateMap(sampleMap(), { designed: new Set([...designed, 'KC-09']) });
  assert.ok(p.some((x) => x.includes('KC-09 has a picture but no entry')));
  const q = validateMap(sampleMap(), { designed: new Set(['KC-05', 'KC-04', 'KC-08']) });
  assert.ok(q.some((x) => x.includes('state KC-01 has no design picture')));
});

test('a button that opens a state the map lacks, and an unknown effect, are problems', () => {
  const m = sampleMap();
  m.states[0].buttons.push({ label: 'Go', testid: 'kb-go', opens: 'KC-99', effect: 'teleport' });
  const p = validateMap(m, { designed });
  assert.ok(p.some((x) => x.includes('opens KC-99')));
  assert.ok(p.some((x) => x.includes('effect "teleport"')));
});

test('a reach in an unknown world or role is a problem', () => {
  const m = sampleMap();
  m.states[1].reach.world = 'empty';
  m.states[2].reach.role = 'owner';
  const p = validateMap(m, { designed });
  assert.ok(p.some((x) => x.includes('world "empty"')));
  assert.ok(p.some((x) => x.includes('no owner user')));
});

test('a reach step that clicks a metered control is refused unless an intercept answers it', () => {
  const m = sampleMap();
  m.states[1].reach.steps.push({ click: { testid: 'kb-read-website' } });
  assert.ok(validateMap(m, { designed }).some((x) => x.includes('whose effect is metered')));
  m.states[1].reach.intercept = { method: 'POST', url: '/api/read', status: 200, body: '{}' };
  assert.deepEqual(validateMap(m, { designed }), []);
});

test('a step must be exactly one kind', () => {
  const m = sampleMap();
  m.states[1].reach.steps.push({ goto: '/x', click: { testid: 'a' } });
  assert.ok(validateMap(m, { designed }).some((x) => x.includes('not exactly one of')));
});

test('a row test id matches its button id with a -<n> suffix', () => {
  assert.equal(sameControl('kb-asked-save', 'kb-asked-save-0'), true);
  assert.equal(sameControl('kb-asked-save', 'kb-asked-save'), true);
  assert.equal(sameControl('kb-asked-save', 'kb-asked-saved'), false);
});

test('states reached by saving are the ones that write data', () => {
  const m = sampleMap();
  assert.equal(writesData(m.states[2], m), true);
  assert.equal(writesData(m.states[1], m), false);
  assert.equal(writesData({ reach: { writes: true, steps: [] } }, m), true);
});

test('the checklist lists each state, how it is reached, and where each button goes', () => {
  const md = renderChecklist(sampleMap());
  assert.match(md, /## KC-05: To check \/ Everything/);
  assert.match(md, /Button "Add knowledge" \(kb-add-knowledge\) → opens KC-04: To check \/ Add menu open \(hidden from members\)/);
  assert.match(md, /Button "Read my website" \(kb-read-website\) → stays \[metered: never clicked by the capture\]/);
  assert.match(md, /Reached by: the component test frame.state.test.tsx :: KC-01 loading/);
  assert.match(md, /Export as CSV \(old-page.tsx\): moves to the Sources menu/);
});

test('a coverage plan converts to a valid map of its designed rows', () => {
  const plan = {
    feature: 'knowledge-page',
    worlds: sampleMap().worlds,
    rows: [
      { id: 'KC-05', class: 'new', route: '/dashboard/knowledge', reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge?view=check' }] },
        controls: [{ label: 'Add knowledge', testid: 'kb-add-knowledge', effect: 'free', target: 'KC-04', permission: { member: 'hidden' } }, { label: 'Tab', testid: 'kb-tab', effect: 'none', target: 'external' }] },
      { id: 'KC-04', class: 'new', reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge' }, { click: { testid: 'kb-add-knowledge' } }] }, controls: [] },
      { id: 'KC-01', class: 'new', reach: { class: 'prop', test: { file: 'frame.test.tsx', name: 'KC-01 loading' } }, controls: [] },
      { id: 'CAP-001', class: 'keep', reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: '/x' }] }, controls: [] },
    ],
  };
  const map = mapFromPlan(plan, { designed: new Set(['KC-05', 'KC-04', 'KC-01']), names: { 'KC-05': { screen: 'To check', name: 'Everything' } } });
  assert.equal(map.states.length, 3);
  assert.equal(map.states[0].name, 'Everything');
  assert.deepEqual(map.states[0].buttons[0], { label: 'Add knowledge', testid: 'kb-add-knowledge', opens: 'KC-04', effect: 'free', member: 'hidden' });
  assert.equal(map.states[0].buttons[1].opens, undefined);
  assert.equal(map.states[2].reach.test, 'frame.test.tsx :: KC-01 loading');
  assert.equal(map.route, '/dashboard/knowledge');
  assert.deepEqual(validateMap(JSON.parse(JSON.stringify(map)), { designed: new Set(['KC-05', 'KC-04', 'KC-01']) }), []);
});
