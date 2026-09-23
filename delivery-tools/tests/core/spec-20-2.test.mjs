// Spec 20.2 is the Trust rule's cheap half: ten claims, each of which must fail on the REAL bad
// artefact rather than on a fixture invented to make it pass. The tests that answer them are
// spread across seven files, and nothing tied them to the spec's own table — so a rename or a
// deletion would quietly make 20.2's claim false while the suite stayed green.
//
// This file is that tie. It does not re-check the checks; it fails when the test that answers a
// row is no longer there under the name the row was signed off with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One entry per row of the spec's 20.2 table. `needle` is matched against the file's text. */
const ROWS = [
  { row: 'M7 on audit/live/*.txt', answers: [
    ['tests/checks/replay.test.mjs', 'M7 flags every must-flag element with the right rule and none of the must-not-flag ones'],
    ['tests/checks/replay.test.mjs', 'M7 through the check: every must-flag element becomes a finding on its state'],
  ] },
  { row: 'M13 on the seed dry run', answers: [
    ['tests/seed/replay.test.mjs', 'M13 refuses the design seed dry run on each named count'],
    ['tests/seed/replay.test.mjs', 'M13 refuses the synthetic practice-run row on its three counts'],
  ] },
  { row: 'sidefx on the base branch', answers: [
    ['tests/sidefx/derive.test.mjs', 'sidefx on the base branch derives the resume and claim predicates'],
  ] },
  { row: 'M2 against the merge base', answers: [
    ['tests/baseline/replay.test.mjs', 'M2 reports the lost capabilities between the merge base and the epic head'],
  ] },
  { row: 'M3 on the real capture set', answers: [
    ['tests/checks/replay.test.mjs', 'M3 refuses every capture expected/m3.json names'],
  ] },
  { row: 'M1 on a plan derived from the real build spec', answers: [
    ['tests/plan/replay.test.mjs', 'M1 names every feature expected/m1.json lists as unowned or cut without a reason'],
  ] },
  { row: 'M8 on the four message files', answers: [
    ['tests/checks/replay.test.mjs', 'M8 reproduces expected/m8.json'],
  ] },
  { row: 'ci on a conflicting-PR fixture', answers: [
    ['tests/github/ci.test.mjs', 'ci says mergeable: CONFLICTING first on the recorded conflicting PR'],
  ] },
  { row: 'Resume', answers: [
    ['tests/run/resume.test.mjs', 'killed mid-wave: status continues the dead builder, dispatches the rest, never a finished unit'],
    ['tests/github/issues.test.mjs', 'issues sync run twice creates nothing and writes nothing the second time'],
    ['tests/hooks/replay.test.mjs', 'status on the real repository finds no run and prints one NEXT line'],
  ] },
  { row: 'Hooks', answers: [
    ['tests/hooks/run.test.mjs', 'gh pr ready for the run PR: refused with no ready.json, allowed when green, refused on a stale head'],
    ['tests/hooks/run.test.mjs', 'gh pr ready is refused while ready.json is red'],
    ['tests/hooks/run.test.mjs', 'a browser call carrying an agent_id is refused during a run'],
    ['tests/hooks/replay.test.mjs', 'hooks on the real repository: silent, exit 0, under 50 ms with no run'],
  ] },
];

test('every row of spec 20.2 is answered by a test that still exists under its own name', () => {
  assert.equal(ROWS.length, 10, 'the spec 20.2 table has ten rows');
  const missing = [];
  for (const { row, answers } of ROWS) {
    for (const [file, needle] of answers) {
      const path = join(ROOT, file);
      if (!existsSync(path)) { missing.push(`${row}: ${file} does not exist`); continue; }
      if (!readFileSync(path, 'utf8').includes(needle)) missing.push(`${row}: ${file} no longer has "${needle}"`);
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('every corpus-backed answer declares what it needs, so a skip names an absent thing', () => {
  // A replay test that skipped for no stated reason would look identical to one that passed.
  // `replayTest(name, { needs: [...] })` is how each says which corpus file it reads.
  const undeclared = [];
  for (const { row, answers } of ROWS) {
    for (const [file, needle] of answers) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      const at = text.indexOf(needle);
      const line = text.slice(text.lastIndexOf('\n', at) + 1, text.indexOf('\n', at));
      if (!line.startsWith('replayTest(')) continue;            // not corpus-backed; nothing to declare
      if (!line.includes('needs:')) undeclared.push(`${row}: ${file} — "${needle}" is a replayTest with no needs:`);
    }
  }
  assert.deepEqual(undeclared, [], undeclared.join('\n'));
});
