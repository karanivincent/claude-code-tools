// delivery init (spec 16, 18): a draft that always validates, fill-ins for what cannot be inferred,
// never the safety file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { draftProfile, draftIssues, unfilled, mentionedCommands } from '../../lib/lifecycle/init.mjs';
import { validateProfile } from '../../lib/core/profile.mjs';
import initCommand from '../../lib/commands/init.mjs';

const CLAUDE_MD = [
  '# Example repo',
  '',
  '```bash',
  "node scripts/slot.mjs -- 'npm run typecheck && npm run lint && npm run build && npm test'   # full CI",
  'node tools/wait-for-ci-checks.mjs <PR-NUMBER>',
  '```',
  '',
  'Run `npm run flight` first, and `npm run tried <path>` before fixing anything.',
  'Plan with `node tools/planner.mjs`; close an epic with `node tools/close-epic.mjs <n> --evidence "<cmd>" --exit 0`.',
  'Owed migrations: `node tools/owed-migrations.mjs --project test`. Release: `node tools/pending-production.mjs`, `node tools/ledger.mjs`.',
].join('\n');

const FACTS = {
  packageJson: { scripts: { typecheck: 'tsc', lint: 'eslint .', build: 'next build', test: 'vitest', dev: 'next dev', start: 'next start', e2e: 'playwright test' } },
  claudeMd: CLAUDE_MD,
  lockfiles: ['package-lock.json'],
  files: ['apps/web/messages/en.json', 'apps/web/messages/fr.json', 'apps/web/e2e/home.spec.ts', 'apps/web/src/app/page.tsx', 'apps/web/src/components/button.tsx', 'packages/types/src/database.types.ts'],
  remoteUrl: 'git@github.com:example-org/example-repo.git',
  defaultBranch: 'main',
};

test('the draft validates, infers what the repo shows, and marks the rest to fill in', () => {
  const p = draftProfile(FACTS);
  assert.deepEqual(draftIssues(p), []);
  assert.equal(p.repo.slug, 'example-org/example-repo');
  assert.equal(p.commands.heavy, "node scripts/slot.mjs -- '{cmd}'");
  assert.equal(p.commands.gate, 'npm run typecheck && npm run lint && npm run build && npm test');
  assert.equal(p.commands.ciWait, 'node tools/wait-for-ci-checks.mjs {pr}');
  assert.equal(p.commands.flight, 'npm run flight');
  assert.equal(p.commands.tried, 'npm run tried {spec}');
  assert.equal(p.commands.planner, 'node tools/planner.mjs');
  assert.equal(p.commands.epicClose, 'node tools/close-epic.mjs {epic} --evidence "node scripts/delivery.mjs land --check --epic {epic}" --exit 0');
  assert.equal(p.commands.migrationsOwed, 'node tools/owed-migrations.mjs --project test');
  assert.equal(p.commands.ledgerFetch, 'node tools/ledger.mjs --project {project}');
  assert.deepEqual(p.paths.messages, [{ locale: 'en', file: 'apps/web/messages/en.json' }, { locale: 'fr', file: 'apps/web/messages/fr.json' }]);
  assert.equal(p.paths.captureSpec, 'apps/web/e2e/delivery-capture.spec.ts');
  assert.deepEqual(p.paths.appRouteGlobs, ['apps/web/src/app/**/page.tsx']);
  assert.equal(p.claims.verify, 'planner');
  const todo = unfilled(p);
  assert.ok(todo.includes('/founder/github'));
  assert.ok(todo.includes('/commands/previewUrl'));
  assert.ok(validateProfile(p).some((i) => i.path === '/commands/previewUrl' && /unfilled/.test(i.message)), 'P1 reports every command left to fill');
  assert.equal(p.safetyFile, '.claude/delivery-safety.json');
});

test('a bare repo still gives a valid draft', () => {
  const p = draftProfile({ packageJson: null, claudeMd: '', lockfiles: [], files: [], remoteUrl: null, defaultBranch: null });
  assert.deepEqual(draftIssues(p), []);
  assert.equal(p.repo.base, 'main');
  assert.ok(unfilled(p).includes('/repo/slug'));
  assert.equal(p.commands.heavy, '{cmd}');
  assert.deepEqual(mentionedCommands('use `ls -la` and `node x.mjs`'), ['node x.mjs']);
});

test('init writes the profile once, never the safety file; --print only prints', async () => {
  const repo = makeTempRepo({ files: { 'package.json': JSON.stringify(FACTS.packageJson), 'CLAUDE.md': CLAUDE_MD } });
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, passthrough: ['git'] });
    assert.equal(await initCommand.run(ctx, ['--print']), 0);
    assert.equal(existsSync(join(repo.dir, '.claude/delivery-profile.json')), false);
    assert.match(stdout.text(), /"schemaVersion": 1/);
    assert.equal(await initCommand.run(ctx, []), 0);
    const written = JSON.parse(readFileSync(join(repo.dir, '.claude/delivery-profile.json'), 'utf8'));
    assert.deepEqual(draftIssues(written), []);
    assert.equal(existsSync(join(repo.dir, '.claude/delivery-safety.json')), false);
    assert.equal(await initCommand.run(ctx, []), 2);
  } finally { repo.cleanup(); }
});
