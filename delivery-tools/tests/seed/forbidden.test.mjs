// B1 of the delivery feedback: the tables a fixture organisation may not hold, read from the safety
// file's guard probes, and the map's problems for a world or a state that would need one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureForbiddenTables, forbiddenSteerLines, forbiddenTableProblems } from '../../lib/seed/forbidden.mjs';

// The probe shapes a real safety file holds, with generic table names.
const SAFETY = {
  guards: [
    {
      id: 'fixture-organisations-have-no-line',
      covers: ['organizations:*', 'organization_members:*'],
      probes: [
        { sql: 'select count(*) from org_lines where organization_id = any($fixtureOrgs)', expect: 0 },
        { sql: 'select count(*) from org_numbers where organization_id = any($fixtureOrgs)', expect: 0 },
        { sql: "select count(*) from organization_members m join auth.users u on u.id = m.user_id where m.organization_id = any($fixtureOrgs) and u.email !~ '^delivery\\+[a-z0-9-]+@example\\.invalid$'", expect: 0 },
      ],
    },
    {
      id: 'saved-lists-hold-only-fixture-numbers',
      covers: ['saved_lists:*'],
      probes: [
        { sql: 'select count(*) from org_lines where organization_id = any($fixtureOrgs)', expect: 0 },
        { sql: "select count(*) from saved_lists s, jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) p where s.organization_id = any($fixtureOrgs) and coalesce(p->>'phoneNumber', '') !~ '^\\+?999[0-9]{9}$'", expect: 0 },
        { sql: "select count(*) from drafts d where d.organization_id = any($fixtureOrgs) and d.payload::text ~ '\\+?999'", expect: 0 },
      ],
    },
    {
      id: 'no-real-contacts',
      covers: ['contacts:*'],
      probes: [
        { sql: "select count(*) from contacts where organization_id = any($fixtureOrgs) and phone_number !~ '^\\+?999[0-9]{9}$'", expect: 0 },
        { sql: 'select count(*) from personas p join organization_members m on m.user_id = p.user_id join org_lines t on t.organization_id = m.organization_id where p.is_active = true and m.organization_id = any($fixtureOrgs)', expect: 0 },
      ],
    },
    {
      id: 'aliases-and-counts',
      covers: ['widgets:*'],
      probes: [
        { sql: 'SELECT count(*) FROM public.org_routes r WHERE r.organization_id = ANY($fixtureOrgs);', expect: 0 },
        { sql: 'select count(*) from org_trunks where organization_id = any($fixtureOrgs)', expect: 1 },
        { sql: 'select count(*) from org_other x where y.organization_id = any($fixtureOrgs)', expect: 0 },
      ],
    },
  ],
};

test('fixtureForbiddenTables: a plain count over one table filtered only by $fixtureOrgs, expecting 0', () => {
  assert.deepEqual(fixtureForbiddenTables(SAFETY), ['org_lines', 'org_numbers', 'org_routes']);
});

test('fixtureForbiddenTables: no safety file, no guards or no probes is an empty list', () => {
  assert.deepEqual(fixtureForbiddenTables(null), []);
  assert.deepEqual(fixtureForbiddenTables({}), []);
  assert.deepEqual(fixtureForbiddenTables({ guards: [{ id: 'x', covers: [] }] }), []);
});

const MAP = {
  worlds: [{ id: 'design' }, { id: 'empty' }],
  states: [
    { id: 'S-01', reach: { world: 'design', role: 'admin', steps: [{ goto: '/x' }] }, data: [{ table: 'org_lines', where: { active: true } }] },
    { id: 'S-02', reach: { world: 'design', role: 'admin', steps: [{ goto: '/x' }], intercept: { method: 'GET', url: '/api/lines', status: 200, body: { lines: [] } } }, data: [{ table: 'org_lines', where: { active: true } }] },
    { id: 'S-03', reach: { world: 'empty', role: 'admin', steps: [{ goto: '/x' }] } },
    { id: 'S-04', reach: { test: 'a.test.tsx :: S-04' } },
  ],
};

