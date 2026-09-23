// M13's layers as pure logic: contact values, predicate evaluation over time, guards, structure,
// and the synthetic twins of the two cases spec 20.2 names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneShape, phonesIn, isFakeNumber, neverDialMatch, emailsIn, stringLeaves } from '../../lib/seed/contacts.mjs';
import { resolveRelative, evalFilter, matchPredicate } from '../../lib/seed/evaluate.mjs';
import { evaluateSeedSafety, covers } from '../../lib/seed/check.mjs';
import { deriveFromSources } from '../../lib/sidefx/derive.mjs';
import { makeSafety } from '../helpers/fixtures.mjs';
import { WORKER_TS, MIGRATION_1, MIGRATION_2 } from '../sidefx/fixtures.mjs';
import { unsafeRoundRows, deferredPracticeRow, NOW } from '../fixtures/seed/round.mjs';

const safety = makeSafety();
const now = new Date(NOW);
const predicates = deriveFromSources({
  tsFiles: [{ path: 'apps/server/src/jobs/sweep.ts', text: WORKER_TS, sha256: 'a'.repeat(64) }],
  sqlFiles: [{ path: 'db/migrations/20260101000000_first.sql', text: MIGRATION_1 }, { path: 'db/migrations/20260201000000_second.sql', text: MIGRATION_2 }],
  cronJobs: [], forbiddenStates: safety.forbiddenStates, derivedAt: NOW,
}).sidefx.predicates;

test('phone-shaped: E.164, 00, local 0... and bare runs; not dates, ids, decimals or masked numbers', () => {
  for (const v of ['+15550100001', '+1 (555) 010-0001', '00155501000001', '05550100001', '020 7946 0000', '15550100001', 'tel:+15550100001']) {
    assert.ok(phoneShape(v), `${v} is phone-shaped`);
  }
  for (const v of ['2026-01-15', '15/01/2026', '10.0.0.12', '3.14159', '48101', '+1555•••0001', '1555***0001', 'abc', '00000000-0000-5000-8000-000000000001']) {
    assert.equal(phoneShape(v), null, `${v} is not phone-shaped`);
  }
  assert.deepEqual(phonesIn('Ring 05550100001 after nine').map((p) => p.digits), ['05550100001'], 'a number inside text');
  assert.deepEqual(phonesIn('Ring +1555•••0001 after nine'), [], 'no fragment of a masked number is read as one');
  assert.deepEqual(phonesIn('id 00000000-0000-5000-8000-123456789012 at 2026-01-15T10:00:00Z'), [], 'uuids and timestamps are not numbers');
  assert.deepEqual(phonesIn('hash a1b2c3d4e5f6555010000123abc'), [], 'digits inside a word are not a number');
});

test('fake numbers and the never-dial set', () => {
  const re = safety.fakeNumbers.pattern;
  assert.ok(isFakeNumber(phoneShape('999700000001'), re));
  assert.ok(isFakeNumber(phoneShape('+999 700 000 001'), re), 'spacing does not matter');
  assert.ok(!isFakeNumber(phoneShape('05550100001'), re));
  const nd = ['15550100001'];
  assert.equal(neverDialMatch(phoneShape('+15550100001'), nd), '15550100001');
  assert.equal(neverDialMatch(phoneShape('0015550100001'), nd), '15550100001', 'an international prefix');
  assert.equal(neverDialMatch(phoneShape('05550100001'), nd), '15550100001', 'the local form, country code dropped');
  assert.equal(neverDialMatch(phoneShape('15550100002'), nd), null);
  assert.deepEqual(emailsIn('write to a@example.invalid or b@corp.example.com'), ['a@example.invalid', 'b@corp.example.com']);
  assert.deepEqual(stringLeaves({ a: 'x', b: { c: ['y', 15550100001] }, d: { $rel: 'now' } }).map((l) => l.path), ['a', 'b.c[0]', 'b.c[1]']);
});

