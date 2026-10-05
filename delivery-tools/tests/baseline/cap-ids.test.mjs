// One route with many tabs: capability ids past CAP-999, and an in-scope route written /x?tab=y
// that keeps only that tab's capabilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { CAP_ID_RE, isStateId } from '../../lib/lifecycle/run-info.mjs';
import { isStateRow } from '../../lib/run/ready-compute.mjs';
import { extractAtRef, numberCapabilities, MAX_CAPABILITIES } from '../../lib/baseline/extract.mjs';
import { inScopePages } from '../../lib/baseline/scope.mjs';
import { PROFILE, setup } from './setup.mjs';

const cap = (id) => ({ id, kind: 'route', signature: `route:/x?tab=t${id}`, screen: 'X', evidence: [{ file: 'a.tsx', line: 1 }] });

test('capability ids run to CAP-9999: the schema, the id patterns and the numbering agree', () => {
  const baseline = { schemaVersion: 1, base: { ref: 'origin/main', sha: 'a'.repeat(40) }, capabilities: [cap('CAP-999'), cap('CAP-1000'), cap('CAP-9999')], refreshes: [] };
  assert.deepEqual(validateAgainst('baseline', baseline).errors, []);
  assert.equal(validateAgainst('baseline', { ...baseline, capabilities: [cap('CAP-10000')] }).ok, false);
  assert.ok(CAP_ID_RE.test('CAP-1000'));
  assert.ok(!isStateId('CAP-1000'));
  assert.ok(!isStateRow({ id: 'CAP-1000' }));
  assert.equal(MAX_CAPABILITIES, 9999);
  const many = numberCapabilities(Array.from({ length: 1001 }, (_, i) => ({ kind: 'copy-key', signature: `copy:k.${String(i).padStart(4, '0')}`, evidence: [] })));
  assert.equal(many.at(-1).id, 'CAP-1001');
});

test('an in-scope route written /x?tab=y keeps only that tab; written /x it keeps every tab', async () => {
  const { repo, ctx, baseSha, intent } = await setup();
  try {
    const tabbed = { ...intent, inScope: intent.inScope.map((s) => ({ ...s, routes: s.routes.map((r) => (r === '/widgets/[id]' ? '/widgets/[id]?tab=overview' : r)) })) };
    const pages = inScopePages(['apps/web/src/app/[locale]/widgets/[id]/page.tsx'], PROFILE, tabbed);
    assert.deepEqual(pages[0].tabs, ['overview']);
    const r = await extractAtRef(ctx, { ref: baseSha, profile: PROFILE, intent: tabbed });
    const sigs = new Set(r.capabilities.map((c) => c.signature));
    assert.ok(sigs.has('route:/widgets/[id]?tab=overview'));
    assert.ok(!sigs.has('route:/widgets/[id]?tab=sandbox'), 'the other tab is not this run\'s');
    assert.ok(sigs.has('route:/widgets/[id]'), 'the route itself stays');

    const all = await extractAtRef(ctx, { ref: baseSha, profile: PROFILE, intent });
    assert.ok(new Set(all.capabilities.map((c) => c.signature)).has('route:/widgets/[id]?tab=sandbox'));
  } finally { repo.cleanup(); }
});
