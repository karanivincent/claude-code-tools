import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { captureRun, captureExcerpt } from '../../lib/capture/run.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { gateResult } from '../../lib/core/gate.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, makeSafety, validExample } from '../helpers/fixtures.mjs';
import { widgetsPlan, captureRule, hooks, GOOD, writePlan } from './helpers.mjs';
import command from '../../lib/commands/capture.mjs';

async function setup(opts = {}) {
  const repo = makeTempRepo({ files: { 'README.md': 'widgets app\n' } });
  writePlan(repo, opts.plan ?? widgetsPlan());
  const seen = [];
  const { ctx, stdout, stderr, runner } = await makeTestCtx({
    repoRoot: repo.dir, feature: 'widgets', profile: opts.profile ?? makeProfile(), safety: opts.safety ?? makeSafety(),
    passthrough: ['git'], rules: [captureRule(opts.show, { seen, code: opts.code, stderr: opts.stderr })],
  });
  return { repo, ctx, stdout, stderr, runner, seen };
}

test('wave: the preview by SHA, worlds refreshed and scanned first, every item judged, capture.json valid', async () => {
  const s = await setup();
  try {
    const h = hooks();
    const r = await captureRun(s.ctx, { mode: 'wave' }, h.hooks);
    const head = s.repo.git('rev-parse', 'HEAD');
    assert.deepEqual(h.calls.preview, [head]);
    assert.deepEqual(h.calls.refresh, ['design', 'empty']);
    assert.equal(h.calls.scan, 1);
    const call = s.runner.calls.find((c) => c.shell);
    assert.equal(call.args[1], "node scripts/heavy.mjs -- 'npx playwright test apps/web/e2e/delivery-capture.spec.ts'");
    assert.equal(call.env.E2E_BASE_URL, 'https://preview.example.invalid');
    assert.equal(call.env.DELIVERY_CAPTURE_JOB, r.jobPath);
    const job = s.seen[0];
    assert.equal(job.expectedSha, head);
    assert.equal(job.auth.module, join(s.repo.dir, 'apps/web/e2e/support/session.ts'));
    assert.deepEqual(job.versionProbe, { method: 'GET', path: '/api/version' });
    assert.ok(existsSync(job.extractScript));
    assert.match(readFileSync(job.extractScript, 'utf8'), /window\.__deliveryExtract = function pageExtract/);
    assert.equal(r.notReached, 0, JSON.stringify(r.capture.items.filter((i) => i.status !== 'reached')));
    assert.equal(r.capture.items.length, 9);
    assert.deepEqual(validateAgainst('capture', r.capture).errors, []);
    const onDisk = JSON.parse(readFileSync(join(s.repo.dir, '.delivery/widgets/captures', r.runId, 'capture.json'), 'utf8'));
    assert.deepEqual(onDisk, r.capture);
    assert.deepEqual(r.skipped.map((x) => x.state), ['WG-05', 'WG-06', 'WG-07']);
    assert.match(r.runId, /^c-\d{8}-\d{6}-wave$/);
  } finally { s.repo.cleanup(); }
});

test('a state showing its neighbour is not reached; rows its clicks created are torn down and the worlds scanned again', async () => {
  const s = await setup({
    show: (it) => {
      if (it.state === 'WG-02') return { ...GOOD['WG-01'] };
      if (it.clicks) return { ...GOOD['WG-01'], createdRows: [{ method: 'POST', url: 'https://app.example.invalid/api/widgets', id: 'w-9' }] };
      return null;
    },
  });
  try {
    const h = hooks();
    const r = await captureRun(s.ctx, { mode: 'wave' }, h.hooks);
    const wg2 = r.capture.items.filter((i) => i.state === 'WG-02');
    assert.ok(wg2.every((i) => i.status === 'not-reached'));
    assert.match(wg2[0].why, /missing markers "No widgets yet", testid widget-empty; forbidden marker present testid widget-list/);
    // Four, not two: WG-02 is in another world and now shows WG-01's text, so both are suspect.
    // The capture cannot tell which of the pair moved, and reporting only one of them would pick.
    assert.equal(r.notReached, 4);
    assert.match(wg2[0].why, /identical text to WG-01 \(design\) in another world/);
    assert.deepEqual(h.calls.teardown, [[{ table: 'widgets', id: 'w-9' }]]);
    assert.equal(h.calls.scan, 2);
    assert.deepEqual(r.capture.items.find((i) => i.state === 'WG-01' && i.width === 1440 && i.role === 'admin').createdRowIds, ['w-9']);
  } finally { s.repo.cleanup(); }
});