test('relative times and filter evaluation: now, later and unknown', () => {
  assert.equal(resolveRelative({ $rel: 'now-2h' }, now), '2026-01-15T10:00:00.000Z');
  assert.equal(resolveRelative({ $rel: 'today@09:30+1d' }, now), '2026-01-16T09:30:00.000Z');
  assert.equal(resolveRelative({ $rel: 'today+2d', as: 'date' }, now), '2026-01-17');
  const due = { filters: [{ column: 'status', op: 'eq', value: 'queued' }, { column: 'release_at', op: 'lte', value: 'now()' }] };
  assert.equal(matchPredicate(due, { status: 'queued', release_at: '2026-01-15T11:00:00Z' }, now), 'now');
  assert.equal(matchPredicate(due, { status: 'queued', release_at: '2026-01-16T11:00:00Z' }, now), 'later', 'a future release becomes claimable');
  assert.equal(matchPredicate(due, { status: 'done', release_at: '2026-01-15T11:00:00Z' }, now), null);
  assert.equal(matchPredicate(due, { release_at: '2026-01-15T11:00:00Z' }, now), 'unknown', 'no status set: the database default decides');
  assert.equal(evalFilter({ column: 'x', op: 'gte', value: "now() - interval '1 day'" }, { x: '2026-01-15T00:00:00Z' }, now), 'yes');
  assert.equal(evalFilter({ column: 'x', op: 'not-null', value: null }, { x: null }, now), 'no');
  assert.equal(evalFilter({ column: 'x', op: 'in', value: ['a', 'b'] }, { x: 'b' }, now), 'yes');
  assert.equal(evalFilter({ column: 'n', op: 'eq', value: 3 }, { n: '3' }, now), 'yes');
});

test('the unsafe round is refused on its four counts, and masked numbers are not among the reasons', () => {
  const { rows, ids } = unsafeRoundRows();
  const r = evaluateSeedSafety({ rows, predicates, safety, neverDial: [], now });
  assert.equal(r.ok, false);
  const l1 = (table, filterCol, when) => r.reasons.filter((x) => x.layer === 1 && x.table === table && x.when === when && x.predicate.filters.some((f) => f.column === filterCol));
  const pastDue = l1('outbound_calls', 'release_at', 'now');
  assert.ok(pastDue.length >= 1, 'queued calls past their release time');
  assert.deepEqual(pastDue[0].rows.map((x) => x.id).sort(), [...ids.queuedPast].sort());
  assert.deepEqual(l1('outbound_calls', 'release_at', 'later')[0].rows.map((x) => x.id).sort(), [...ids.queuedLater].sort(), 'queued calls still ahead are refused too');
  const running = r.reasons.find((x) => x.layer === 1 && x.table === 'outbound_batches');
  assert.equal(running.rows.length, 1, 'the running round');
  assert.match(running.message, /jobs\/sweep\.ts:28 listOpen/);
  const numbers = r.reasons.find((x) => x.layer === 2 && x.code === 'not-fake' && x.table === 'outbound_calls' && x.column === 'phone_number');
  const flagged = new Set(numbers.rows.map((x) => x.id));
  for (const rid of [...ids.localRange, ...ids.e164Range]) assert.ok(flagged.has(rid), `${rid}'s number is refused`);
  assert.ok(!r.reasons.some((x) => x.layer === 2 && x.table === 'practice_runs'), 'the masked practice numbers are not phone-shaped');
});

test('a deferred practice run on a never-dial number is refused on three counts', () => {
  const row = deferredPracticeRow('15550100001');
  const r = evaluateSeedSafety({ rows: [row], predicates, safety, neverDial: [], now });
  const codes = r.reasons.map((x) => `${x.layer}:${x.code}:${x.predicate?.origin ?? ''}`);
  assert.ok(r.reasons.some((x) => x.layer === 1 && x.code === 'predicate' && x.predicate.id === 'ts:jobs.sweep.ts#resumeRuns'), `derived predicate in ${codes}`);
  assert.ok(r.reasons.some((x) => x.layer === 1 && x.code === 'forbidden-state'), 'forbidden state');
  const nd = r.reasons.find((x) => x.layer === 2 && x.code === 'never-dial');
  assert.ok(nd, 'never-dial');
  assert.doesNotMatch(nd.message, /15550100001/, 'the message masks the number');
});

