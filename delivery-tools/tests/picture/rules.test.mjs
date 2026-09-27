// Rule coverage: every behaviour a brief states has a proof (a design state, a test named after it,
// or a cut), a rule the design never drew keeps the run red, and a run with no briefs behaves
// exactly as it did in 0.5.0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderChecklist } from '../../lib/picture/map.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import { briefFiles, ruleCounts, rulesForState, validateRules } from '../../lib/picture/rules.mjs';
import { ruleReadiness } from '../../lib/run/ready-compute.mjs';
import { sampleMap } from './map.test.mjs';

const stateIds = sampleMap().states.map((s) => s.id);
const has = (problems, text) => problems.some((p) => p.includes(text));

/** A complete rules document over the sample map: one of each proof that passes. */
function sampleRules() {
  return {
    rules: [
      { id: 'R1', text: 'Removing someone from a group shows Undo, and no confirm dialog.', source: 'intent/03.md', proof: 'picture', states: ['KC-05', 'KC-04@phone'] },
      { id: 'R2', text: 'A sync never overwrites groups or notes.', source: 'intent/03.md', proof: 'test', states: [], tests: ['apps/web/sync.test.ts'] },
      { id: 'R3', text: 'Time zones per person.', source: 'spec.md', proof: 'cut', cut: 'Scope: time zones are later' },
    ],
  };
}
const withTest = (body) => (p) => (p === 'apps/web/sync.test.ts' ? body : null);

// ---- Validation ----

test('a rules document with a picture, a test and a cut rule is valid at the plan stage', () => {
  assert.deepEqual(validateRules(sampleRules(), { stateIds }), []);
});

test('each malformed rule is named: bad id, a duplicate, no text, no source, an unknown proof', () => {
  const doc = { rules: [
    { id: 'rule-1', text: 'x', source: 's', proof: 'cut', cut: 'c' },
    { id: 'R2', text: 'x', source: 's', proof: 'cut', cut: 'c' },
    { id: 'R2', text: 'x', source: 's', proof: 'cut', cut: 'c' },
    { id: 'R3', text: '', source: 's', proof: 'cut', cut: 'c' },
    { id: 'R4', text: 'x', source: '', proof: 'cut', cut: 'c' },
    { id: 'R5', text: 'x', source: 's', proof: 'looks-fine' },
  ] };
  const p = validateRules(doc, { stateIds });
  assert.ok(has(p, 'rule-1: the id must be R'));
  assert.ok(has(p, 'R2: the id is used twice'));
  assert.ok(has(p, 'R3: no text'));
  assert.ok(has(p, 'R4: no source'));
  assert.ok(has(p, 'R5: proof must be one of'));
});

test('an empty document is one problem, not a pass', () => {
  assert.equal(validateRules({ rules: [] }).length, 1);
  assert.equal(validateRules(null).length, 1);
});

test('a picture rule needs a state that is in the map, and a cut needs its reason', () => {
  const doc = { rules: [
    { id: 'R1', text: 'x', source: 's', proof: 'picture', states: [] },
    { id: 'R2', text: 'x', source: 's', proof: 'picture', states: ['KC-99'] },
    { id: 'R3', text: 'x', source: 's', proof: 'cut' },
  ] };
  const p = validateRules(doc, { stateIds });
  assert.ok(has(p, 'R1: proof is picture but it names no state'));
  assert.ok(has(p, 'R2: names state KC-99, which is not in map.json'));
  assert.ok(has(p, 'R3: proof is cut but there is no cut reason'));
});

test('a rule owed to the design is a gap at both stages, and says what to send', () => {
  const doc = { rules: [{ id: 'R1', text: 'Removing someone shows Undo.', source: 'intent/03.md', proof: 'owed-design', states: [] }] };
  for (const stage of ['plan', 'ready']) {
    const p = validateRules(doc, { stateIds, stage, read: () => null });
    assert.equal(p.length, 1);
    assert.ok(has(p, 'R1 is owed to the design: send "Removing someone shows Undo."'));
  }
});

test('at the ready stage a test rule needs its file, and the file needs a test named after the rule', () => {
  const none = { rules: [{ ...sampleRules().rules[1], tests: [] }] };
  assert.ok(has(validateRules(none, { stateIds, stage: 'plan' }), 'no test') === false, 'the plan stage only needs the proof declared');
  assert.ok(has(validateRules(none, { stateIds, stage: 'ready', read: () => null }), 'R2: proof is test but no test is named'));
  assert.ok(has(validateRules(sampleRules(), { stateIds, stage: 'ready', read: () => null }), 'its test file apps/web/sync.test.ts does not exist'));
  assert.ok(has(validateRules(sampleRules(), { stateIds, stage: 'ready', read: withTest("it('sync keeps groups', ...)") }), 'has no test named "R2: ..."'));
  assert.deepEqual(validateRules(sampleRules(), { stateIds, stage: 'ready', read: withTest("it('R2: sync keeps groups', ...)") }), []);
});

