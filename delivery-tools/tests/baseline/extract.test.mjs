// Baseline extraction: routes, API paths, selects, e2e assertions, every capability kind at the
// base of a synthetic redesign, the baseline command (ids never move) and the phase-2 gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProfile } from '../helpers/fixtures.mjs';
import { readArtefact, writeArtefact } from '../../lib/core/artefacts.mjs';
import baselineCommand from '../../lib/commands/baseline.mjs';
import { extractAtRef, baselineGate } from '../../lib/baseline/extract.mjs';
import { routeMatches, pageRoute, apiRoutePath } from '../../lib/baseline/scope.mjs';
import { parseSelect, analyzeE2e } from '../../lib/baseline/analyze.mjs';
import { BASE } from './app-fixture.mjs';
import { PROFILE, setup } from './setup.mjs';

const sigs = (r) => new Set(r.capabilities.map((c) => c.signature));

test('routes, API paths and matching', () => {
  assert.equal(pageRoute('apps/web/src/app/[locale]/(group)/widgets/[id]/page.tsx', ['apps/web/src/app/**/page.tsx']), '/[locale]/widgets/[id]');
  assert.ok(routeMatches('/[locale]/widgets/[id]', '/widgets/[id]'));
  assert.ok(routeMatches('/en/widgets/[*]', '/widgets/[id]'));
  assert.ok(!routeMatches('/en/widgets', '/widgets/[id]'));
  assert.equal(apiRoutePath('apps/web/src/app/api/widgets/[id]/route.ts'), '/api/widgets/[id]');
  assert.deepEqual(parseSelect('id, slug, owner:users!owner_id(name, phone), count', 'widgets'), [
    { table: 'widgets', columns: ['id', 'slug', 'count'] }, { table: 'users', columns: ['name', 'phone'] },
  ]);
});

test('e2e: titles, visits and what each test asserts', () => {
  const r = analyzeE2e('apps/web/e2e/widget-helper.spec.ts', BASE['apps/web/e2e/widget-helper.spec.ts']);
  assert.deepEqual(r.tests.map((t) => t.title), ['generating a widget spends one credit', 'the box opens beside the widget']);
  assert.deepEqual(r.tests[0].visits, ['/en/widgets/[*]']);
  assert.deepEqual(r.tests[0].assertions, ['testid:helper-generate', 'text:Overview', 'value:owner=someone', 'value:step=generate']);
});

test('extraction at the base: every kind of capability, scoped to the in-scope routes', async () => {
  const { repo, ctx, baseSha, intent } = await setup();
  try {
    const r = await extractAtRef(ctx, { ref: baseSha, profile: PROFILE, intent });
    const s = sigs(r);
    for (const want of [
      'route:/widgets', 'route:/widgets/[id]', 'route:/widgets/[id]?tab=sandbox', 'route:/widgets/[id]?tab=overview',
      'api:GET /api/widgets', 'api:GET /api/widgets/[id]',
      'api:POST /api/widgets/[id]/runs', 'api:POST /api/widgets/[id]/runs channel=sms', 'api:POST /api/widgets/[id]/runs channel=voice',
      'api:POST /api/widgets/[id]/runs mode=loopback', 'api:POST /api/widgets/[id]/runs mode=to_phone',
      'api:POST /api/widgets/[id]/helper step=generate', 'api:POST /api/widgets/[id]/helper step=refine',
      'field:widgets.slug', 'field:widgets.name',
      'copy:widgets.detail.slug', 'copy:widgets.state.on', 'copy:widgets.state.off', 'copy:widgets.list.title',
      'e2e:widget-helper.spec.ts#generating a widget spends one credit', 'e2e:widget-helper.spec.ts#the box opens beside the widget',
    ]) assert.ok(s.has(want), `missing ${want}`);
    assert.ok(![...s].some((x) => x.includes('settings')), 'out-of-scope pages and specs stay out');
    const slug = r.capabilities.find((c) => c.signature === 'field:widgets.slug');
    assert.deepEqual(slug.evidence.map((e) => e.file), ['apps/web/src/components/widgets/widget-detail.tsx', 'apps/web/src/app/api/widgets/[id]/route.ts']);
    assert.equal(slug.screen, 'Widget');
  } finally { repo.cleanup(); }
});

test('baseline command: writes baseline.json at the start SHA; a re-run keeps every id; the gate is green', async () => {
  const { repo, ctx, baseSha, stdout } = await setup();
  try {
    assert.equal(await baselineCommand.run(ctx, []), 0, stdout.text());
    const b = await readArtefact(ctx.paths, 'baseline');
    assert.equal(b.base.sha, baseSha, 'the merge base with origin/<base>: where the run started');
    assert.equal(b.capabilities[0].id, 'CAP-001');
    assert.equal(b.capabilities[0].kind, 'route');
    const ids = new Map(b.capabilities.map((c) => [c.signature, c.id]));
    assert.equal(await baselineCommand.run(ctx, []), 0);
    const again = await readArtefact(ctx.paths, 'baseline');
    for (const c of again.capabilities) assert.equal(c.id, ids.get(c.signature));
    assert.deepEqual(await baselineGate(ctx), { ok: true, failures: [] });
    await assert.rejects(baselineCommand.run(ctx, ['--ref', 'HEAD~0', '--refresh', '--against', 'HEAD']), (e) => e.exit === 2);
  } finally { repo.cleanup(); }
});

test('the phase-2 gate: a redesign needs a baseline taken on the base and contained in the branch', async () => {
  const { repo, ctx } = await setup();
  try {
    const red = await baselineGate(ctx);
    assert.equal(red.ok, false);
    assert.match(red.failures[0].message, /run delivery baseline/);
    await baselineCommand.run(ctx, []);
    const b = await readArtefact(ctx.paths, 'baseline');
    await writeArtefact(ctx.paths, 'baseline', { ...b, base: { ...b.base, sha: repo.git('rev-parse', 'HEAD') } });
    const off = await baselineGate(ctx);
    assert.match(off.failures[0].message, /not on origin\/main/);
    const intent = await readArtefact(ctx.paths, 'intent');
    await writeArtefact(ctx.paths, 'intent', { ...intent, redesign: false });
    assert.deepEqual(await baselineGate(ctx), { ok: true, failures: [] }, 'not a redesign: no baseline needed');
  } finally { repo.cleanup(); }
});
