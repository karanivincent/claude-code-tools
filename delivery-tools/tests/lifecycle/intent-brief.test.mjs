// The extractor brief's intent part shows the exact shape of intent.json: the example in it must
// be a valid intent once intake rewrites `design`, with no key the schema does not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { validExample } from '../helpers/fixtures.mjs';

const BRIEF = join(dirname(fileURLToPath(import.meta.url)), '../../briefs/extractor-design.md');

/** The first ```json block of a section of the brief. */
function jsonBlock(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `no "${heading}" section`);
  const end = text.indexOf('\n## ', start + heading.length);
  const section = text.slice(start, end < 0 ? text.length : end);
  const m = /```json\n([\s\S]*?)\n```/.exec(section);
  assert.ok(m, `no json example in "${heading}"`);
  return JSON.parse(m[1]);
}

test('the intent part shows intent.json exactly: it validates once intake fills design, and has only schema keys', () => {
  const example = jsonBlock(readFileSync(BRIEF, 'utf8'), '## Part `intent`');
  const required = ['schemaVersion', 'feature', 'epic', 'sentence', 'design', 'job', 'users', 'inScope', 'outOfScope', 'requested', 'widths', 'themes', 'locales', 'rollout', 'analytics', 'redesign'];
  assert.deepEqual(Object.keys(example).sort(), [...required].sort(), 'every required key and no other');
  const filled = { ...example, design: validExample('intent').design };
  assert.deepEqual(validateAgainst('intent', filled).errors, []);
  assert.ok(example.users.every((u) => Array.isArray(u.can) && u.can.every((c) => typeof c === 'string')), 'users[].can is a list of strings');
  assert.ok(example.inScope.every((s) => typeof s.screen === 'string'));
  assert.equal(Array.isArray(example.widths), false);
  assert.deepEqual(Object.keys(example.widths), example.inScope.map((s) => s.screen), 'widths is keyed by in-scope screen');
});
