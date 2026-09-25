// delivery sign-in: a one-time link as a world's fixture user, and the refusals around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import signInCommand from '../../lib/commands/sign-in.mjs';
import { sampleMap } from './map.test.mjs';

async function setup({ pattern = '^delivery\\+.*@example\\.invalid$' } = {}) {
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': sampleMap({ feature: 'widgets' }) } });
  const minted = [];
  const t = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety({ fixtureUserPattern: pattern }),
  });
  t.ctx.dataBackend = { signInHash: async (email) => { minted.push(email); return 'hash123'; } };
  return { repo, minted, ...t };
}

test('sign-in prints a link as the world\'s admin that lands on the map\'s route', async () => {
  const { repo, ctx, stdout, minted } = await setup();
  try {
    assert.equal(await signInCommand.run(ctx, ['design', '--base-url', 'https://preview.example.invalid']), 0);
    assert.deepEqual(minted, ['delivery+kp-design-admin@example.invalid']);
    assert.match(stdout.text(), /https:\/\/preview\.example\.invalid\/auth\/confirm\?token_hash=hash123&type=magiclink&next=%2Fdashboard%2Fknowledge/);
    assert.match(stdout.text(), /works once/);
  } finally { repo.cleanup(); }
});

test('sign-in takes --role and --next', async () => {
  const { repo, ctx, stdout, minted } = await setup();
  try {
    assert.equal(await signInCommand.run(ctx, ['design', '--base-url', 'http://localhost:3210', '--role', 'member', '--next', '/dashboard/knowledge?view=sources']), 0);
    assert.deepEqual(minted, ['delivery+kp-design-member@example.invalid']);
    assert.match(stdout.text(), /next=%2Fdashboard%2Fknowledge%3Fview%3Dsources/);
  } finally { repo.cleanup(); }
});

test('sign-in refuses an unknown world or role, naming what exists, and mints nothing', async () => {
  const { repo, ctx, minted } = await setup();
  try {
    await assert.rejects(signInCommand.run(ctx, ['nope', '--base-url', 'http://localhost:3210']), /the worlds are: design/);
    await assert.rejects(signInCommand.run(ctx, ['design', '--base-url', 'http://localhost:3210', '--role', 'owner']), /its roles are: admin, member/);
    await assert.rejects(signInCommand.run(ctx, ['design']), /--base-url is required/);
    assert.deepEqual(minted, []);
  } finally { repo.cleanup(); }
});

test('sign-in refuses an address outside the safety file\'s fixture pattern', async () => {
  const { repo, ctx, minted } = await setup({ pattern: '^nobody@example\\.invalid$' });
  try {
    await assert.rejects(signInCommand.run(ctx, ['design', '--base-url', 'http://localhost:3210']), /not a fixture user/);
    assert.deepEqual(minted, []);
  } finally { repo.cleanup(); }
});