test('the command prints one line per state not reached and exits 1', async () => {
  const s = await setup({ show: (it) => (it.state === 'WG-03' ? { lines: ['Widgets'], testids: ['widget-list'] } : null) });
  try {
    s.ctx.captureHooks = hooks().hooks;
    const exit = await command.run(s.ctx, ['--mode', 'wave', '--base-url', 'https://preview.example.invalid']);
    assert.equal(exit, 1);
    const fails = s.stdout.lines().filter((l) => l.startsWith('FAIL not-reached'));
    assert.equal(fails.length, 2);
    assert.match(fails[0], /^FAIL not-reached WG-03 design\/admin 1440 en light: missing marker "Copy made"/);
    assert.match(s.stdout.text(), /capture c-\S+-wave: 7 of 9 reached \(wave, https:\/\/preview\.example\.invalid, expected [0-9a-f]{12}\)/);
    const dry = await command.run(s.ctx, ['--mode', 'wave', '--base-url', 'https://preview.example.invalid', '--dry-run']);
    assert.equal(dry, 0);
    assert.match(s.stdout.text(), /would run: DELIVERY_CAPTURE_JOB=\S+job\.json E2E_BASE_URL=https:\/\/preview\.example\.invalid node scripts\/heavy\.mjs/);
  } finally { s.repo.cleanup(); }
});

test('a preview that is not built yet is a wait (exit 4), and a red seed scan captures nothing', async () => {
  const s = await setup();
  try {
    const pending = hooks({ resolvePreview: async () => ({ url: null, pending: true, detail: 'building' }) });
    await assert.rejects(captureRun(s.ctx, { mode: 'full' }, pending.hooks), (e) => e.exit === 4 && /not ready: building/.test(e.message));
    const red = hooks({ seedScanGate: async () => gateResult([{ code: 'M13', message: 'a queued row matches a worker' }]) });
    await assert.rejects(captureRun(s.ctx, { mode: 'wave' }, red.hooks), (e) => e.exit === 1 && /seed scan is red/.test(e.message) && e.failures[0].code === 'M13');
    assert.ok(!s.runner.calls.some((c) => c.shell), 'the capture spec never ran');
    const moved = hooks({ probeServedSha: async () => '0'.repeat(40) });
    await assert.rejects(captureRun(s.ctx, { mode: 'wave' }, moved.hooks), (e) => e.exit === 4 && /serves 000000000000/.test(e.message));
  } finally { s.repo.cleanup(); }
});

test('dry run writes the job and names the command, running nothing', async () => {
  const s = await setup();
  try {
    const h = hooks();
    const r = await captureRun(s.ctx, { mode: 'staging', dryRun: true, baseUrl: 'https://staging.example.invalid', sha: s.repo.git('rev-parse', 'HEAD') }, h.hooks);
    const job = JSON.parse(readFileSync(r.jobPath, 'utf8'));
    assert.equal(job.baseUrl, 'https://staging.example.invalid');
    assert.equal(job.webServer, null);
    assert.equal(job.items.filter((i) => i.world === 'real-org').length, 2, 'the observer from the safety file');
    assert.ok(!s.runner.calls.some((c) => c.shell));
    assert.equal(h.calls.refresh.length, 0);
    assert.equal(r.capture, null);
  } finally { s.repo.cleanup(); }
});