test('counts by proof, and the rules a state shows include those naming only its phone item', () => {
  assert.deepEqual(ruleCounts(sampleRules()), { total: 3, picture: 1, test: 1, cut: 1, 'owed-design': 0 });
  assert.deepEqual(rulesForState(sampleRules(), 'KC-04').map((r) => r.id), ['R1']);
  assert.deepEqual(rulesForState(sampleRules(), 'KC-08').map((r) => r.id), []);
});

// ---- Checklist ----

test('the checklist lists each rule under the states that show it, and the rest in their own section', () => {
  const text = renderChecklist(sampleMap(), { rules: sampleRules() });
  const kc05 = text.slice(text.indexOf('## KC-05'), text.indexOf('\n## ', text.indexOf('## KC-05') + 1));
  assert.match(kc05, /- Rule R1: Removing someone from a group shows Undo/);
  assert.match(text, /## Rules no state shows/);
  assert.match(text, /- Rule R2: A sync never overwrites groups or notes\. \(proved by a test named "R2: \.\.\."\)/);
  assert.match(text, /- Rule R3: Time zones per person\. \(cut: Scope: time zones are later\)/);
});

test('a checklist without rules is exactly what 0.5.0 rendered', () => {
  assert.equal(renderChecklist(sampleMap(), { rules: null }), renderChecklist(sampleMap()));
  assert.doesNotMatch(renderChecklist(sampleMap()), /Rule R/);
});

// ---- Status ----

const facts = (over = {}) => ({ designed: 5, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], phoneRenderOwed: false, ...over });

test('status sends the rules agent in after the map when there are briefs and no rules.json', () => {
  const next = pictureNext(facts({ rulesOwed: true }), { cli: 'delivery' });
  assert.equal(next.step, 'rules');
  assert.match(next.text, /briefs\/rules\.md/);
});

test('status stops on a rule gap before the worlds, and names the first one', () => {
  const next = pictureNext(facts({ rulesProblem: 'R4 is owed to the design', ruleProblemCount: 2, seedStale: true }), { cli: 'delivery' });
  assert.equal(next.step, 'rules');
  assert.match(next.text, /2 problem\(s\); first: R4 is owed to the design/);
});

test('with no briefs and no rules, status goes straight on as in 0.5.0', () => {
  assert.equal(pictureNext(facts(), { cli: 'delivery' }).step, 'build');
});

// ---- Ready ----

function run() {
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  const deliveryDir = join(root, 'docs', 'delivery', 'people');
  mkdirSync(deliveryDir, { recursive: true });
  writeFileSync(join(deliveryDir, 'map.json'), JSON.stringify(sampleMap()));
  const paths = { repoRoot: root, deliveryDir, intentDir: join(deliveryDir, 'intent') };
  return { root, paths, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('ready: no briefs and no rules passes, as in 0.5.0', () => {
  const r = run();
  try { assert.equal(ruleReadiness(r.paths).ok, true); } finally { r.done(); }
});

test('ready: briefs with no rules.json is red, and names the agent to send', () => {
  const r = run();
  try {
    mkdirSync(join(r.paths.intentDir, 'uploads'), { recursive: true });
    writeFileSync(join(r.paths.intentDir, '01-people.md'), 'brief');
    writeFileSync(join(r.paths.intentDir, 'uploads', 'shot.png'), '');
    writeFileSync(join(r.paths.intentDir, 'sentence.txt'), 'the one sentence');
    assert.deepEqual(briefFiles(r.paths), ['01-people.md']);
    const res = ruleReadiness(r.paths);
    assert.equal(res.ok, false);
    assert.match(res.detail, /1 brief\(s\) in intent\/ and no rules\.json/);
  } finally { r.done(); }
});

test('ready: a test rule whose test is missing is red; once the test exists, ready is green', () => {
  const r = run();
  try {
    writeFileSync(join(r.paths.deliveryDir, 'rules.json'), JSON.stringify(sampleRules()));
    const red = ruleReadiness(r.paths);
    assert.equal(red.ok, false);
    assert.match(red.detail, /1 rule gap\(s\): R2: its test file apps\/web\/sync\.test\.ts does not exist/);
    mkdirSync(join(r.root, 'apps', 'web'), { recursive: true });
    writeFileSync(join(r.root, 'apps', 'web', 'sync.test.ts'), "it('R2: a sync keeps groups and notes', () => {});\n");
    const green = ruleReadiness(r.paths);
    assert.equal(green.ok, true);
    assert.match(green.detail, /3 rule\(s\): 1 shown by a state, 1 proved by a named test, 1 cut/);
  } finally { r.done(); }
});
