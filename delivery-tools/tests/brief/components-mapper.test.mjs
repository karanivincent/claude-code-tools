// briefs/components-mapper.md (fix round, 0.9.1 bug 3): a mapper that only grepped the design's own
// words for `replaces` missed a shared `date-time-picker` in the base folder and a
// `compact-date-picker` elsewhere for DatePicker. The brief must tell the mapper to grep file
// NAMES (not only contents) for the component name and its parts, to list every caller of a base
// entry's own library, to account for every hit (either a `replaces` entry or named as deliberately
// left out, with why), and to put a base entry that is itself a copy of the component into
// `replaces` too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIEF = readFileSync(join(ROOT, 'briefs', 'components-mapper.md'), 'utf8');

test('grep file names, not only contents, for the component name and its parts', () => {
  assert.match(BRIEF, /grep file names/i);
  assert.match(BRIEF, /its parts/i);
});

test('lists every file importing a library a composed base entry owns', () => {
  assert.match(BRIEF, /importing a library a base entry .* composes owns/i);
});

test('every hit is a replaces entry or named as deliberately left out, with why', () => {
  assert.match(BRIEF, /deliberately left out/i);
});

test('a base entry that is itself a copy of the component goes in replaces', () => {
  assert.match(BRIEF, /base entry.*itself a copy of the component/i);
});