test('branch mode refuses a capture whose worktree has moved past the SHA it is for', async () => {
  const s = await setup();
  try {
    const wt = s.repo.addWorktree('u3', 'unit/U3');
    const plan = widgetsPlan();
    const unitFile = validExample('unit-file');
    unitFile.unit = plan.units[1];
    unitFile.rows = plan.rows.filter((r) => plan.units[1].states.includes(r.id));
    unitFile.branch = 'unit/U3';
    mkdirSync(join(s.repo.dir, '.delivery/widgets/units'), { recursive: true });
    writeFileSync(join(s.repo.dir, '.delivery/widgets/units/U3.json'), JSON.stringify(unitFile));
    const stale = 'a'.repeat(40);
    await assert.rejects(
      () => captureRun(s.ctx, { mode: 'branch', unit: 'U3', sha: stale }, hooks().hooks),
      (e) => /is at [0-9a-f]{12} and this capture is for aaaaaaaaaaaa/.test(e.message) && /re-run the gate/.test(e.message),
    );
    assert.equal(s.seen.length, 0, 'nothing is captured against a tree that is not at that SHA');
  } finally { s.repo.cleanup(); }
});

test('branch mode serves the unit\'s own worktree with a dev server the capture owns', async () => {
  const s = await setup();
  try {
    const wt = s.repo.addWorktree('u2', 'unit/U2');
    const plan = widgetsPlan();
    const unitFile = validExample('unit-file');
    unitFile.unit = plan.units[1];
    unitFile.rows = plan.rows.filter((r) => plan.units[1].states.includes(r.id));
    unitFile.branch = 'unit/U2';
    mkdirSync(join(s.repo.dir, '.delivery/widgets/units'), { recursive: true });
    writeFileSync(join(s.repo.dir, '.delivery/widgets/units/U2.json'), JSON.stringify(unitFile));
    const h = hooks();
    const r = await captureRun(s.ctx, { mode: 'branch', unit: 'U2' }, h.hooks);
    const job = s.seen[0];
    const wtHead = s.repo.git('-C', wt, 'rev-parse', 'HEAD');
    assert.equal(job.expectedSha, wtHead);
    assert.match(job.webServer.command, new RegExp(`^npm --prefix ${wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} run dev -- --port \\d+$`));
    assert.equal(job.webServer.env.BUILD_SHA, wtHead);
    assert.equal(job.webServer.url, job.baseUrl);
    // The tree the server runs in is the tree that is graded. A profile whose dev-server command
    // carries no {dir} -- most of them -- has nothing but cwd to say which tree that is, and
    // serving the integration worktree instead graded code the unit had never written.
    assert.equal(job.webServer.cwd, wt);
    // localhost, never 127.0.0.1: a dev server rebuilds its redirects around `localhost`, so a
    // capture arriving as 127.0.0.1 crosses an origin on the first hop and loses its session
    // cookie. The widgets rehearsal's wave-0 smoke failed three times on exactly that.
    assert.match(job.baseUrl, /^http:\/\/localhost:\d+$/);
    assert.deepEqual(job.items.map((i) => i.state), ['WG-01', 'WG-02', 'WG-03']);
    assert.match(r.runId, /-branch-U2$/);
    assert.equal(r.notReached, 0);
  } finally { s.repo.cleanup(); }
});

test('a capture command that fails and writes nothing is one clear failure, and every item not reached', async () => {
  const s = await setup({ show: () => ({ skip: true }), code: 1, stderr: 'Error: Cannot find module ./delivery-capture-support' });
  try {
    const r = await captureRun(s.ctx, { mode: 'wave' }, hooks().hooks);
    assert.equal(r.notReached, r.capture.items.length);
    assert.deepEqual(r.failures.map((f) => f.code), ['capture-run']);
    assert.match(r.failures[0].message, /exited 1 and wrote nothing: Error: Cannot find module/);
    assert.equal(r.capture.items[0].why, 'the capture wrote nothing for this item');
  } finally { s.repo.cleanup(); }
});

