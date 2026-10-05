// A5: shipping checks after every round, not only at ship. After a round's review is compiled and
// before the next fixer, NEXT asks for `delivery prepush --round <n>`, which also runs the profile's
// commands.security and records rounds/<n>/prepush.json; the fixer fixes what it lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import prepushCommand from '../../lib/commands/prepush.mjs';
import { pictureFacts, pictureNext } from '../../lib/picture/next.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { makeTempRepo, makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { fail, ok } from '../helpers/runner-stub.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';

async function setup({ security = null, rules = [] } = {}) {
  const profile = makeProfile();
  if (security) profile.commands = { ...profile.commands, security };
  const repo = makeTempRepo({ files: { '.gitignore': '.delivery/\n', '.claude/delivery-profile.json': profile, '.claude/delivery-safety.json': makeSafety() } });
  const bare = makeTempDir('delivery-origin-');
  execFileSync('git', ['clone', '-q', '--bare', repo.dir, bare.dir]);
  repo.git('remote', 'add', 'origin', bare.dir);
  repo.git('fetch', '-q', 'origin');
  repo.git('checkout', '-q', '-b', 'feature');
  mkdirSync(join(repo.dir, '.delivery/widgets/rounds/2'), { recursive: true });
  const t = await makeTestCtx({ repoRoot: repo.dir, passthrough: ['git'], profile, feature: 'widgets', rules });
  return { repo, ...t, file: join(repo.dir, '.delivery/widgets/rounds/2/prepush.json'), cleanup() { repo.cleanup(); bare.cleanup(); } };
}

test('prepush --round <n> runs commands.security and records the result in the round folder', async () => {
  const s = await setup({ security: 'pnpm security', rules: [{ match: 'pnpm security', result: fail(1, 'high: a service key reaches a client file\n1 finding') }] });
  try {
    assert.equal(await prepushCommand.run(s.ctx, ['--round', '2']), 1);
    assert.match(s.stdout.text(), /FAIL security pnpm security exited 1:/);
    const doc = JSON.parse(readFileSync(s.file, 'utf8'));
    assert.equal(doc.round, 2);
    assert.equal(doc.ok, false);
    assert.equal(doc.security.command, 'pnpm security');
    assert.equal(doc.security.exit, 1);
    assert.match(doc.security.tail, /a service key reaches a client file/);
    assert.deepEqual(doc.problems.map((p) => p.code), ['security']);
    assert.match(doc.head, /^[0-9a-f]{40}$/);
  } finally { s.cleanup(); }
});

test('prepush --round <n> with a clean branch and a passing scan records ok; without --round nothing is recorded and no scan runs', async () => {
  const s = await setup({ security: 'pnpm security', rules: [{ match: 'pnpm security', result: ok('no findings') }] });
  try {
    assert.equal(await prepushCommand.run(s.ctx, []), 0);
    assert.equal(existsSync(s.file), false);
    assert.ok(!s.runner.texts().some((t) => t.includes('pnpm security')), 'the scan runs only with --round');
    assert.equal(await prepushCommand.run(s.ctx, ['--round', '2']), 0);
    assert.match(s.stdout.text(), /prepush: clean, and pnpm security passed/);
    const doc = JSON.parse(readFileSync(s.file, 'utf8'));
    assert.equal(doc.ok, true);
    assert.equal(doc.security.exit, 0);
  } finally { s.cleanup(); }
});

test('prepush --round <n> without commands.security records security null; a round with no folder is a usage error', async () => {
  const s = await setup();
  try {
    assert.equal(await prepushCommand.run(s.ctx, ['--round', '2']), 0);
    assert.equal(JSON.parse(readFileSync(s.file, 'utf8')).security, null);
    await assert.rejects(prepushCommand.run(s.ctx, ['--round', '7']), /round 7 has no folder yet/);
  } finally { s.cleanup(); }
});

test('NEXT asks for the shipping checks after a compiled round and before the fixer, once', async () => {
  const facts = { designed: 4, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, shootArgs: '' };
  const round = { round: 2, shot: true, reviews: 2, compiled: true, counts: { must: 3, notReached: 0 } };
  const owed = pictureNext({ ...facts, rounds: [{ ...round, prepushOwed: true }] }, { cli: 'delivery' });
  assert.equal(owed.step, 'prepush');
  assert.match(owed.text, /round 2: run the shipping checks before the fixer: delivery prepush --round 2\. It also runs the profile's commands\.security when set, and records rounds\/2\/prepush\.json/);
  const done = pictureNext({ ...facts, rounds: [{ ...round, prepushOwed: false }] }, { cli: 'delivery' });
  assert.equal(done.step, 'fix');
  assert.match(done.text, /send the fixer round 2's review\.json and prepush\.json/);
  // A round that ships asks for nothing new: prepush runs at ship as before.
  const ship = pictureNext({ ...facts, rounds: [{ ...round, counts: { must: 0, notReached: 0 }, prepushOwed: true }], open: { must: 0, notReached: 0, data: 0 } }, { cli: 'delivery' });
  assert.equal(ship.step, 'ship');

  const repo = makeTempRepo({ files: { '.delivery/widgets/rounds/2/shoot.json': { states: {} } } });
  try {
    const paths = featurePaths(repo.dir, 'widgets');
    assert.equal((await pictureFacts(paths)).rounds[0].prepushOwed, true);
    repo.write({ '.delivery/widgets/rounds/2/prepush.json': { schemaVersion: 1, round: 2, ok: true, problems: [], security: null } });
    assert.equal((await pictureFacts(paths)).rounds[0].prepushOwed, false);
  } finally { repo.cleanup(); }
});

test('the fixer brief and the skill name the round\'s prepush.json', () => {
  const root = join(import.meta.dirname, '..', '..');
  const read = (rel) => readFileSync(join(root, rel), 'utf8');
  assert.match(read('skills/picture-build/SKILL.md'), /Prepush: \.delivery\/<f>\/rounds\/<n-1>\/prepush\.json/);
  assert.match(read('skills/picture-build/SKILL.md'), /delivery prepush --round <n>/);
  assert.match(read('briefs/builder-picture.md'), /prepush\.json/);
  assert.match(read('agents/picture-fixer.md'), /prepush\.json/);
});
