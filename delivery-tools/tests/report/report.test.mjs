import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, journalFacts } from '../../lib/report/report.mjs';
import { makeFinding } from '../../lib/core/findings.mjs';
import { createState, updateState, formatEvent } from '../../lib/core/state.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { artefactHash } from '../../lib/core/artefacts.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeTempRepo } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeProfile, validExample } from '../helpers/fixtures.mjs';
import command from '../../lib/commands/report.mjs';

const WARNING = String.fromCodePoint(0x26a0, 0xfe0f); // built from code points: the variation selector is invisible
const cli = { version: '0.3.0', manifestSha256: 'c'.repeat(64) };
const HEAD = 'f'.repeat(40);
const greenReady = (over = {}) => ({
  ...validExample('ready'),
  headSha: HEAD,
  checks: [{ id: 'ci', ok: true, detail: 'all green', evidence: 'waiter exit 0' }, { id: 'M3', ok: true, detail: 'every state reached', evidence: 'captures/c-1/capture.json' }],
  counts: { statesBuilt: 58, cut: 4, adapted: 3, invented: 2, removed: 1, acceptedP2: 1, p3Filed: 6, notReached: 0, propOrUnseedable: 7, reAudits: 0 },
  lateChanges: [], waivers: [], owedAfterMerge: [], ok: true,
  ...over,
});
const acceptedP2 = makeFinding({ source: 'check:M5', severity: 'P2', state: 'WL-04', where: 'WL-04.design.admin.1440.en.light.dom.json', live: 'mono stat line in sans', status: 'accepted', accept: { reasonClass: 'platform-limit', issue: 210, text: 'the mono face is not shipped' }, group: 'list' });
const state = (pr = 12, journal = []) => ({ pr, epic: 101, journal });