test('the founder\'s organisation: real-org mode needs the observer; other modes go on without it and say so', async () => {
  const s = await setup({ safety: makeSafety({ realOrg: null }) });
  try {
    await assert.rejects(captureRun(s.ctx, { mode: 'real-org', baseUrl: 'https://staging.example.invalid' }, hooks().hooks), (e) => e.exit === 3);
    await assert.rejects(captureRun(s.ctx, { mode: 'staging', baseUrl: 'https://staging.example.invalid', dryRun: true }, hooks().hooks), (e) => e.exit === 2 && /cannot resolve origin\/main; pass --sha/.test(e.message));
    const r = await captureRun(s.ctx, { mode: 'staging', baseUrl: 'https://staging.example.invalid', dryRun: true, sha: s.repo.git('rev-parse', 'HEAD') }, hooks().hooks);
    assert.deepEqual(r.failures.map((f) => f.code), ['real-org']);
  } finally { s.repo.cleanup(); }
});

test('usage: a mode is required, --unit is branch-only, and a baseline needs a baseline or a plan', async () => {
  const s = await setup();
  try {
    await assert.rejects(command.run(s.ctx, []), (e) => e.exit === 2 && /--mode is required/.test(e.message));
    await assert.rejects(command.run(s.ctx, ['--mode', 'sideways']), (e) => e.exit === 2);
    await assert.rejects(command.run(s.ctx, ['--mode', 'wave', '--unit', 'U2']), (e) => e.exit === 2 && /branch-mode/.test(e.message));
    await assert.rejects(command.run(s.ctx, ['--mode', 'wave', '--sha', 'nope']), (e) => e.exit === 2);
    await assert.rejects(captureRun(s.ctx, { mode: 'wave', smoke: true }, hooks().hooks), (e) => e.exit === 2 && /branch-mode/.test(e.message));
  } finally { s.repo.cleanup(); }
  const empty = makeTempRepo({ files: { 'README.md': 'x\n' } });
  try {
    const { ctx } = await makeTestCtx({ repoRoot: empty.dir, feature: 'widgets', profile: makeProfile(), safety: makeSafety(), passthrough: ['git'] });
    await assert.rejects(captureRun(ctx, { mode: 'baseline' }, hooks().hooks), (e) => e.exit === 2 && /needs baseline\.json/.test(e.message));
  } finally { empty.cleanup(); }
});

// The last line of a failed Playwright run is the package manager's epitaph, not the fault. The
// widgets rehearsal's wave-0 smoke reported "exited 1 and wrote nothing: Exit status 1" over a
// plain connection refusal twenty-five lines above it.
test('captureExcerpt leads with the line that names the error, not the last line', () => {
  const playwright = [
    '> @example/dashboard@0.0.1 e2e',
    '> playwright test "apps/web/e2e/delivery-capture.spec.ts"',
    '',
    'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:53920/auth/confirm',
    'Call log:',
    '  - navigating to "http://127.0.0.1:53920/auth/confirm", waiting until "load"',
    '    at globalSetup (apps/web/e2e/support/global-setup.ts:27:5)',
    ' ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @example/dashboard@0.0.1 e2e',
    'Exit status 1',
  ].join('\n');
  const said = captureExcerpt({ stdout: playwright, stderr: '' });
  assert.match(said, /ERR_CONNECTION_REFUSED/);
  assert.ok(said.startsWith('Error: page.goto'), said);
  assert.match(said, /Exit status 1$/);

  assert.equal(captureExcerpt({ stdout: '', stderr: '   \n\n' }), '');
  // Nothing names an error: the last two lines are still better than one.
  assert.equal(captureExcerpt({ stdout: 'one\ntwo\nthree\n', stderr: '' }), 'two / three');
});
