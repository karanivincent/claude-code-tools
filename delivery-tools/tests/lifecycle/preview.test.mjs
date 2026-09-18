// Preview resolution by SHA (spec 4.5, 4.6): the resolver's last URL; waiting is pending, a failed
// build is not; a repo without previews says a local production build stands in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { ok, fail } from '../helpers/runner-stub.mjs';
import { resolvePreview, lastUrl } from '../../lib/lifecycle/preview.mjs';

const SHA = 'f'.repeat(40);

async function look(result, profile = makeProfile()) {
  const dir = makeTempDir();
  try {
    const { ctx, runner } = await makeTestCtx({ repoRoot: dir.dir, profile, rules: [{ match: `PREVIEW_SHA=${SHA} node scripts/resolve-preview.mjs`, result }] });
    return { res: await resolvePreview(ctx, { sha: SHA }), runner };
  } finally { dir.cleanup(); }
}

test('the last URL the resolver printed is the preview', async () => {
  const { res } = await look(ok(`Looking for the preview of ${SHA} (see https://docs.example.invalid).\nPreview deployment is live at https://widgets-abc.example.invalid.`));
  assert.deepEqual(res, { url: 'https://widgets-abc.example.invalid', pending: false, detail: `preview for fffffff: https://widgets-abc.example.invalid` });
});

test('still waiting is pending; a failed build is not; exit 0 without a URL is a failure', async () => {
  assert.equal((await look(fail(1, 'No preview deployment became ready within 900s. Refusing to run.'))).res.pending, true);
  assert.equal((await look({ code: 124, stdout: '', stderr: '' })).res.pending, true);
  const failed = (await look(fail(1, 'The preview deployment failed to build, so there is nothing to test.'))).res;
  assert.deepEqual([failed.url, failed.pending], [null, false]);
  assert.match(failed.detail, /failed to build/);
  const silent = (await look(ok('done'))).res;
  assert.match(silent.detail, /printed no URL/);
});

test('a repo without previews needs no resolver', async () => {
  const { res, runner } = await look(ok('x'), makeProfile({ environments: { ...makeProfile().environments, previews: 'none' } }));
  assert.equal(res.url, null);
  assert.match(res.detail, /a local production build stands in \(npm run build, then npm start -- -p \{port\}\)/);
  assert.equal(runner.calls.length, 0);
  assert.equal(lastUrl('no url here'), null);
});
