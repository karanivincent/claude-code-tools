// State and journal primitives (spec 11.1): append-only, hash-chained, exit 5 on tampering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { featurePaths } from '../../lib/core/paths.mjs';
import {
  GENESIS_PREV, initState, appendJournal, verifyJournal, loadState, saveState, updateState, createState,
  formatEvent, parseEvent, newRunId, entryHash,
} from '../../lib/core/state.mjs';
import { hashJson } from '../../lib/core/hash.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';

const AT = '2026-01-15T20:00:00.000Z';
const init = { feature: 'widgets', runId: 'r-20260115-2000-ab12', worktree: '/w', branch: 'epic/1-widgets', epic: 1, at: AT };

test('a new state has a genesis entry chained to zeros', () => {
  const s = initState(init);
  assert.equal(s.phase, 'intake');
  assert.equal(s.journal.length, 1);
  assert.equal(s.journal[0].prev, GENESIS_PREV);
  assert.equal(s.journal[0].hash, entryHash(s.journal[0]));
  assert.deepEqual(parseEvent(s.journal[0].event), { command: 'genesis', exit: null, counts: { run: 'r-20260115-2000-ab12' } });
});

test('appended entries chain; inputs and outputs are hashed', () => {
  const s = appendJournal(initState(init), { at: AT, event: 'check M7 | exit=1 | findings=3', inputs: { a: 1 }, outputs: { b: 2 } });
  assert.equal(s.journal[1].seq, 1);
  assert.equal(s.journal[1].prev, s.journal[0].hash);
  assert.equal(s.journal[1].inputs, hashJson({ a: 1 }));
  assert.deepEqual(verifyJournal(s.journal), { ok: true });
});

test('verifyJournal finds an edited, dropped or reordered entry', () => {
  let s = initState(init);
  for (let i = 0; i < 3; i++) s = appendJournal(s, { at: AT, event: `e${i}` });
  const edited = structuredClone(s.journal); edited[2].event = 'something else';
  assert.deepEqual(verifyJournal(edited), { ok: false, seq: 2, reason: 'entry 2 was edited (hash mismatch)' });
  const dropped = s.journal.filter((_, i) => i !== 1);
  assert.equal(verifyJournal(dropped).ok, false);
  assert.equal(verifyJournal([]).ok, false);
});

test('formatEvent and parseEvent round-trip', () => {
  const e = formatEvent({ command: 'seed --check', exit: 1, counts: { refused: 4, world: 'design world' } });
  assert.equal(e, 'seed --check | exit=1 | refused=4 | world=design_world');
  assert.deepEqual(parseEvent(e), { command: 'seed --check', exit: 1, counts: { refused: '4', world: 'design_world' } });
});

test('run ids are dated and random-suffixed', () => {
  assert.equal(newRunId(fakeClock('2026-01-15T20:07:00Z'), () => 'beef'), 'r-20260115-2007-beef');
});

test('on disk: create, update under a lock, load; tampering is exit 5', async () => {
  const t = makeTempDir();
  const paths = featurePaths(t.dir, 'widgets');
  try {
    await createState(paths, init);
    await assert.rejects(createState(paths, init), (e) => e.exit === 5);
    const s1 = await updateState(paths, (s) => { s.phase = 'preflight'; s.journal = []; return s; }, { at: AT, event: 'advance preflight | exit=0' });
    assert.equal(s1.phase, 'preflight');
    assert.equal(s1.journal.length, 2, 'a mutation cannot drop the journal');
    assert.deepEqual((await loadState(paths.state)).journal, s1.journal);

    const text = JSON.parse(readFileSync(paths.state, 'utf8'));
    text.journal[1].event = 'advance ready | exit=0';
    writeFileSync(paths.state, JSON.stringify(text));
    await assert.rejects(loadState(paths.state), (e) => e.exit === 5 && /chain broken at entry 1/.test(e.message));
  } finally { t.cleanup(); }
});

test('saveState refuses to rewrite history or swap the run', async () => {
  const t = makeTempDir();
  const paths = featurePaths(t.dir, 'widgets');
  try {
    let s = await createState(paths, init);
    s = await saveState(paths.state, appendJournal(s, { at: AT, event: 'one' }));
    const fork = appendJournal(initState(init), { at: AT, event: 'other' });
    await assert.rejects(saveState(paths.state, fork), (e) => e.exit === 5 && /append-only/.test(e.message));
    const shorter = { ...s, journal: s.journal.slice(0, 1) };
    await assert.rejects(saveState(paths.state, shorter), (e) => e.exit === 5);
    const other = appendJournal({ ...s, runId: 'r-other' }, { at: AT, event: 'x' });
    await assert.rejects(saveState(paths.state, other), (e) => e.exit === 5 && /run id/.test(e.message));
    const invalid = appendJournal({ ...s, phase: 'finished' }, { at: AT, event: 'x' });
    await assert.rejects(saveState(paths.state, invalid), (e) => e.exit === 5 && e.failures.some((f) => /phase/.test(f.message)));
  } finally { t.cleanup(); }
});

test('concurrent updates serialise through the lock and keep the chain', async () => {
  const t = makeTempDir();
  const paths = featurePaths(t.dir, 'widgets');
  try {
    await createState(paths, init);
    await Promise.all(Array.from({ length: 8 }, (_, i) => updateState(paths, (s) => s, { at: AT, event: `event ${i}` })));
    const s = await loadState(paths.state);
    assert.equal(s.journal.length, 9);
    assert.deepEqual(verifyJournal(s.journal), { ok: true });
  } finally { t.cleanup(); }
});
