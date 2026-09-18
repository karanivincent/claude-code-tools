// node --test skills/design-inventory/scripts/assemble-inventory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assembleInventory, main } from './assemble-inventory.mjs';

const TREE = '2'.repeat(64);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'assemble-inventory.mjs');

function candidates(ids) {
  return {
    schemaVersion: 1, feature: 'widgets', adapter: 'claude-design', designTreeSha256: TREE,
    candidates: ids.map(([id, kind]) => ({ id, kind, source: `Widgets.dc.html:${100 + ids.length}` })),
  };
}

// "No controls" is said with one control whose role is "none", as inventory check requires.
const NO_CONTROLS = [{ label: '', role: 'none', target: 'none', effect: 'none' }];

function state(id, extra = {}) {
  return {
    id, screen: 'Widgets list', name: `state ${id}`,
    reach: { kind: 'click-path', steps: [{ click: 'Widgets' }] },
    shots: [], render: { status: 'ok' }, controls: NO_CONTROLS, ...extra,
  };
}

function part(group, cands, states) {
  return { schemaVersion: 1, feature: 'widgets', group, part: 'states', candidates: cands, states, rerender: [], notes: [] };
}

test('assembles two groups into a valid inventory, in candidates.json order', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target'], ['C-002', 'list'], ['C-003', 'shot']]),
    parts: [
      { file: 'extract/a.json', doc: part('a', [{ id: 'C-002', mappedTo: 'WL-02' }], [state('WL-02', { reach: { kind: 'unspecified', unspecified: 'empty' }, render: { status: 'impossible', why: 'not drawn in the design' } })]) },
      { file: 'extract/b.json', doc: part('b', [{ id: 'C-001', mappedTo: 'WL-01' }, { id: 'C-003', mappedTo: null, excluded: { reason: 'shots/old.png: an earlier round, superseded' } }], [state('WL-01', { controls: [{ label: 'New widget', role: 'button', target: 'WL-02', effect: 'free' }] })]) },
    ],
  });
  assert.deepEqual(res.failures, []);
  assert.deepEqual(res.inventory.candidates.map((c) => c.id), ['C-001', 'C-002', 'C-003']);
  assert.equal(res.inventory.candidates[2].excluded.reason, 'shots/old.png: an earlier round, superseded');
  assert.deepEqual(res.counts, { candidates: 3, mapped: 2, excluded: 1, states: 2 });
});

test('an unclaimed candidate, a double claim and a duplicate state each fail', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target'], ['C-002', 'ternary'], ['C-003', 'list']]),
    parts: [
      { file: 'extract/a.json', doc: part('a', [{ id: 'C-001', mappedTo: 'WL-01' }, { id: 'C-002', mappedTo: 'WL-01' }], [state('WL-01')]) },
      { file: 'extract/b.json', doc: part('b', [{ id: 'C-002', mappedTo: null, excluded: { reason: 'copy variant' } }], [state('WL-01')]) },
    ],
  });
  const codes = res.failures.map((f) => f.code).sort();
  assert.deepEqual(codes, ['claimed-twice', 'duplicate-state', 'unclaimed']);
  assert.equal(res.inventory, null);
});

test('the same claim from two groups is one claim', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target']]),
    parts: [
      { file: 'extract/a.json', doc: part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01')]) },
      { file: 'extract/b.json', doc: part('b', [{ id: 'C-001', mappedTo: 'WL-01' }], []) },
    ],
  });
  assert.deepEqual(res.failures, []);
});

test('mapping to an unknown state, a claim with no reason, and a dangling control target fail', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target'], ['C-002', 'dialog']]),
    parts: [{ file: 'extract/a.json', doc: part('a', [{ id: 'C-001', mappedTo: 'WL-09' }, { id: 'C-002', mappedTo: null }], [state('WL-01', { controls: [{ label: 'Open', role: 'button', target: 'WL-05', effect: 'none' }] })]) }],
  });
  const codes = res.failures.map((f) => f.code).sort();
  assert.deepEqual(codes, ['bad-claim', 'unclaimed', 'unclaimed', 'unknown-state', 'unknown-target']);
});

test('one exclusion reason on many candidates is noted, not refused', () => {
  const ids = Array.from({ length: 6 }, (_, i) => [`C-00${i + 1}`, 'ternary']);
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates(ids),
    parts: [{ file: 'extract/a.json', doc: part('a', ids.map(([id]) => ({ id, mappedTo: null, excluded: { reason: 'cosmetic' } })), []) }],
  });
  assert.deepEqual(res.failures, []);
  assert.deepEqual(res.notes, ['one exclusion reason covers 6 candidates: "cosmetic"']);
});

