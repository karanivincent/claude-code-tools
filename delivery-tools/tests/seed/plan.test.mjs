// buildSeedPlan (lib/seed/plan.mjs): a world with no orgName used to crash resolving $orgName
// ("Cannot read properties of undefined (reading 'startsWith')") instead of naming the problem.
// Fix round (0.9.1, bug 2): a missing orgName is a clear, reportable problem like any other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedPlan } from '../../lib/seed/plan.mjs';
import { makeSafety, validExample } from '../helpers/fixtures.mjs';

const WORLD = {
  schemaVersion: 1,
  world: 'components',
  rows: [
    { key: 'org', table: 'organizations', values: { name: { $orgName: true } } },
    { key: 'member-admin', table: 'organization_members', values: { organization_id: { $ref: 'org' }, user_id: { $ref: 'user:admin' }, role: 'admin' } },
  ],
};

function planWithWorld(world) {
  const p = validExample('plan');
  p.worlds = [world];
  return p;
}

test('a world with no orgName is a clear UsageError, not a crash, resolving $orgName', () => {
  const plan = planWithWorld({ id: 'components', users: [{ role: 'admin', email: 'delivery+comp-admin@example.invalid' }] });
  assert.throws(
    () => buildSeedPlan({ feature: 'components', runId: 'r-1', project: 'p', plan, worldFiles: { components: WORLD }, safety: makeSafety() }),
    (err) => err.exit === 2 && err.failures.some((f) => /world components: no orgName set/.test(f.message)),
  );
});

test('a world with orgName resolves $orgName behind the safety prefix as usual', () => {
  const plan = planWithWorld({ id: 'components', orgName: 'Acme Store', users: [{ role: 'admin', email: 'delivery+comp-admin@example.invalid' }] });
  const seedPlan = buildSeedPlan({ feature: 'components', runId: 'r-1', project: 'p', plan, worldFiles: { components: WORLD }, safety: makeSafety() });
  const org = seedPlan.rows.find((r) => r.table === 'organizations');
  assert.equal(org.values.name, `${makeSafety().fixtureOrgPrefix}Acme Store`);
});
