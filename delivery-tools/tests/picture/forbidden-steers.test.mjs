// B7 of the delivery feedback: review planning tells reviewers that values from the tables no
// fixture organisation may hold are test-data gaps, once, in steers.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeSafety } from '../helpers/fixtures.mjs';
import reviewCommand from '../../lib/commands/review.mjs';

const rec = { reached: true, problems: [], buttons: [], factsAgree: false, pixelDiff: 0.2, liveHash: 'L', designHash: 'D' };
const MAP = {
  schemaVersion: 1, feature: 'widgets', kind: 'new', route: '/w',
  worlds: [{ id: 'design', users: [{ role: 'admin', email: 'delivery+w@example.invalid' }] }],
  states: [{ id: 'W-01', screen: 'W', name: 'List', reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }] }, buttons: [] }],
};

test('review --plan adds one steer per forbidden table, once, and every prompt carries it', async () => {
  const repo = makeTempRepo({ files: {
    'docs/delivery/widgets/map.json': MAP,
    'docs/delivery/widgets/steers.md': '- The avatar colours are random.\n',
    '.delivery/widgets/rounds/1/shoot.json': { states: { 'W-01': rec } },
  } });
  try {
    // The default test safety file probes org_lines with a plain count expecting 0.
    const { ctx } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', safety: makeSafety() });
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    assert.equal(await reviewCommand.run(ctx, ['--plan', '--round', '1']), 0);
    const steers = readFileSync(join(repo.dir, 'docs/delivery/widgets/steers.md'), 'utf8');
    assert.match(steers, /^- The avatar colours are random\.$/m, 'the steers already there stay');
    assert.equal(steers.match(/Values from org_lines are test-data gaps/g)?.length, 1, 'added once');
    assert.match(readFileSync(join(repo.dir, '.delivery/widgets/rounds/1/batch-1.prompt.md'), 'utf8'), /Values from org_lines are test-data gaps.*`data gap:`/);
  } finally { repo.cleanup(); }
});
