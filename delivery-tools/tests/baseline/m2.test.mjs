// M2 on a synthetic redesign: lost capabilities with and without plan rows, e2e assertions matched
// by what they assert, and losses that happened on the base branch itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validExample } from '../helpers/fixtures.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import { readFindings } from '../../lib/core/findings.mjs';
import baselineCommand from '../../lib/commands/baseline.mjs';
import { checkM2 } from '../../lib/baseline/diff.mjs';
import { apply, setup } from './setup.mjs';

test('M2 with no plan rows: each dropped capability is P1, and the rewritten test is matched by what it asserted', async () => {
  const { repo, ctx } = await setup();
  try {
    await baselineCommand.run(ctx, []);
    const findings = await checkM2(ctx, { against: 'HEAD' });
    const lost = (sig) => findings.find((f) => f.where === sig);
    for (const sig of ['api:POST /api/widgets/[id]/helper step=generate', 'api:POST /api/widgets/[id]/runs channel=sms', 'field:widgets.slug', 'route:/widgets/[id]?tab=sandbox']) {
      assert.equal(lost(sig)?.severity, 'P1', `${sig} is reported lost`);
      assert.equal(lost(sig).rule, 'lost');
    }
    const e2e = findings.filter((f) => f.where.startsWith('e2e:') && f.severity === 'P1');
    assert.equal(e2e.length, 1, 'the carried test is not reported');
    assert.match(e2e[0].live, /it asserted testid:helper-generate/);
    assert.match(e2e[0].live, /likely rewrite "rewriting a widget spends one credit" asserts testid:helper-rewrite/);
    assert.ok(!lost('api:POST /api/widgets/[id]/helper step=refine'), 'kept capabilities are not reported');
    assert.ok(findings.every((f) => f.source === 'check:M2' && f.evidence === 'code-read'));
    const head = await readArtefact(ctx.paths, 'baseline-head');
    assert.ok(head.capabilities.some((c) => c.signature === 'route:/widgets/[id]?tab=trial'));
  } finally { repo.cleanup(); }
});

test('M2 with plan rows: remove, migrate, keep and an e2e mapping each decide their capability', async () => {
  const { repo, ctx, stdout } = await setup();
  try {
    await baselineCommand.run(ctx, []);
    const b = await readArtefact(ctx.paths, 'baseline');
    const id = (sig) => b.capabilities.find((c) => c.signature === sig).id;
    const row = (capId, cls, extra = {}) => ({ id: capId, class: cls, owner: null, requested: null, invented: false, data: [], backend: [], controls: [], copy: [], dayOne: false, invariants: [], ...extra });
    const plan = validExample('plan');
    plan.rows = [
      row(id('api:POST /api/widgets/[id]/helper step=generate'), 'remove', { scopeLine: 'S1' }),
      row(id('route:/widgets/[id]?tab=sandbox'), 'migrate', { migrateTo: { file: 'apps/web/src/components/widgets/trial-tab.tsx', control: 'trial-tab' } }),
      row(id('api:POST /api/widgets/[id]/runs channel=sms'), 'migrate', { migrateTo: { file: 'apps/web/src/components/widgets/trial-tab.tsx', control: 'SMS' } }),
      row(id('field:widgets.slug'), 'keep'),
      row(id('api:GET /api/widgets'), 'remove', { scopeLine: 'S2' }),
      row(id('copy:widgets.detail.slug'), 'keep'),
      row(id('copy:widgets.tabs.overview'), 'keep'),
      row(id('e2e:widget-helper.spec.ts#generating a widget spends one credit'), 'change', { e2eMap: [{ baseTest: 'generating a widget spends one credit', branchTest: 'rewriting a widget spends one credit' }] }),
    ];
    await writeArtefact(ctx.paths, 'plan', plan);
    const exit = await baselineCommand.run(ctx, ['--against', 'HEAD']);
    assert.equal(exit, 1);
    const findings = (await readFindings(ctx.paths, 'r')).findings.filter((f) => f.status === 'open');
    const by = (sig) => findings.find((f) => f.where === sig);
    assert.equal(by('api:POST /api/widgets/[id]/helper step=generate'), undefined, 'removed through a Scope line: not lost');
    assert.equal(by('route:/widgets/[id]?tab=sandbox'), undefined, 'the tab migrated to a file that names its control');
    assert.equal(by('api:POST /api/widgets/[id]/runs channel=sms').rule, 'lost');
    assert.equal(by('field:widgets.slug').rule, 'lost');
    assert.equal(by('api:GET /api/widgets').rule, 'remove-still-present');
    assert.equal(by('copy:widgets.detail.slug').rule, 'kept-copy-gone');
    assert.equal(by('copy:widgets.tabs.overview'), undefined, 'a kept key still rendered is fine');
    assert.equal(by('copy:widgets.list.title').rule, 'retired-copy-rendered');
    assert.equal(by('e2e:widget-helper.spec.ts#generating a widget spends one credit').rule, 'e2e-mapped-mismatch');
    assert.match(stdout.text(), /FAIL M2-P1 CAP-\d{3} field:widgets\.slug: lost at HEAD@/);
  } finally { repo.cleanup(); }
});

test("M2: a capability the base branch itself dropped after the run began is not this branch's loss", async () => {
  const { repo, ctx, baseSha } = await setup();
  try {
    await baselineCommand.run(ctx, []);
    repo.git('checkout', '-q', '-b', 'upstream', baseSha);
    const upstream = apply(repo, { 'apps/web/src/components/widgets/widget-list.tsx': "'use client';\nexport function WidgetList() { return <h1>Widgets</h1>; }\n" }, 'upstream drops the list fetch');
    repo.git('update-ref', 'refs/remotes/origin/main', upstream);
    repo.git('checkout', '-q', '-');
    repo.git('merge', '-q', '--no-edit', 'upstream');
    const findings = await checkM2(ctx, { against: 'HEAD' });
    assert.ok(!findings.some((f) => f.where === 'api:GET /api/widgets'), 'dropped on the base branch, merged in');
    assert.ok(findings.some((f) => f.where === 'field:widgets.slug'), "this branch's own losses still count");
  } finally { repo.cleanup(); }
});