test('forbiddenTableProblems: a world row writing one, and a state showing one with no intercept, each with the intercept hint', () => {
  const worldFiles = {
    design: { rows: [{ key: 'org', table: 'organizations', values: {} }, { key: 'line', table: 'org_lines', values: {} }] },
    empty: { rows: [{ key: 'org', table: 'organizations', values: {} }] },
  };
  const contract = { states: { 'S-03': { texts: [{ text: '+999 700 000 001', label: 'data', table: 'org_numbers', column: 'phone_number' }, { text: 'Save', label: 'fixed' }] }, 'S-04': { texts: [{ text: 'x', label: 'data', table: 'org_numbers', column: 'n' }] } } };
  const p = forbiddenTableProblems(MAP, worldFiles, ['org_lines', 'org_numbers'], contract);
  assert.equal(p.length, 3, p.join('\n'));
  assert.match(p[0], /^world design row "line" writes org_lines, a table no fixture organisation may hold a row in .*: drop the row, and for S-01, S-02 answer it with an intercept/);
  assert.match(p[1], /^state S-01 shows data from org_lines, .* has no intercept: answer it with an intercept/);
  assert.match(p[2], /^state S-03 shows data from org_numbers/);
  assert.equal(p.some((x) => /S-02 shows|S-04/.test(x)), false, 'an intercepted state and a component-test state are fine');
  assert.deepEqual(forbiddenTableProblems(MAP, worldFiles, []), [], 'no forbidden tables, no problems');
});

test('forbiddenSteerLines: one line per table telling reviewers it is a data gap', () => {
  const lines = forbiddenSteerLines(['org_lines', 'org_numbers']);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Values from org_lines are test-data gaps.*mark them `data gap:`/);
});

// ---------------------------------------------------------------------------------------------
// delivery map, end to end
// ---------------------------------------------------------------------------------------------

test('delivery map: a world writing a forbidden table and a state showing one without an intercept are map problems', async () => {
  const { makeTempRepo } = await import('../helpers/tmp-repo.mjs');
  const { makeTestCtx } = await import('../helpers/ctx.mjs');
  const { makeProfile, makeSafety } = await import('../helpers/fixtures.mjs');
  const mapCommand = (await import('../../lib/commands/map.mjs')).default;
  const map = {
    schemaVersion: 1, feature: 'widgets', kind: 'new', route: '/w',
    worlds: [{ id: 'design', orgName: 'Acme', users: [{ role: 'admin', email: 'delivery+widgets-design-admin@example.invalid' }] }],
    states: [
      { id: 'W-01', screen: 'Lines', name: 'List', design: false, reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }] }, data: [{ table: 'org_lines', where: { active: true } }] },
      { id: 'W-02', screen: 'Lines', name: 'Answered', design: false, reach: { world: 'design', role: 'admin', steps: [{ goto: '/w' }], intercept: { method: 'GET', url: '/api/lines', status: 200, body: { lines: ['Main line'] } } }, data: [{ table: 'org_lines', where: { active: true } }] },
    ],
  };
  const world = { schemaVersion: 1, world: 'design', rows: [{ key: 'org', table: 'organizations', values: { name: { $orgName: true } } }, { key: 'line', table: 'org_lines', values: { organization_id: { $ref: 'org' } } }] };
  const repo = makeTempRepo({ files: { 'docs/delivery/widgets/map.json': map, 'docs/delivery/widgets/worlds/design.json': world } });
  try {
    // The default test safety file probes org_lines with a plain count expecting 0.
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety() });
    assert.equal(await mapCommand.run(ctx, []), 1, stdout.text());
    const out = stdout.text();
    assert.match(out, /world design row "line" writes org_lines/);
    assert.match(out, /state W-01 shows data from org_lines, .* answer it with an intercept/);
    assert.doesNotMatch(out, /state W-02 shows/);

    world.rows.pop();
    map.states[0].reach.intercept = map.states[1].reach.intercept;
    const fs = await import('node:fs');
    fs.writeFileSync(`${repo.dir}/docs/delivery/widgets/map.json`, JSON.stringify(map));
    fs.writeFileSync(`${repo.dir}/docs/delivery/widgets/worlds/design.json`, JSON.stringify(world));
    const again = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety() });
    assert.equal(await mapCommand.run(again.ctx, []), 0, again.stdout.text());
  } finally { repo.cleanup(); }
});

test('NEXT: the line that dispatches the mapper names the forbidden tables and asks for intercepts from the start', async () => {
  const { pictureNext } = await import('../../lib/picture/next.mjs');
  const facts = { designed: 4, hasMap: false, mapError: null, rounds: [] };
  const plain = pictureNext(facts, { cli: 'delivery' });
  assert.equal(plain.step, 'map');
  assert.doesNotMatch(plain.text, /intercept/);
  const next = pictureNext({ ...facts, forbiddenTables: ['org_lines', 'org_numbers'] }, { cli: 'delivery' });
  assert.match(next.text, /^dispatch the mapper agent with briefs\/mapper\.md .*Test data may not hold org_lines, org_numbers: a state that shows them \(phone numbers, lines, calling hours\) gets reach\.intercept from the start$/);
});
