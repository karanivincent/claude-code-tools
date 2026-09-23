// The B1 commands end to end through bin/delivery.mjs's main(): check, inventory check,
// plan check, plan render, plan verify and gate, on a temp directory with a profile on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../../bin/delivery.mjs';
import { sink } from '../helpers/ctx.mjs';
import { createStubRunner } from '../helpers/runner-stub.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { fakeClock } from '../helpers/clock.mjs';
import { makeRun, planWith, row } from '../checks/helpers.mjs';

async function cli(dir, argv) {
  const stdout = sink();
  const stderr = sink();
  const runner = createStubRunner([{ match: 'git rev-parse --show-toplevel', result: { code: 128, stdout: '', stderr: 'not a repository' } }, { match: 'git ls-files', result: { code: 0, stdout: 'apps/web/src/app/api/widgets/route.ts\n' } }, { match: /^git /, result: { code: 1, stdout: '', stderr: 'no' } }]);
  const code = await main(argv, { stdout, stderr, cwd: dir, runner, clock: fakeClock() });
  return { code, out: stdout.text(), err: stderr.text() };
}

async function workspace(o) {
  const run = await makeRun(o);
  mkdirSync(join(run.dir, '.claude'), { recursive: true });
  writeFileSync(join(run.dir, '.claude', 'delivery-profile.json'), JSON.stringify(o.profile ?? makeProfile(), null, 2));
  return run;
}

const good = (id, o = {}) => row(id, { markers: { text: [`Text ${id}`], testids: [`t-${id}`], forbidden: [] }, ...o });
const inv = (ids) => ({ schemaVersion: 1, feature: 'widgets', designTreeSha256: '2'.repeat(64), candidates: [], states: ids.map((id) => ({ id, screen: 'Widgets', name: id, reach: { kind: 'shot-only' }, shots: ['a.png'], render: { status: 'impossible', why: 'x' }, controls: [{ label: '', role: 'none', target: 'none', effect: 'none' }] })) });

test('every B1 command prints real usage with --help', async () => {
  const w = await workspace({});
  try {
    for (const words of [['check'], ['inventory', 'check'], ['plan', 'check'], ['plan', 'render'], ['plan', 'verify'], ['gate']]) {
      const r = await cli(w.dir, [...words, '--help']);
      assert.equal(r.code, 0, words.join(' '));
      assert.match(r.out, new RegExp(`^usage: delivery ${words.join(' ')}`));
      assert.doesNotMatch(r.out, /not implemented/);
    }
  } finally { w.cleanup(); }
});

test('plan check: exit 0 green, 1 with one FAIL line per problem, and --json', async () => {
  const w = await workspace({ plan: planWith([good('WL-01'), row('WL-02')]), inventory: inv(['WL-01', 'WL-02', 'WL-03']) });
  try {
    const r = await cli(w.dir, ['plan', 'check', '--feature', 'widgets']);
    assert.equal(r.code, 1);
    const lines = r.out.trim().split('\n');
    assert.ok(lines.every((l) => l.startsWith('FAIL M1-')), r.out);
    assert.ok(lines.some((l) => /M1-missing-row state WL-03/.test(l)));
    const j = await cli(w.dir, ['plan', 'check', '--feature', 'widgets', '--json']);
    const doc = JSON.parse(j.out);
    assert.equal(doc.exit, 1);
    assert.ok(doc.failures.length >= 2);
  } finally { w.cleanup(); }
  const ok = await workspace({ plan: planWith([good('WL-01')]), inventory: inv(['WL-01']) });
  try {
    const r = await cli(ok.dir, ['plan', 'check', '--feature', 'widgets']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /plan check: green/);
  } finally { ok.cleanup(); }
});

test('plan render writes spec.md; --check is 1 when stale and 0 when current', async () => {
  const w = await workspace({ plan: planWith([good('WL-01')]) });
  try {
    assert.equal((await cli(w.dir, ['plan', 'render', '--check', '--feature', 'widgets'])).code, 1);
    const r = await cli(w.dir, ['plan', 'render', '--feature', 'widgets']);
    assert.equal(r.code, 0);
    assert.ok(existsSync(w.paths.spec));
    assert.match(readFileSync(w.paths.spec, 'utf8'), /^# widgets: the build spec/);
    assert.equal((await cli(w.dir, ['plan', 'render', '--check', '--feature', 'widgets'])).code, 0);
    assert.match((await cli(w.dir, ['plan', 'render', '--feature', 'widgets'])).out, /unchanged/);
  } finally { w.cleanup(); }
});

test('plan verify: a false claim is a FAIL line and exit 1; claims for verify-spec are listed', async () => {
  const plan = planWith([good('WL-01', {
    data: [{ table: 'widgets', column: 'name', exists: true, verifiedBy: 'types' }, { table: 'gadgets', column: 'x', exists: true, verifiedBy: 'verify-spec' }],
    backend: [{ method: 'DELETE', route: '/api/widgets', exists: true, verifiedBy: 'route-file' }],
  })]);
  const w = await workspace({ plan, files: { 'packages/types/src/database.ts': 'Tables: { widgets: { Row: { name: string } } }', 'apps/web/src/app/api/widgets/route.ts': 'export async function POST() {}\n' } });
  try {
    const r = await cli(w.dir, ['plan', 'verify', '--feature', 'widgets']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^FAIL verify-route WL-01: DELETE \/api\/widgets is claimed to exist, but .* does not export DELETE$/m);
    assert.match(r.out, /1 claim\(s\) left for general-tools:verify-spec:\n {2}WL-01: gadgets\.x exists/);
  } finally { w.cleanup(); }
});

test('inventory check: red without candidates, the lines name what to do', async () => {
  const w = await workspace({ inventory: inv(['WL-01']) });
  try {
    const r = await cli(w.dir, ['inventory', 'check', '--feature', 'widgets']);
    assert.equal(r.code, 1);
    assert.match(r.out, /^FAIL candidates-missing .*run delivery design candidates$/m);
  } finally { w.cleanup(); }
});

test('check: one id or all; unknown ids are usage errors; findings make exit 1; the mode picks the checks', async () => {
  const w = await workspace({
    plan: planWith([good('WL-01')]),
    captures: [{ runId: 'c-1', mode: 'branch', items: [{ state: 'WL-01', lines: ['Text WL-01', 'Nothing on .'] }] }],
  });
  try {
    const bad = await cli(w.dir, ['check', 'M99', '--feature', 'widgets']);
    assert.equal(bad.code, 2);
    const r = await cli(w.dir, ['check', 'm7', '--feature', 'widgets', '--capture', 'c-1']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^FAIL M7 P1 WL-01 WL-01\.design\.admin\.1440\.en\.light\.txt:2: leak-preposition-punctuation/m);
    const all = await cli(w.dir, ['check', 'all', '--feature', 'widgets', '--json']);
    const doc = JSON.parse(all.out);
    assert.deepEqual(doc.data.checks, ['M3', 'M4', 'M7', 'M9', 'M10', 'M15']);
    assert.equal(doc.data.captureRunId, 'c-1');
    assert.equal(doc.exit, 1);
  } finally { w.cleanup(); }
});

test('gate: a unit the plan does not have is a usage error', async () => {
  const w = await workspace({ plan: planWith([good('WL-01')]) });
  try {
    const r = await cli(w.dir, ['gate', 'U9', '--feature', 'widgets']);
    assert.equal(r.code, 2);
    assert.match(r.out, /unit U9 is not in the plan/);
    assert.equal((await cli(w.dir, ['gate', '--feature', 'widgets'])).code, 2);
  } finally { w.cleanup(); }
});
