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
  assert.deepEqual(res.counts, { candidates: 3, mapped: 2, excluded: 1, outOfScope: 0, states: 2 });
});

// A design export is the whole project: Calls is in scope, Scripts is not.
const SCOPED_INTENT = {
  inScope: [{ screen: 'Calls', routes: ['/dashboard/calls'], designScreens: ['calls', 'call'] }],
  outOfScope: [{ screen: 'Scripts', why: 'in the export for context only', designScreens: ['scripts', 'script'], routes: ['/dashboard/scripts'] }],
};

function scopedCandidates() {
  const doc = candidates([['C-001', 'list'], ['C-002', 'ternary'], ['C-003', 'ternary'], ['C-004', 'set-target'], ['C-005', 'dialog']]);
  doc.screens = { key: 'screen', values: ['call', 'calls', 'script', 'scripts'] };
  doc.candidates[0].screens = ['calls'];
  doc.candidates[1].screens = ['script'];
  doc.candidates[2].screens = ['script', 'scripts'];
  doc.candidates[3].screens = ['calls', 'script'];
  // C-005 carries no screens: the adapter could not tie it to any
  return doc;
}

test('candidates shown only on out-of-scope screens are excluded with no group claiming them', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: scopedCandidates(),
    intent: SCOPED_INTENT,
    parts: [{ file: 'extract/calls.json', doc: part('calls', [
      { id: 'C-001', mappedTo: 'CL-01' }, { id: 'C-004', mappedTo: 'CL-01' },
      { id: 'C-005', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
    ], [state('CL-01')]) }],
  });
  assert.deepEqual(res.failures, []);
  const byId = new Map(res.inventory.candidates.map((c) => [c.id, c]));
  assert.equal(byId.get('C-002').excluded.reason, 'out of scope: Scripts');
  assert.equal(byId.get('C-003').excluded.reason, 'out of scope: Scripts');
  assert.deepEqual(res.counts, { candidates: 5, mapped: 2, excluded: 3, outOfScope: 3, states: 1 });
  assert.deepEqual(res.notes, [], 'one screen left out is one reason, never a note');
});

test('a candidate on an in-scope screen, or on no screen the adapter could name, is never excluded by itself', () => {
  const res = assembleInventory({ feature: 'widgets', candidates: scopedCandidates(), intent: SCOPED_INTENT, parts: [{ file: 'extract/calls.json', doc: part('calls', [], []) }] });
  assert.deepEqual(res.failures.filter((f) => f.code === 'unclaimed').map((f) => f.message.split(' ')[0]).sort(), ['C-001', 'C-004', 'C-005']);
});

test('an out-of-scope exclusion must name an out-of-scope screen, and never covers an in-scope candidate', () => {
  const res = assembleInventory({
    feature: 'widgets',
    candidates: scopedCandidates(),
    intent: SCOPED_INTENT,
    parts: [{ file: 'extract/calls.json', doc: part('calls', [
      { id: 'C-001', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
      { id: 'C-004', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
      { id: 'C-005', mappedTo: null, excluded: { reason: 'out of scope: Knowledge' } },
    ], []) }],
  });
  const bad = res.failures.filter((f) => f.code === 'bad-scope').map((f) => f.message);
  assert.equal(bad.length, 3, JSON.stringify(res.failures));
  assert.match(bad.join('\n'), /C-001 .*shows on in-scope screens \(calls\)/);
  assert.match(bad.join('\n'), /C-004 .*shows on in-scope screens \(calls\)/, 'shown on Calls and Scripts, it is a Calls state');
  assert.match(bad.join('\n'), /C-005 .*"Knowledge" is not an out-of-scope screen/);
});

test('with no intent, or an intent that names no design screens, nothing is excluded by scope', () => {
  for (const intent of [null, { inScope: [{ screen: 'Calls', routes: [] }], outOfScope: [{ screen: 'Scripts', why: 'context' }] }]) {
    const res = assembleInventory({ feature: 'widgets', candidates: scopedCandidates(), intent, parts: [{ file: 'extract/a.json', doc: part('a', [], []) }] });
    assert.equal(res.failures.filter((f) => f.code === 'unclaimed').length, 5);
  }
  const noted = assembleInventory({ feature: 'widgets', candidates: scopedCandidates(), intent: { inScope: [{ screen: 'Calls', routes: [] }], outOfScope: [] }, parts: [] });
  assert.match(noted.notes.join('\n'), /names no design screen for Calls/);
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
    assert.deepEqual(doc.data.counts, { candidates: 1, mapped: 1, excluded: 0, outOfScope: 0, states: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main reads intent.json beside the inventory and excludes the out-of-scope screens it names', async () => {
  const dir = await repoWith({ cands: scopedCandidates(), parts: { 'calls.json': part('calls', [
    { id: 'C-001', mappedTo: 'CL-01' }, { id: 'C-004', mappedTo: 'CL-01' },
    { id: 'C-005', mappedTo: null, excluded: { reason: 'out of scope: Scripts' } },
  ], [state('CL-01')]) } });
  try {
    await mkdir(join(dir, 'docs/delivery/widgets'), { recursive: true });
    await writeFile(join(dir, 'docs/delivery/widgets/intent.json'), JSON.stringify(SCOPED_INTENT));
    const out = [];
    assert.equal(await main(['--feature', 'widgets'], { cwd: dir, stdout: (s) => out.push(s) }), 0, out.join('\n'));
    assert.match(out.join('\n'), /5 candidates \(2 mapped, 3 excluded, 3 of them on out-of-scope screens\), 1 states/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// A plugin is reached through a symlink, and a symlink broke this silently. `import.meta.url` is
// always the real path; `process.argv[1]` is the path the caller typed. Installed from a
// marketplace that links to a checkout, the two differ, the run-directly guard was false, and the
// script exited 0 having printed nothing and written nothing. A silent no-op that reports success
// is the worst failure shape there is: the phase it belongs to just looks finished.
test('run through a symlink it still runs, rather than exiting 0 in silence', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: j, dirname: d } = await import('node:path');
  const { fileURLToPath: f } = await import('node:url');

  const real = j(d(f(import.meta.url)), 'assemble-inventory.mjs');
  const link = j(mkdtempSync(j(tmpdir(), 'assemble-link-')), 'assemble-inventory.mjs');
  symlinkSync(real, link);

  // --help is enough: it proves main() ran at all, which is the whole bug, and needs no fixture.
  const viaLink = execFileSync('node', [link, '--help'], { encoding: 'utf8' });
  const viaReal = execFileSync('node', [real, '--help'], { encoding: 'utf8' });
  assert.ok(viaLink.trim().length > 0, 'through a symlink it printed nothing at all');
  assert.equal(viaLink, viaReal, 'a symlink must not change what it does');
});