test('a state the schema refuses fails as schema, and nothing is returned to write', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target']]),
    parts: [{ file: 'extract/a.json', doc: part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01', { controls: [{ label: 'Go', role: 'button', target: 'WL-01', effect: 'expensive' }] })]) }],
  });
  assert.ok(res.failures.some((f) => f.code === 'schema'), JSON.stringify(res.failures));
  assert.equal(res.inventory, null);
});

test('a previous inventory yields the added, removed and changed states', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: candidates([['C-001', 'set-target'], ['C-002', 'list']]),
    parts: [{ file: 'extract/a.json', doc: part('a', [{ id: 'C-001', mappedTo: 'WL-01' }, { id: 'C-002', mappedTo: 'WL-03' }], [state('WL-01', { name: 'renamed' }), state('WL-03')]) }],
    previous: { states: [state('WL-01'), state('WL-02')] },
  });
  assert.deepEqual(res.diff, { added: ['WL-03'], removed: ['WL-02'], changed: ['WL-01'] });
});

async function repoWith({ cands, parts, profile }) {
  const dir = await mkdtemp(join(tmpdir(), 'assemble-inventory-'));
  const runRoot = profile?.paths?.runRoot ?? '.delivery';
  await mkdir(join(dir, runRoot, 'widgets', 'extract'), { recursive: true });
  await writeFile(join(dir, runRoot, 'widgets', 'candidates.json'), JSON.stringify(cands));
  for (const [name, doc] of Object.entries(parts)) await writeFile(join(dir, runRoot, 'widgets', 'extract', name), JSON.stringify(doc));
  if (profile) {
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'delivery-profile.json'), JSON.stringify(profile));
  }
  return dir;
}

test('main writes the inventory; --check writes nothing; problems write nothing and exit 1', async () => {
  const cands = candidates([['C-001', 'set-target']]);
  const good = await repoWith({ cands, parts: { 'a.json': part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01')]) } });
  const out = [];
  try {
    assert.equal(await main(['--feature', 'widgets', '--check'], { cwd: good, stdout: (s) => out.push(s) }), 0);
    assert.equal(existsSync(join(good, 'docs/delivery/widgets/inventory.json')), false);
    assert.match(out.at(-1), /^would write .*inventory\.json: 1 candidates \(1 mapped, 0 excluded\), 1 states$/);
    assert.equal(await main(['--feature', 'widgets'], { cwd: good, stdout: (s) => out.push(s) }), 0);
    const inv = JSON.parse(await readFile(join(good, 'docs/delivery/widgets/inventory.json'), 'utf8'));
    assert.equal(inv.designTreeSha256, TREE);
  } finally { await rm(good, { recursive: true, force: true }); }

  const bad = await repoWith({ cands: candidates([['C-001', 'set-target'], ['C-002', 'list']]), parts: { 'a.json': part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01')]) } });
  const lines = [];
  try {
    assert.equal(await main(['--feature', 'widgets'], { cwd: bad, stdout: (s) => lines.push(s) }), 1);
    assert.match(lines[0], /^FAIL unclaimed C-002 \(list, /);
    assert.equal(existsSync(join(bad, 'docs/delivery/widgets/inventory.json')), false);
  } finally { await rm(bad, { recursive: true, force: true }); }
});

test('main follows the profile roots and reports usage errors with exit 2', async () => {
  const profile = { paths: { deliveryRoot: 'spec/delivery', runRoot: 'run' } };
  const dir = await repoWith({ cands: candidates([['C-001', 'set-target']]), parts: { 'a.json': part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01')]) }, profile });
  try {
    assert.equal(await main(['--feature', 'widgets'], { cwd: dir, stdout: () => {} }), 0);
    assert.ok(existsSync(join(dir, 'spec/delivery/widgets/inventory.json')));
    const out = [];
    assert.equal(await main([], { cwd: dir, stdout: (s) => out.push(s) }), 2);
    assert.match(out[0], /^FAIL usage --feature <slug> is required/);
    assert.equal(await main(['--feature', 'nope'], { cwd: dir, stdout: (s) => out.push(s) }), 2);
    assert.match(out.at(-1), /candidates\.json not found/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the script runs as a command: --help, then --json on a real directory', async () => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: node <plugin>\/skills\/design-inventory\/scripts\/assemble-inventory\.mjs --feature <slug>/);
  const dir = await repoWith({ cands: candidates([['C-001', 'set-target']]), parts: { 'a.json': part('a', [{ id: 'C-001', mappedTo: 'WL-01' }], [state('WL-01')]) } });
  try {
    const run = spawnSync(process.execPath, [SCRIPT, '--feature', 'widgets', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const doc = JSON.parse(run.stdout);
    assert.equal(doc.ok, true);
    assert.deepEqual(doc.data.counts, { candidates: 1, mapped: 1, excluded: 0, states: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
