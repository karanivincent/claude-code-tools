// The picture-mode builder agent: no isolation (it works in the run's own worktree so the dev
// server serves its changes), opus, and named where the builder is dispatched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  assert.ok(m, 'no frontmatter block');
  return Object.fromEntries(m[1].split('\n').map((l) => /^([A-Za-z]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2]]));
}

test('picture-builder has no isolation, runs on opus and carries the builder tools', () => {
  const fm = frontmatter(read('agents/picture-builder.md'));
  assert.equal(fm.name, 'picture-builder');
  assert.equal(fm.model, 'opus');
  assert.equal('isolation' in fm, false);
  for (const t of ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']) assert.match(fm.tools, new RegExp(`\\b${t}\\b`));
  assert.equal(frontmatter(read('agents/delivery-builder.md')).isolation, 'worktree', 'the contrast the new agent exists for');
});

test('its body says to commit its own work and never sign in before a world is seeded', () => {
  const body = read('agents/picture-builder.md');
  assert.match(body, /briefs\/builder-picture\.md/);
  assert.match(body, /never leave a change staged/i);
  assert.match(body, /Never sign in as a world's fixture user/);
});

test('picture-build and the builder brief name the agent, and refuse delivery-builder in picture mode', () => {
  const skill = read('skills/picture-build/SKILL.md');
  assert.match(skill, /`delivery-tools:picture-builder` agent \(Opus, high\)/);
  assert.match(skill, /fresh `delivery-tools:picture-fixer` agent \(Sonnet, medium\)/);
  assert.match(skill, /Neither is ever\s+dispatched as `delivery-tools:delivery-builder`/);
  const brief = read('briefs/builder-picture.md');
  assert.match(brief, /`delivery-tools:picture-builder` agent/);
  assert.match(brief, /never the right one here/);
});
