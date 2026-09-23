// The profile's environments.envFiles: the CLI reads the repository's own env files from the main
// checkout, because a run works in worktrees and an untracked .env exists only in the checkout the
// founder cloned. A value already in the environment always wins, and nothing is ever printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvFile, loadEnvFiles } from '../../lib/core/envfiles.mjs';

test('parseEnvFile reads KEY=VALUE, export, quotes and comments, and nothing else', () => {
  const got = parseEnvFile([
    '# comment',
    '',
    'A=1',
    'export B="two words"',
    "C='single # not a comment'",
    'D=value # trailing comment',
    'E=',
    'not a line',
    '  F = spaced ',
    'G="line\\nbreak"',
  ].join('\n'));
  assert.deepEqual(got, { A: '1', B: 'two words', C: 'single # not a comment', D: 'value', E: '', F: 'spaced', G: 'line\nbreak' });
});

test('loadEnvFiles fills only what is unset, from the main checkout, and reports names not values', async () => {
  const main = mkdtempSync(join(tmpdir(), 'envfiles-main-'));
  writeFileSync(join(main, '.env'), 'SUPABASE_SERVICE_ROLE_KEY=secret-from-file\nALREADY=from-file\n');
  mkdirSync(join(main, 'apps'), { recursive: true });
  writeFileSync(join(main, 'apps', '.env.local'), 'EXTRA=1\n');
  const env = { ALREADY: 'from-shell' };
  const res = await loadEnvFiles({ files: ['.env', 'apps/.env.local', 'missing.env'], mainRoot: main, env });
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'secret-from-file');
  assert.equal(env.ALREADY, 'from-shell', 'the shell wins');
  assert.equal(env.EXTRA, '1');
  assert.deepEqual(res.loaded.sort(), ['EXTRA', 'SUPABASE_SERVICE_ROLE_KEY']);
  assert.deepEqual(res.missing, ['missing.env']);
  assert.ok(!JSON.stringify(res).includes('secret-from-file'), 'no value ever leaves the function');
});

test('loadEnvFiles with no files does nothing', async () => {
  const env = {};
  const res = await loadEnvFiles({ files: [], mainRoot: '/nonexistent', env });
  assert.deepEqual(res, { loaded: [], missing: [] });
  assert.deepEqual(env, {});
});
