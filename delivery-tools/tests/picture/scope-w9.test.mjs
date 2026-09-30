// W9 (D10): a design above run.splitAboveStates states is proposed as one run per screen group, and
// the first builder gets one screen group per dispatch. (D11's model changes are tested in
// tests/retro/audit.test.mjs and tests/retro/experiment-w9.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pictureFacts, pictureNext, screenGroupsOf } from '../../lib/picture/next.mjs';
import { validateMap } from '../../lib/picture/map.mjs';
import { loadTunables, tunable } from '../../lib/retro/tunables.mjs';
import { sampleMap } from './map.test.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = 'delivery';

/** A map with `n` states spread over the named screens, round-robin. */
function bigMap(n, screens = ['Inbox', 'Detail', 'Settings'], over = {}) {
  return { schemaVersion: 1, kind: 'redesign', route: '/x', states: Array.from({ length: n }, (_, i) => ({ id: `S-${i}`, screen: screens[i % screens.length], name: `state ${i}` })), ...over };
}

/** The facts NEXT reads, as pictureFacts would give them for `map` with a valid map and no rounds yet. */
function factsFor(map) {
  const stateCount = map.states.length;
  return {
    rulesOwed: false, owedDesignRules: [], designed: 3, hasMap: true, mapError: null, guardsToApprove: [], pageBlockedComponents: [], phoneRenderOwed: false,
    rulesProblem: null, checklistStale: false, contractMissing: false, contractTodo: 0, undecided: 0, seedStale: false, needs: 0, steersMissing: false, rounds: [],
    stateCount, oneRun: map.oneRun === true, screenGroups: screenGroupsOf(map), componentsMap: map.kind === 'components',
  };
}

test('the tunable: run.splitAboveStates is 120, within 60..300, and loosens by going higher', () => {
  assert.equal(tunable('run.splitAboveStates'), 120);
  const t = loadTunables()['run.splitAboveStates'];
  assert.deepEqual([t.min, t.max, t.step, t.loosens], [60, 300, 20, 'higher']);
});

test('121 states: NEXT proposes one run per screen group, with counts, the intake command and the way to keep one run', () => {
  const next = pictureNext(factsFor(bigMap(121)), { cli });
  assert.equal(next.step, 'split');
  assert.match(next.text, /121 states, above 120/);
  assert.match(next.text, /Inbox \(41\), Detail \(40\), Settings \(40\)/);
  assert.match(next.text, /delivery intake <export> --feature <slug>-<group> --intent "<the group>"/);
  assert.match(next.text, /one after another after a components run, or side by side, at most four agents at once/);
  assert.match(next.text, /"oneRun": true/);
});

test('120 states, "oneRun": true and a components map do not split', () => {
  assert.notEqual(pictureNext(factsFor(bigMap(120)), { cli }).step, 'split');
  assert.notEqual(pictureNext(factsFor(bigMap(121, undefined, { oneRun: true })), { cli }).step, 'split');
  assert.notEqual(pictureNext(factsFor(bigMap(121, undefined, { kind: 'components' })), { cli }).step, 'split');
  assert.equal(pictureNext(factsFor(bigMap(121, undefined, { oneRun: false })), { cli }).step, 'split');
});

test('the split step comes after a map error and before the contract', () => {
  const f = factsFor(bigMap(121));
  assert.equal(pictureNext({ ...f, mapError: 'x', problemCount: 1 }, { cli }).step, 'map');
  assert.equal(pictureNext({ ...f, contractMissing: true }, { cli }).step, 'split');
});

test('validateMap: oneRun must be a boolean when present', () => {
  const problems = (over) => validateMap(sampleMap(over), { designed: new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']) });
  assert.deepEqual(problems({ oneRun: true }), []);
  assert.deepEqual(problems({ oneRun: false }), []);
  assert.deepEqual(problems({}), []);
  assert.deepEqual(problems({ oneRun: 'yes' }), ['oneRun must be true or false']);
});

test('pictureFacts: stateCount, oneRun and screenGroups (first-seen order) come from map.json', async () => {
  const root = mkdtempSync(join(tmpdir(), 'delivery-w9-'));
  try {
    const paths = { runDir: join(root, '.delivery', 'f'), deliveryDir: join(root, 'docs', 'delivery', 'f'), designRenders: join(root, '.delivery', 'f', 'design'), seedplan: join(root, '.delivery', 'f', 'seedplan.json') };
    mkdirSync(paths.deliveryDir, { recursive: true });
    const none = await pictureFacts(paths);
    assert.deepEqual([none.stateCount, none.oneRun, none.screenGroups], [0, false, []]);
    writeFileSync(join(paths.deliveryDir, 'map.json'), JSON.stringify(bigMap(5, ['B', 'A'], { oneRun: true })));
    const f = await pictureFacts(paths);
    assert.equal(f.stateCount, 5);
    assert.equal(f.oneRun, true);
    assert.deepEqual(f.screenGroups, [{ screen: 'B', states: 3 }, { screen: 'A', states: 2 }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the build step: several screen groups mean one builder dispatch per group; one screen keeps the single dispatch', () => {
  const many = pictureNext(factsFor(bigMap(9)), { cli });
  assert.equal(many.step, 'build');
  assert.match(many.text, /once per screen group \(3 groups\), one after another/);
  assert.match(many.text, /Screens line/);
  const one = pictureNext(factsFor(bigMap(9, ['Only'])), { cli });
  assert.equal(one.step, 'build');
  assert.doesNotMatch(one.text, /per screen group/);
  assert.match(one.text, /with briefs\/builder-picture\.md; when it reports/);
});

test('the skill and the builder brief carry the Screens line', () => {
  const skill = readFileSync(join(ROOT, 'skills/picture-build/SKILL.md'), 'utf8');
  assert.match(skill, /<builder: Dev server: <url>   Round: 1   Screens: <one screen group>/);
  assert.match(skill, /dispatch it once per screen group, one after\s+another/);
  assert.match(readFileSync(join(ROOT, 'briefs/builder-picture.md'), 'utf8'), /`Screens:` line, build only the screens it names/);
});