test('ready and current: the verdict first, accepted differences before the merge, the merge last', () => {
  const r = buildReport({ ready: greenReady(), findings: { findings: [acceptedP2] }, plan: null, state: state(), cli, punchList: '.delivery/widgets/punch-list.html', prUrl: 'https://github.com/example-org/example-repo/pull/12' });
  const lines = r.text.split('\n');
  assert.equal(lines[0], '## 📋 TL;DR');
  assert.equal(lines[1], `Ready: [#12](https://github.com/example-org/example-repo/pull/12) at \`${HEAD.slice(0, 12)}\` passed all 2 ready checks.`);
  assert.equal(lines[2], '2 things need you.');
  assert.ok(r.ready);
  assert.ok(r.text.includes('## 🟠 Needs you'), 'the header takes the highest tier present');
  const items = lines.filter((l) => /^- (🔴|🟠|🔵) /.test(l));
  assert.match(items[0], /^- 🟠 Read the 1 accepted difference before you merge$/);
  assert.match(items[1], /^- 🔵 Merge \[#12\]\(.*\) once the preview and the punch list look right$/);
  assert.match(r.text, /  WL-04: the mono face is not shipped \(platform-limit, #210\)/);
  assert.ok(!r.text.includes(`## ${WARNING} Went wrong`), 'nothing went wrong: no section');
  assert.match(r.text, /- \[#12\]\(.*\) · `ffffffffffff` · 58 states built · 4 cut · 3 adapted · 2 invented · 1 removed · 7 by component test · 6 P3s filed · delivery 0\.3\.0 `cccccccccccc`/);
  assert.match(r.text, /Full account: `\.delivery\/widgets\/punch-list\.html`$/);
  assert.ok(!/\*/.test(r.text), 'no asterisk emphasis anywhere');
  assert.ok(r.text.split('\n').length <= 30);
});

test('the done line says which screens were built, which were left as they are, and which shared states changed', () => {
  const intent = {
    inScope: [{ screen: 'Calls', routes: ['/dashboard/calls'] }],
    outOfScope: [{ screen: 'Scripts', why: 'in the export for context only' }, { screen: 'Home', why: 'in the export for context only' }],
  };
  const inventory = { states: [{ id: 'SH-01', screen: 'Shared' }, { id: 'SH-02', screen: 'Shared' }, { id: 'CL-01', screen: 'Calls' }] };
  const plan = { rows: [{ id: 'SH-01', class: 'change' }, { id: 'SH-02', class: 'keep' }, { id: 'CL-01', class: 'new' }], units: [] };
  const r = buildReport({ ready: greenReady(), findings: { findings: [] }, plan, state: state(), cli, intent, inventory });
  assert.match(r.done, / · built for Calls; left as they are: Scripts, Home · 1 shared state changed on every page: SH-01 · /);
  const bare = buildReport({ ready: greenReady(), findings: { findings: [] }, plan, state: state(), cli });
  assert.ok(!/built for|shared state/.test(bare.done), 'no intent, no inventory: nothing said about scope');
});

test('not ready: which checks are red, and never the word done or ready for it', () => {
  const ready = validExample('ready');
  const open = makeFinding({ source: 'check:M7', severity: 'P1', state: 'WL-02', where: 'WL-02.design.admin.1440.en.light.txt:3', live: 'No widgets on .', group: 'list' });
  const r = buildReport({ ready, findings: { findings: [open] }, plan: null, state: state(), cli });
  assert.match(r.verdict, /^Not ready: 1 of 2 ready checks red on `ffffffffffff` \(M3\)\.$/);
  assert.ok(!r.ready);
  assert.ok(r.text.includes(`## ${WARNING} Went wrong\n- M3: 1 state not reached (captures/c-1/capture.json)\n- 1 P1 finding open, first WL-02 at WL-02.design.admin.1440.en.light.txt:3: No widgets on .`));
  assert.match(r.text, /- 1 state not reached by the last capture/);
  assert.match(r.text, /- 1 re-audit of a screen group/);
  assert.ok(!/Merge /.test(r.text), 'no merge is offered while red');
  assert.match(r.text, /- 🟠 Keep or lift the waiver before you merge: P13: no observer yet/);
});

test('no ready record, a stale one, a broken journal', () => {
  const none = buildReport({ ready: null, findings: null, plan: null, state: state(null), cli, head: HEAD });
  assert.equal(none.verdict, 'Not ready: no ready record for `ffffffffffff`; `delivery ready` has not passed.');
  assert.match(none.text, /## ✅ Needs you\nNothing\./);
  const stale = buildReport({ ready: greenReady(), stale: ['the head moved to 0123456789ab', 'plan.json changed since the ready check'], findings: null, plan: null, state: state(), cli });
  assert.match(stale.verdict, /^Not ready: the ready record for `ffffffffffff` is stale \(the head moved to 0123456789ab; plan\.json changed since the ready check\)\.$/);
  assert.ok(!stale.ready);
  const broken = buildReport({ ready: greenReady(), journalBroken: 'entry 3 was edited (hash mismatch)', findings: null, plan: null, state: state(), cli });
  assert.match(broken.verdict, /journal is broken/);
  assert.match(broken.text, /## 🔴 Needs you\n- 🔴 Look at the broken journal before trusting any gate/);
});

test('late changes lead, at most five items with the rest pointed at, re-audits and the spot check from the journal', () => {
  const ready = greenReady({ lateChanges: ['S3 · WL-07 built → cut at 03:10 (over-size)', 'S4 · WL-09 built → cut', 'S5 · CAP-004 migrate → remove'], waivers: ['P13: no observer', 'P5: shared robot'] });
  const journal = [
    { event: formatEvent({ command: 're-audit auditor:list', exit: 0, counts: { reAudits: 1 } }) },
    { event: formatEvent({ command: 'audit spot auditor:list', exit: 0, counts: { judged: 12, disagreed: 1 } }) },
    { event: formatEvent({ command: 'audit spot auditor:list', exit: 0, counts: { judged: 10, disagreed: 2 } }) },
  ];
  const r = buildReport({ ready, findings: { findings: [acceptedP2] }, plan: null, state: state(12, journal), cli });
  const items = r.text.split('\n').filter((l) => /^- (🔴|🟠|🔵) /.test(l));
  assert.equal(items.length, 5);
  assert.match(items[0], /^- 🟠 Check this late change before you merge: S3/);
  assert.match(items[4], /^- 🟠 3 more items: see the punch list$/);
  assert.equal(r.needsYou.length, 5);
  assert.match(r.text, /- 1 re-audit of a screen group \(each is journalled\)/);
  assert.match(r.text, /auditor spot check 2\/10 disagreed/);
  const f = journalFacts(journal);
  assert.equal(f.reAudits, 1);
  assert.deepEqual(f.spot, { judged: 10, disagreed: 2 });
});

async function repoWithRun() {
  const repo = makeTempRepo({ files: { 'README.md': 'x\n' } });
  const paths = featurePaths(repo.dir, 'widgets');
  mkdirSync(paths.deliveryDir, { recursive: true });
  writeFileSync(paths.plan, JSON.stringify(validExample('plan')));
  writeFileSync(paths.inventory, JSON.stringify(validExample('inventory')));
  mkdirSync(paths.runDir, { recursive: true });
  writeFileSync(paths.findings, JSON.stringify({ schemaVersion: 1, runId: 'r-20260115-2000-abcd', findings: [acceptedP2] }));
  await createState(paths, { feature: 'widgets', runId: 'r-20260115-2000-abcd', worktree: repo.dir, branch: 'epic/101-widgets', epic: 101, at: '2026-01-15T20:00:00.000Z' });
  await updateState(paths, (s) => ({ ...s, pr: 12 }), { at: '2026-01-15T20:05:00.000Z', event: 'claims open | exit=0' });
  const head = repo.git('rev-parse', 'HEAD');
  const ready = greenReady({
    headSha: head,
    inputs: {
      plan: await artefactHash(paths, 'plan'), inventory: await artefactHash(paths, 'inventory'), baseline: 'absent',
      capture: 'absent', findings: await artefactHash(paths, 'findings'), safety: 'absent',
    },
  });
  assert.deepEqual(validateAgainst('ready', ready).errors, []);
  writeFileSync(paths.ready, JSON.stringify(ready));
  return { repo, paths, head };
}

test('the command reads the four sources, sees the ready record is current, and prints the report', async () => {
  const { repo, paths } = await repoWithRun();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    assert.equal(await command.run(ctx, []), 0);
    const text = stdout.text();
    assert.match(text, /^## 📋 TL;DR\nReady: \[#12\]\(https:\/\/github\.com\/example-org\/example-repo\/pull\/12\) at `[0-9a-f]{12}` passed all 2 ready checks\./);
    // the plan changes after the ready check: the same record is now stale
    const plan = validExample('plan');
    plan.epic = 999;
    writeFileSync(paths.plan, JSON.stringify(plan));
    const again = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    await command.run(again.ctx, []);
    assert.match(again.stdout.text(), /Not ready: the ready record for `[0-9a-f]{12}` is stale \(plan\.json changed since the ready check\)/);
    // a new commit: stale by head
    repo.write({ 'b.txt': 'b' });
    repo.commit('more');
    const third = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'], json: true });
    await command.run(third.ctx, []);
    third.ctx.out.finish(0);
    const out = JSON.parse(third.stdout.text());
    assert.equal(out.data.ready, false);
    assert.match(out.data.verdict, /the head moved to/);
  } finally { repo.cleanup(); }
});

test('the command reports a tampered ready.json or journal instead of crashing', async () => {
  const { repo, paths } = await repoWithRun();
  try {
    writeFileSync(paths.ready, JSON.stringify({ schemaVersion: 1, ok: true }));
    const a = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    assert.equal(await command.run(a.ctx, []), 0);
    assert.match(a.stdout.text(), /Not ready: ready\.json is unreadable or does not match its schema/);
    const st = JSON.parse((await import('node:fs')).readFileSync(paths.state, 'utf8'));
    st.journal[1].event = 'claims open | exit=0 | edited=1';
    writeFileSync(paths.state, JSON.stringify(st));
    const b = await makeTestCtx({ repoRoot: repo.dir, feature: 'widgets', profile: makeProfile(), passthrough: ['git'] });
    await command.run(b.ctx, []);
    assert.match(b.stdout.text(), /🔴 Look at the broken journal/);
    assert.match(b.stdout.text(), /\[#12\]/, 'the PR number is still read from the raw state');
  } finally { repo.cleanup(); }
});
