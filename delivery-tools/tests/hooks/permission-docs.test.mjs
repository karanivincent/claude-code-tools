// B9 of the delivery feedback: a run's commands are approved once by an allow rule, and only stay
// approved when they are run bare. The docs and the picture-build skill say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('OPERATING.md names the allow rule and the command shapes that make the harness ask', () => {
  const doc = read('docs/OPERATING.md');
  const section = doc.slice(doc.indexOf('### Permission prompts'));
  assert.ok(doc.includes('### Permission prompts'), 'a Permission prompts section');
  assert.match(section, /"Bash\(node scripts\/delivery\.mjs:\*\)"/);
  assert.match(section, /`cd … &&`/);
  assert.match(section, /`VAR=value`/);
  assert.match(section, /`\$\(…\)`/);
});

test('the picture-build skill says to run delivery commands bare, from the worktree root', () => {
  assert.match(read('skills/picture-build/SKILL.md'), /Run every delivery command bare, from the worktree root/);
});
