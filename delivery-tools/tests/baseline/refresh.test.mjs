// Baseline refresh: a capability that lands on the base branch mid-run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import baselineCommand from '../../lib/commands/baseline.mjs';
import { refreshBaseline } from '../../lib/baseline/refresh.mjs';
import { BASE } from './app-fixture.mjs';
import { apply, setup } from './setup.mjs';

test('refresh: a capability landing on the base mid-run gets an id, a migrate row and a decision file', async () => {
  const { repo, ctx, baseSha } = await setup();
  try {
    await baselineCommand.run(ctx, []);
    const before = await readArtefact(ctx.paths, 'baseline');
    assert.deepEqual(await refreshBaseline(ctx), { added: [], unclassed: [] }, 'nothing new on the base yet');
    repo.git('checkout', '-q', '-b', 'upstream', baseSha);
    const upstream = apply(repo, { 'apps/web/src/components/widgets/sandbox-tab.tsx': BASE['apps/web/src/components/widgets/sandbox-tab.tsx'].replace('times: 1', "times: 1, action: 'bulk-send'") }, 'upstream ships a new action');
    repo.git('update-ref', 'refs/remotes/origin/main', upstream);
    repo.git('checkout', '-q', '-');
    const profile = makeProfile({ baseline: { discriminators: ['step', 'mode', 'channel', 'action'] } });
    const { ctx: c2 } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile, safety: makeSafety(), passthrough: ['git'] });
    const early = await refreshBaseline(c2);
    assert.ok(early.added.length >= 1);
    assert.deepEqual(early.unclassed, early.added, 'no plan yet: everything new is unclassed');
    const b = await readArtefact(c2.paths, 'baseline');
    const added = b.capabilities.find((c) => c.signature === 'api:POST /api/widgets/[id]/runs action=bulk-send');
    assert.ok(added && early.added.includes(added.id), 'the new discriminator value is a capability');
    assert.ok(Number(added.id.slice(4)) > before.capabilities.length, 'appended after every id already given out');
    assert.equal(b.refreshes.length, 2);
    assert.equal(b.refreshes[1].sha, upstream);
    await writeArtefact(c2.paths, 'plan', validExample('plan'));
    const later = await refreshBaseline(c2);
    assert.deepEqual(later, { added: [], unclassed: [] }, 'the earlier arrival gets its row once a plan exists');
    const plan = await readArtefact(c2.paths, 'plan');
    assert.equal(plan.rows.find((x) => x.id === added.id).class, 'migrate');
    const decision = JSON.parse(readFileSync(join(repo.dir, `.claude/decisions/delivery-widgets-baseline-refresh-${upstream.slice(0, 9)}.json`), 'utf8'));
    assert.equal(decision.tier, 1);
    assert.match(decision.why, /action=bulk-send/);
  } finally { repo.cleanup(); }
});

test('refresh --ref, and the baseline command reports unclassed arrivals as red', async () => {
  const { repo, ctx, baseSha, stdout } = await setup();
  try {
    await baselineCommand.run(ctx, []);
    repo.git('checkout', '-q', '-b', 'upstream', baseSha);
    const upstream = apply(repo, { 'apps/web/src/components/widgets/widget-list.tsx': BASE['apps/web/src/components/widgets/widget-list.tsx'].replace("fetch('/api/widgets')", "fetch('/api/widgets?mode=compact')") }, 'upstream adds a list mode');
    repo.git('checkout', '-q', '-');
    assert.equal(await baselineCommand.run(ctx, ['--refresh', '--ref', upstream]), 1);
    assert.match(stdout.text(), /FAIL unclassed CAP-\d{3} landed on the base since the run began and has no plan row yet/);
    const b = await readArtefact(ctx.paths, 'baseline');
    assert.ok(b.capabilities.some((c) => c.signature === 'api:GET /api/widgets mode=compact'), 'a query-string discriminator');
  } finally { repo.cleanup(); }
});
