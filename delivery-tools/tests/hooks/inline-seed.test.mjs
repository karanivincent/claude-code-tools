// B8 of the delivery feedback: inline code (node -e, -p) that mentions seed is judged like a
// seed-named script file. Read-only inline code is allowed; code that writes, or loads a seed
// module that writes or cannot be read, is still refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBash } from '../../lib/run/hook-match.mjs';

const FILES = {
  '/w/lib/seed/forbidden.mjs': "export function fixtureForbiddenTables(s) { return (s.guards ?? []).map((g) => g.id); }\n",
  '/w/scripts/seed-insert.mjs': "await supabase.from('widgets').insert(rows);\n",
};
const readFile = (path) => FILES[path] ?? null;
const seed = (cmd) => classifyBash(cmd, { cwd: '/w', readFile }).seed;

test('read-only inline code that mentions seed is allowed', () => {
  assert.equal(seed(`node -e "console.log(JSON.parse(require('fs').readFileSync('.delivery/w/seedplan.json', 'utf8')).rows.length)"`), null);
  assert.equal(seed(`node -e "import('./lib/seed/forbidden.mjs').then((m) => console.log(m.fixtureForbiddenTables({})))"`), null, 'a seed module that only reads');
  assert.equal(seed(`node -p "require('./lib/seed/forbidden.mjs').fixtureForbiddenTables"`), null);
  assert.equal(seed(`node --input-type=module -e "import { fixtureForbiddenTables } from './lib/seed/forbidden.mjs'; console.log(1)"`), null);
});

test('inline code that seeds is still refused', () => {
  assert.match(seed(`node -e "require('./scripts/seed')"`), /inline code that seeds/, 'a seed module that cannot be read');
  assert.match(seed(`node -e "import('./scripts/seed-insert.mjs')"`), /inline code that seeds/, 'a seed module that writes');
  assert.match(seed(`node -e "const seed = rows; await supabase.from('widgets').insert(seed)"`), /inline code that seeds/, 'inline code that writes');
  assert.match(seed(`node -e "require('db-seeder')"`), /inline code that seeds/, 'a seed package');
  assert.match(classifyBash(`node -e "require('./scripts/seed')"`).seed, /inline code that seeds/, 'the default reader, from disk');
});
