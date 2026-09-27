// Update runs: a new run for a page already built from an earlier design starts from that run's
// map, worlds, rules and intent, and its first round pictures the page before anything is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carryOver } from '../../lib/lifecycle/update-run.mjs';
import { pictureNext } from '../../lib/picture/next.mjs';
import { briefFiles } from '../../lib/picture/rules.mjs';

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'update-run-'));
  const fromDir = join(root, 'docs', 'delivery', 'knowledge-page');
  const toDir = join(root, 'docs', 'delivery', 'knowledge-page-update');
  mkdirSync(join(fromDir, 'worlds'), { recursive: true });
  writeFileSync(join(fromDir, 'map.json'), JSON.stringify({ feature: 'knowledge-page', states: [{ id: 'KC-05' }] }));
  writeFileSync(join(fromDir, 'intent.json'), JSON.stringify({ feature: 'knowledge-page', sentence: 'old', epic: 1947, screens: ['Knowledge'] }));
  writeFileSync(join(fromDir, 'worlds', 'design.json'), '{"id":"design"}');
  writeFileSync(join(fromDir, 'worlds', 'notes.txt'), 'not a world');
  return { root, fromDir, toDir, done: () => rmSync(root, { recursive: true, force: true }) };
}
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('an update run carries over the map, worlds and intent, renamed to the new feature and sentence', async () => {
  const d = dirs();
  try {
    const copied = await carryOver({ fromDir: d.fromDir, toDir: d.toDir, feature: 'knowledge-page-update', sentence: 'Bring it up to the new design' });
    assert.deepEqual(copied, ['map.json', 'intent.json', 'worlds/design.json']);
    assert.equal(read(join(d.toDir, 'map.json')).feature, 'knowledge-page-update');
    assert.deepEqual(read(join(d.toDir, 'map.json')).states, [{ id: 'KC-05' }]);
    const intent = read(join(d.toDir, 'intent.json'));
    assert.equal(intent.feature, 'knowledge-page-update');
    assert.equal(intent.sentence, 'Bring it up to the new design');
    assert.deepEqual(intent.screens, ['Knowledge']);
    assert.equal(existsSync(join(d.toDir, 'worlds', 'notes.txt')), false);
  } finally { d.done(); }
});

test('running it again never overwrites what the new run already changed', async () => {
  const d = dirs();
  try {
    await carryOver({ fromDir: d.fromDir, toDir: d.toDir, feature: 'knowledge-page-update', sentence: 's' });
    writeFileSync(join(d.toDir, 'map.json'), JSON.stringify({ feature: 'knowledge-page-update', states: [{ id: 'KC-05' }, { id: 'KC-40' }] }));
    const again = await carryOver({ fromDir: d.fromDir, toDir: d.toDir, feature: 'knowledge-page-update', sentence: 's' });
    assert.deepEqual(again, []);
    assert.equal(read(join(d.toDir, 'map.json')).states.length, 2);
  } finally { d.done(); }
});

test('--from a run with no picture-mode map is refused, naming the folder', async () => {
  const d = dirs();
  try {
    rmSync(join(d.fromDir, 'map.json'));
    await assert.rejects(carryOver({ fromDir: d.fromDir, toDir: d.toDir, feature: 'x', sentence: 's' }), /has no map\.json/);
  } finally { d.done(); }
});

const facts = (over = {}) => ({ designed: 5, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], phoneRenderOwed: false, ...over });

test('an update run pictures the page before building; a new run still builds first', () => {
  const next = pictureNext(facts({ update: 'knowledge-page' }), { cli: 'delivery' });
  assert.equal(next.step, 'shoot');
  assert.match(next.text, /update run from knowledge-page: picture the page as it is before building/);
  assert.equal(pictureNext(facts(), { cli: 'delivery' }).step, 'build');
});

test('after the first round, an update run fixes what the reviewers listed, like any run', () => {
  const round = { round: 1, shot: true, reviews: 2, compiled: true, counts: { match: 30, small: 2, must: 6, notReached: 0 } };
  const next = pictureNext(facts({ update: 'knowledge-page', rounds: [round], open: { must: 6, notReached: 0 } }), { cli: 'delivery' });
  assert.equal(next.step, 'fix');
});

test('briefs count from intent/ and from intake --brief copies in intent/briefs/', () => {
  const root = mkdtempSync(join(tmpdir(), 'briefs-'));
  try {
    const intentDir = join(root, 'intent');
    mkdirSync(join(intentDir, 'briefs'), { recursive: true });
    writeFileSync(join(intentDir, '01-people.md'), 'x');
    writeFileSync(join(intentDir, 'sentence.txt'), 'x');
    writeFileSync(join(intentDir, 'briefs', 'spec.md'), 'x');
    assert.deepEqual(briefFiles({ intentDir }), ['01-people.md', 'briefs/spec.md']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