test('guards: a holding guard makes its predicates acceptable; one that does not hold refuses', () => {
  const { rows } = unsafeRoundRows();
  const onlyCalls = rows.filter((r) => r.table === 'outbound_calls' && r.values.status === 'queued').map((r) => ({ ...r, values: { ...r.values, phone_number: '999700000001' } }));
  const held = evaluateSeedSafety({ rows: onlyCalls, predicates, safety, neverDial: [], now, guards: [{ id: 'no-line', covers: ['outbound_calls:*'], holds: true }] });
  assert.equal(held.ok, true, JSON.stringify(held.reasons.map((x) => x.message)));
  assert.ok(held.accepted.some((a) => a.guard === 'no-line' && a.rows === 8));
  const broken = evaluateSeedSafety({ rows: onlyCalls, predicates, safety, neverDial: [], now, guards: [{ id: 'no-line', covers: ['outbound_calls:*'], holds: false, why: 'probe returned 1' }] });
  assert.equal(broken.ok, false);
  assert.match(broken.reasons[0].message, /guard no-line does not hold \(probe returned 1\)/);
  assert.ok(covers('outbound_calls:sql:claim_outbound_calls', { table: 'outbound_calls', id: 'sql:claim_outbound_calls' }));
  assert.ok(!covers('widgets:*', { table: 'outbound_calls', id: 'x' }));
});

test('structure: production, project, own world, organisation name, users, global rows', () => {
  const orgId = '00000000-0000-5000-8000-00000000000a';
  const worlds = [{ id: 'design', orgId }];
  const base = [
    { world: 'design', table: 'organizations', id: orgId, values: { id: orgId, name: `${safety.fixtureOrgPrefix}Design` } },
    { world: 'design', table: 'widgets', id: 'w1', values: { id: 'w1', organization_id: orgId, state: 'idle' } },
  ];
  const users = [{ world: 'design', role: 'admin', email: 'delivery+widgets-design-admin@example.invalid', id: 'u1' }];
  const structure = { project: 'testprojectref', testRef: 'testprojectref', globalTables: [], robotEmails: ['robot-admin@example.invalid'] };
  const ok = evaluateSeedSafety({ rows: base, users, worlds, predicates: [], safety, neverDial: [], now, structure });
  assert.equal(ok.ok, true, JSON.stringify(ok.reasons));
  const bad = evaluateSeedSafety({
    rows: [
      { ...base[0], values: { id: orgId, name: 'Plain name' } },
      { world: 'design', table: 'widgets', id: 'w2', values: { id: 'w2', organization_id: 'someone-else' } },
      { world: 'design', table: 'settings', id: 's1', values: { id: 's1', key: 'x' } },
      { world: 'design', table: 'notes', id: 'n1', values: { id: 'n1', organization_id: orgId, author: 'robot-admin@example.invalid', cc: 'owner@corp.example.com' } },
    ],
    users: [...users, { world: 'design', role: 'member', email: 'someone@elsewhere.example.com', id: 'u2' }],
    worlds, predicates: [], safety, neverDial: [], now,
    structure: { ...structure, project: 'prodprojectref' },
  });
  const codes = new Set(bad.reasons.map((x) => `${x.layer}:${x.code}`));
  for (const c of ['4:production', '4:project', '4:org-name', '4:outside-world', '4:global-unlisted', '4:robot', '2:fixture-user', '2:email']) assert.ok(codes.has(c), `${c} in ${[...codes]}`);
});
