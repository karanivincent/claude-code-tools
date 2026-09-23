// Replay of M1 (plan check) on the state map and child issues of an earlier build (spec 20.2).
// The set holds no plan: the test derives one the way a faithful plan would come out of that build
// (every state owned by the issue that built its screen), leaving the features expected/m1.json
// names exactly as the build left them: unowned, or cut with no reason, issue or Scope line. M1
// must name every one of them, and nothing else. Runs only when DELIVERY_REPLAY_DIR is set.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { replayTest } from '../helpers/replay.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { checkPlan } from '../../lib/plan/check.mjs';
import { validAgainstSchema, row } from '../checks/helpers.mjs';

const readJson = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));

/** The state map's table rows: id and what the state shows, and whether it is prop-only. */
function stateMap(dir) {
  const text = readFileSync(join(dir, 'audit', 'screen-map.md'), 'utf8');
  return [...text.matchAll(/^\| ([A-Z]{1,6}-\d{2,3}) \| ([^|]*) \| [^|]* \| ([^|]*) \|/gm)].map((m) => ({ id: m[1], key: m[2], shows: m[3].trim(), prop: /prop-only/.test(m[2]) }));
}

const CODES = { unowned: ['M1-missing-row', 'M1-no-owner'], 'cut-without-reason': ['M1-cut-no-reason', 'M1-cut-no-issue', 'M1-cut-no-scope'] };

replayTest('M1 names every feature expected/m1.json lists as unowned or cut without a reason, issue and Scope line, and nothing else', { needs: ['expected/m1.json', 'audit/screen-map.md', 'issues'] }, (t, dir) => {
  const m1 = readJson(dir, 'expected/m1.json');
  const states = stateMap(dir);
  assert.ok(states.length >= 70, `${states.length} states in the map`);
  const byFeature = new Map();
  for (const f of m1.mustFlag) for (const id of f.screenMapIds) byFeature.set(id, f);

  // One screen unit per child issue, keyed by the state prefix the issue's screen uses.
  const issues = readdirSync(join(dir, 'issues')).map((f) => readJson(dir, `issues/${f}`));
  const prefixes = [...new Set(states.map((s) => s.id.split('-')[0]))];
  const children = issues.filter((i) => !i.labels.some((l) => l.name === 'epic')).sort((a, b) => a.number - b.number);
  const unitFor = new Map(prefixes.map((p, n) => [p, `U${n + 1}`]));
  const units = [
    { id: 'U0', title: 'Contracts and stubs', issue: null, kind: 'contract', wave: 0, files: ['src/contract.ts'], states: [], capabilities: [], risk: 'high', model: 'opus' },
    ...prefixes.map((p, n) => ({ id: `U${n + 1}`, title: `Screens ${p}`, issue: children[n]?.number ?? null, kind: 'screen', wave: 1, files: [`src/${p.toLowerCase()}/**`], states: [], capabilities: [], risk: 'normal', model: 'sonnet' })),
  ];
  const rows = [];
  for (const s of states) {
    const f = byFeature.get(s.id);
    if (f?.likelyFlag === 'unowned') continue;
    if (f?.likelyFlag === 'cut-without-reason') {
      rows.push(row(s.id, { class: 'cut', owner: null, reach: undefined, markers: undefined, requested: f.childIssuesNaming.length ? `issue-${f.childIssuesNaming[0]}` : null }));
      continue;
    }
    const unit = unitFor.get(s.id.split('-')[0]);
    units.find((u) => u.id === unit).states.push(s.id);
    rows.push(row(s.id, {
      owner: unit,
      reach: s.prop
        ? { class: 'prop', world: 'design', role: 'admin', steps: [], test: { file: `src/${s.id}.test.tsx`, name: 'renders the state' } }
        : { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: `/screens/${s.id.toLowerCase()}` }] },
      markers: { text: [s.shows.slice(0, 40) || s.id], testids: [`state-${s.id.toLowerCase()}`], forbidden: [] },
    }));
  }
  const plan = {
    schemaVersion: 1, feature: 'replay', epic: 1, scopeIssue: null, scopeSnapshot: null,
    worlds: [{ id: 'design', kind: 'design', orgName: 'Delivery fixture · replay', users: [{ role: 'admin', email: 'delivery+replay@example.invalid' }], notes: '' }],
    units, contracts: [], rows, seed: { globalRows: [] }, scope: [],
  };
  validAgainstSchema('plan', plan);
  const inventory = { schemaVersion: 1, feature: 'replay', designTreeSha256: '0'.repeat(64), candidates: [], states: states.map((s) => ({ id: s.id, screen: s.id.split('-')[0], name: s.shows.slice(0, 60) || s.id, reach: { kind: 'shot-only' }, shots: ['x.png'], render: { status: 'impossible', why: 'replay' }, controls: [{ label: '', role: 'none', target: 'none', effect: 'none' }] })) };
  validAgainstSchema('inventory', inventory);

  const failures = checkPlan({ plan, inventory, profile: makeProfile() });
  for (const f of m1.mustFlag) {
    for (const id of f.screenMapIds) {
      const named = failures.filter((x) => new RegExp(`\\b${id}\\b`).test(x.message)).map((x) => x.code);
      assert.ok(named.length, `${f.feature}: ${id} is not named`);
      assert.ok(named.some((c) => [...CODES.unowned, ...CODES['cut-without-reason']].includes(c)), `${f.feature}: ${id} named only as ${named}`);
      assert.ok(named.some((c) => CODES[f.likelyFlag].includes(c)), `${f.feature}: ${id} should be ${f.likelyFlag}, got ${named}`);
    }
  }
  const expected = new Set(m1.mustFlag.flatMap((f) => f.screenMapIds));
  for (const x of failures) {
    const ids = [...x.message.matchAll(/\b[A-Z]{1,6}-\d{2,3}\b/g)].map((m) => m[0]);
    if (x.code === 'M1-cut-budget') continue;
    assert.ok(ids.length && ids.every((id) => expected.has(id)), `a failure outside the eight features: ${x.code} ${x.message}`);
  }
});
