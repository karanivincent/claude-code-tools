// runChecks over synthetic runs on disk: findings recorded with the policy, statuses kept across
// re-runs, and each capture-based check (M3, M4, M7, M9, M10, M12, M15, M16, M17, M5, M6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks, runChecksWith, CHECK_IDS, MODE_CHECKS } from '../../lib/checks/index.mjs';
import { reachFindings, expectedRows } from '../../lib/checks/m3.mjs';
import { loadCheckEnv } from '../../lib/checks/env.mjs';
import { readFindings, writeFindings } from '../../lib/core/findings.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { makeRun, planWith, row, world, domFor, emptyLog, SHA } from './helpers.mjs';

const profile = () => {
  const p = makeProfile();
  return { ...p, audit: { ...p.audit, bannedWords: { en: ['approved', 'loopback'] }, developerPhrases: ['not built', 'this PR'], dateShape: 'D Mon' } };
};

test('the registry has every check id of spec 8.1, and every mode lists only known checks', () => {
  assert.deepEqual([...CHECK_IDS], Array.from({ length: 17 }, (_, i) => `M${i + 1}`));
  for (const [mode, ids] of Object.entries(MODE_CHECKS)) for (const id of ids) assert.ok(CHECK_IDS.includes(id), `${mode}: ${id}`);
  assert.deepEqual(MODE_CHECKS.branch.filter((x) => x !== 'M15'), ['M3', 'M4', 'M7', 'M9', 'M10']);
});

test('M7 through runChecks: one finding per state, rule and text; severities by rule; day-one raised; statuses survive; fixed when gone', async () => {
  const plan = planWith([row('WL-01', { dayOne: true }), row('WL-02')]);
  const leaky = ['Widgets', 'No orders yet on .', 'Off since 8/31/2026', 'Approved', 'Opened in this PR'];
  const run = await makeRun({
    plan, profile: profile(),
    captures: [{ runId: 'c-1', items: [
      { state: 'WL-01', lines: leaky }, { state: 'WL-01', width: 390, lines: leaky },
      { state: 'WL-02', lines: ['Widget', 'Off since 8/31/2026'] },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M7'], { captureRunId: 'c-1' });
    const got = res.findings.map((f) => `${f.state} ${f.rule} ${f.severity}`).sort();
    assert.deepEqual(got, [
      'WL-01 banned-word P1', 'WL-01 developer-phrase P1', 'WL-01 leak-preposition-punctuation P1', 'WL-01 numeric-date P1',
      'WL-02 numeric-date P2',
    ]);
    const doc = await readFindings(run.paths, 'x');
    assert.equal(doc.findings.length, 5);
    assert.ok(doc.findings.every((f) => f.source === 'check:M7'));
    const date1 = doc.findings.find((f) => f.state === 'WL-01' && f.rule === 'numeric-date');
    assert.equal(date1.dayOne, true);
    assert.match(date1.where, /^WL-01\.design\.admin\.1440\.en\.light\.txt:3$/);

    // A decided status survives a re-run; a finding that is gone becomes fixed in this capture.
    const accepted = { ...doc, findings: doc.findings.map((f) => (f.state === 'WL-02' ? { ...f, status: 'accepted', accept: { reasonClass: 'platform-limit', issue: 9, text: 'kept' } } : f)) };
    await writeFindings(run.paths, accepted);
    const again = await runChecks(run.ctx, ['M7'], { captureRunId: 'c-1' });
    assert.equal(again.findings.length, 5);
    const doc2 = await readFindings(run.paths, 'x');
    assert.equal(doc2.findings.find((f) => f.state === 'WL-02').status, 'accepted');
  } finally { run.cleanup(); }

  // Fixed only in scope: a later English-only capture fixes the English leak it no longer sees,
  // and leaves the French one it never looked at open.
  const both = await makeRun({
    plan, profile: profile(),
    captures: [
      { runId: 'c-1', mode: 'full', items: [{ state: 'WL-01', lines: ['No orders yet on .'] }, { state: 'WL-01', locale: 'fr', lines: ['Aucune commande sur .'] }] },
      { runId: 'c-2', mode: 'branch', items: [{ state: 'WL-01', lines: ['No orders yet.'] }] },
    ],
  });
  try {
    await runChecks(both.ctx, ['M7'], { captureRunId: 'c-1' });
    await runChecks(both.ctx, ['M7'], { captureRunId: 'c-2' });
    const doc = await readFindings(both.paths, 'x');
    const status = Object.fromEntries(doc.findings.map((f) => [f.where.split('.')[4], f]));
    assert.equal(status.en.status, 'fixed');
    assert.equal(status.en.fixedIn, 'c-2');
    assert.equal(status.fr.status, 'open', 'the French capture is out of c-2\'s scope');
  } finally { both.cleanup(); }
});

test('M3 with the capture validator: missing and forbidden markers, identical siblings, same-as, served SHA, never captured', async () => {
  const plan = planWith([
    row('WL-01', { markers: { text: ['Widgets'], testids: [], forbidden: [] } }),
    row('WL-05', { markers: { text: ["Today's round", 'Pause'], testids: [], forbidden: ['Coming up'] } }),
    row('WL-06', { markers: { text: [], testids: [], forbidden: [] } }),
    row('WL-07', { markers: { text: [], testids: [], forbidden: [] } }),
    row('WL-08', { markers: { text: [], testids: [], forbidden: [], sameAs: { state: 'WL-09', why: 'one page, two regions' } } }),
    row('WL-09', { markers: { text: [], testids: [], forbidden: [] } }),
    row('WL-10', { markers: { text: ['Never'], testids: [], forbidden: [] } }),
    row('WL-11', { markers: { text: ['Eleven'], testids: [], forbidden: [] } }),
  ]);
  const run = await makeRun({
    plan, profile: profile(),
    captures: [{ runId: 'c-3', mode: 'full', items: [
      { state: 'WL-01', lines: ['Widgets', 'New widget'] },
      { state: 'WL-05', lines: ['Today', 'Coming up', 'Add a call'] },
      { state: 'WL-06', lines: ['Moves', '1 of 50 moves used today'] },
      { state: 'WL-07', lines: ['Moves', '1 of 50 moves used today'] },
      { state: 'WL-08', lines: ['Overview', 'Recent orders'] },
      { state: 'WL-09', lines: ['Overview', 'Recent orders'] },
      { state: 'WL-11', lines: ['Eleven'], servedSha: 'd'.repeat(40) },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M3', 'M15'], { captureRunId: 'c-3' });
    const by = Object.fromEntries(res.findings.map((f) => [f.state, f]));
    assert.deepEqual(Object.keys(by).sort(), ['WL-05', 'WL-06', 'WL-07', 'WL-10', 'WL-11']);
    assert.equal(by['WL-05'].rule, 'not-reached');
    assert.match(by['WL-05'].live, /missing/i);
    assert.match(by['WL-05'].live, /forbidden/i);
    assert.match(by['WL-06'].live, /identical/i);
    assert.match(by['WL-06'].live, /WL-07/);
    assert.equal(by['WL-10'].rule, 'not-captured');
    assert.match(by['WL-11'].live, /served/i);
    assert.ok(res.findings.every((f) => f.severity === 'P1'));
    assert.deepEqual(res.failures.map((f) => f.code), ['M15']);
    assert.match(res.failures[0].message, /WL-11/);
  } finally { run.cleanup(); }
});

test('M3 closes a reach finding on a state the plan no longer captures, and keeps one it still does', async () => {
  const prop = { class: 'prop', world: 'design', role: 'admin', steps: [], test: { file: 't.test.tsx', name: 'n' } };
  const plan = planWith([row('WL-01', { markers: { text: ['Widgets'], testids: [], forbidden: [] } }), row('WL-02', { reach: prop }), row('WL-03')]);
  const run = await makeRun({ plan, profile: profile(), captures: [{ runId: 'c-2', mode: 'branch', items: [{ state: 'WL-01', lines: ['Widgets'] }] }] });
  try {
    // WL-02 was seeded when this finding was recorded; it is a component-tested state now. WL-03 is
    // still captured, just not by this run.
    const stale = (state) => ({ id: `F-${state}`, source: 'check:M3', rule: 'not-reached', severity: 'P1', dayOne: false, state, group: 'Widgets',
      where: `${state}.design.admin`, design: 'the state reached, with its markers', live: 'still loading after 15s', evidence: 'seen', status: 'open', reAudits: 0 });
    await writeFindings(run.paths, { schemaVersion: 1, runId: 'c-1', findings: [stale('WL-02'), stale('WL-03')] });
    await runChecks(run.ctx, ['M3'], { captureRunId: 'c-2' });
    const doc = await readFindings(run.paths, 'x');
    const by = Object.fromEntries(doc.findings.map((f) => [f.state, f]));
    assert.equal(by['WL-02'].status, 'fixed');
    assert.equal(by['WL-02'].fixedIn, 'c-2');
    assert.equal(by['WL-03'].status, 'open', 'a state still captured stays open until a run that captures it');
  } finally { run.cleanup(); }
});

test('M3 (pure): one P1 per state not reached, variants listed; coverage by mode', async () => {
  const plan = planWith([row('WL-01'), row('WL-02'), row('WL-03', { reach: { class: 'prop', world: 'design', role: 'admin', steps: [], test: { file: 't.test.tsx', name: 'n' } } })]);
  const run = await makeRun({ plan, profile: profile(), captures: [{ runId: 'c-4', mode: 'branch', items: [{ state: 'WL-01', lines: ['A'] }] }] });
  try {
    const env = await loadCheckEnv(run.ctx, { captureRunId: 'c-4' });
    assert.deepEqual(expectedRows(env).map((r) => r.id), ['WL-01'], 'branch mode owes only its own states');
    assert.deepEqual(expectedRows(env, { unitStates: ['WL-02'] }).map((r) => r.id), ['WL-01', 'WL-02']);
    const v = (width, status, why = null) => ({ state: 'WL-01', world: 'design', role: 'admin', width, locale: 'en', theme: 'light', status, why });
    const f = reachFindings(env, [v(1440, 'reached'), v(390, 'not-reached', 'missing marker "A"')], expectedRows(env, { unitStates: ['WL-02'] }));
    assert.deepEqual(f.map((x) => `${x.state} ${x.rule}`), ['WL-01 not-reached', 'WL-02 not-captured']);
    assert.match(f[0].live, /1 of 2 captures: 390\/en\/light \(missing marker "A"\)/);
  } finally { run.cleanup(); }
});

test('M4: every design element in the live capture, with adapt substitutions and cut words skipped; controls and headings P1', async () => {
  const plan = planWith([
    row('WL-01'),
    row('WL-02', { class: 'adapt', adapt: { rule: 'banned-word', designText: 'Approve', productText: 'Send' } }),
    row('WL-09', { class: 'cut', owner: null, reach: undefined, markers: { text: ['Hear it'], testids: [], forbidden: [] }, reason: { code: 'money', text: 'paid' }, issue: 5 }),
  ]);
  const designDom = domFor(['Widgets', 'Every widget, newest first.', 'Hear it'], { extra: [{ text: 'New widget', testid: null }] });
  designDom.elements[0].tag = 'h1';
  const run = await makeRun({
    plan, profile: profile(),
    designs: {
      'WL-01': { txt: 'Widgets\nEvery widget, newest first.\nNew widget\nHear it\nLive since 17 Sep\n', dom: designDom },
      'WL-02': { txt: 'Approve v2\n', dom: domFor(['Approve v2']) },
    },
    captures: [{ runId: 'c-5', items: [
      { state: 'WL-01', lines: ['Live since 3 Sep', 'Something else'] },
      { state: 'WL-02', lines: ['Send v2'] },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M4'], { captureRunId: 'c-5' });
    const got = res.findings.map((f) => `${f.state} ${f.rule} ${f.severity} ${f.design}`).sort();
    assert.deepEqual(got, [
      'WL-01 missing-control-label P1 New widget',
      'WL-01 missing-heading P1 Widgets',
      'WL-01 missing-text P2 Every widget, newest first.',
    ]);
  } finally { run.cleanup(); }
});

test('M4: an adapt row\'s extra pairs apply too, and a whole pair only replaces an element that is exactly its text', async () => {
  // A call panel drawing an agent's name, an "AI" badge and an order number the product stores
  // nowhere: one adapt row carries them all, and "AI" must not rewrite "Said again" or "Paid".
  const plan = planWith([
    row('WL-01'),
    row('WL-02', { class: 'adapt', adapt: { rule: 'data-not-in-product', designText: 'Agent Amina', productText: 'Agent',
      also: [{ designText: 'AI', productText: '', whole: true }, { designText: 'Order 48412', productText: '' }] } }),
  ]);
  const run = await makeRun({
    plan, profile: profile(),
    designs: { 'WL-01': { txt: 'Agent Amina\nAI\nOrder 48412\nSaid again\nPaid\n', dom: domFor(['Agent Amina', 'AI', 'Order 48412', 'Said again', 'Paid']) } },
    captures: [{ runId: 'c-6', items: [{ state: 'WL-01', lines: ['Agent', 'Said again'] }] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M4'], { captureRunId: 'c-6' });
    assert.deepEqual(res.findings.map((f) => `${f.state} ${f.design}`), ['WL-01 Paid']);
  } finally { run.cleanup(); }
});

test('M4 judges the design\'s own viewer: an admin capture before a member one, and no label a member is not shown', async () => {
  // The design draws what an admin sees. A member capture listed first used to be the one M4
  // compared, so "New widget" (hidden from members by the plan) and "Settings for Sam" (the
  // admin's name) read as missing on a page that was right.
  const add = { label: 'New widget', testid: 'w-new', target: 'none', effect: 'none', permission: { member: 'hidden' } };
  const plan = planWith([
    row('WL-01', { permission: { member: 'enabled' }, controls: [add] }),
    row('WL-11', { permission: { member: 'enabled' }, controls: [add], reach: { class: 'seeded', world: 'design', role: 'member', steps: [{ goto: '/widgets' }] } }),
  ]);
  const run = await makeRun({
    plan, profile: profile(),
    designs: {
      'WL-01': { txt: 'Settings for Sam\nNew widget\n', dom: domFor(['Settings for Sam'], { extra: [{ text: 'New widget', testid: 'w-new' }] }) },
      'WL-11': { txt: 'Widgets\nNew widget\nOnly an owner can add one.\n', dom: domFor(['Widgets', 'Only an owner can add one.'], { extra: [{ text: 'New widget', testid: 'w-new' }] }) },
    },
    captures: [{ runId: 'c-5m', items: [
      { state: 'WL-01', role: 'member', lines: ['Settings for Kim'] },
      { state: 'WL-01', role: 'admin', lines: ['Settings for Sam', 'New widget'] },
      { state: 'WL-11', role: 'member', lines: ['Widgets'] },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M4'], { captureRunId: 'c-5m' });
    assert.deepEqual(res.findings.map((f) => `${f.state} ${f.rule} ${f.design}`), ['WL-11 missing-text Only an owner can add one.']);
  } finally { run.cleanup(); }
});

test('M9: controls present, enabled unless enabledWhen says otherwise, and as the permission says for a member', async () => {
  const controls = [
    { label: 'New widget', testid: 'w-new', effect: 'free', target: 'WL-02' },
    { label: 'Delete', testid: 'w-del', effect: 'destructive', target: 'none', enabledWhen: 'a widget is selected' },
    { label: 'Export', testid: 'w-export', effect: 'none', target: 'external' },
  ];
  const plan = planWith([row('WL-01', { controls, permission: { member: 'hidden' } }), row('WL-02')], { worlds: [world('design')] });
  const run = await makeRun({
    plan, profile: profile(),
    captures: [{ runId: 'c-6', items: [
      { state: 'WL-01', lines: ['Widgets'], dom: domFor(['Widgets'], { extra: [{ text: 'New widget', testid: 'w-new', disabled: true }, { text: 'Delete', testid: 'w-del', disabled: true }] }) },
      { state: 'WL-01', role: 'member', lines: ['Widgets'], dom: domFor(['Widgets'], { extra: [{ text: 'Export', testid: 'w-export' }] }) },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M9'], { captureRunId: 'c-6' });
    const got = res.findings.map((f) => `${f.rule} ${f.where.split('#')[1]}`).sort();
    assert.deepEqual(got, ['control-missing admin:w-export', 'member-treatment member:w-export', 'wrongly-disabled admin:w-new']);
    assert.ok(res.findings.every((f) => f.severity === 'P1'));
  } finally { run.cleanup(); }
});

test('M9: member-not-captured only in a mode that adds member variants, not in a branch capture', async () => {
  const controls = [{ label: 'New widget', testid: 'w-new', effect: 'free', target: 'WL-02' }];
  // WL-01 and WL-02 both declare a member rule; only WL-02's own reach is a member, which is all a
  // branch capture ever produces. The unit gate runs in branch mode, so WL-01 is not owed a member
  // capture there; the same capture in wave mode is, because wave mode adds the variant itself.
  const rows = [
    row('WL-01', { controls, permission: { member: 'hidden' } }),
    row('WL-02', { controls, permission: { member: 'hidden' }, reach: { class: 'seeded', world: 'design', role: 'member', steps: [{ goto: '/widgets/wl-02' }] } }),
  ];
  const plan = planWith(rows, { worlds: [world('design')] });
  const items = [
    { state: 'WL-01', lines: ['Widgets'], dom: domFor(['Widgets'], { extra: [{ text: 'New widget', testid: 'w-new' }] }) },
    { state: 'WL-02', role: 'member', lines: ['Widgets'], dom: domFor(['Widgets']) },
  ];
  const branch = await makeRun({ plan, profile: profile(), captures: [{ runId: 'c-6b', mode: 'branch', items }] });
  try {
    const res = await runChecks(branch.ctx, ['M9'], { captureRunId: 'c-6b' });
    assert.deepEqual(res.findings.filter((f) => f.rule === 'member-not-captured'), []);
  } finally { branch.cleanup(); }

  const wave = await makeRun({ plan, profile: profile(), captures: [{ runId: 'c-6w', mode: 'wave', items }] });
  try {
    const res = await runChecks(wave.ctx, ['M9'], { captureRunId: 'c-6w' });
    assert.deepEqual(res.findings.filter((f) => f.rule === 'member-not-captured').map((f) => f.state), ['WL-01']);
  } finally { wave.cleanup(); }
});

test("M9: a control's own member rule wins, and a row's copy in another world is data, not this state", async () => {
  const controls = [
    { label: 'List', testid: 'w-tab', effect: 'none', target: 'WL-01' },
    // A member sees the tabs and the rows, and not the button that creates one. One rule for the
    // whole row cannot say that, and saying "enabled" made the member's page a P1 four times over.
    { label: 'New widget', testid: 'w-new', effect: 'free', target: 'WL-02', permission: { member: 'hidden' } },
  ];
  const rows = [row('WL-01', { controls, permission: { member: 'enabled' } }), row('WL-02')];
  const plan = planWith(rows, { worlds: [world('design'), { ...world('messy'), kind: 'messy' }] });
  const dom = domFor(['Widgets'], { extra: [{ text: 'List', testid: 'w-tab' }] });
  const run = await makeRun({
    plan, profile: profile(),
    captures: [{ runId: 'c-6m', mode: 'wave', items: [
      { state: 'WL-01', lines: ['Widgets'], dom: domFor(['Widgets'], { extra: [{ text: 'List', testid: 'w-tab' }, { text: 'New widget', testid: 'w-new' }] }) },
      { state: 'WL-01', role: 'member', lines: ['Widgets'], dom },
      // The same row again in the messy world, captured for its invariants, not as this state.
      { state: 'WL-01', world: 'messy', lines: ['Widgets'], dom: domFor(['Widgets']) },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M9'], { captureRunId: 'c-6m' });
    const got = res.findings.map((f) => `${f.rule} ${f.where.split('#')[1] ?? f.where}`).sort();
    assert.deepEqual(got, [], JSON.stringify(res.findings, null, 1));
  } finally { run.cleanup(); }
});

test('M10, M16, M17 from the capture logs; intercepted and aborted requests are never findings', async () => {
  const log = {
    schemaVersion: 1,
    console: [{ type: 'error', text: 'Failed to load resource' }, { type: 'warning', text: 'deprecated' }],
    requests: [
      { method: 'GET', url: 'http://localhost:4101/api/widgets?page=2', status: 500, failure: null, intercepted: false, aborted: false },
      { method: 'POST', url: 'http://localhost:4101/api/widgets', status: 500, failure: null, intercepted: true, aborted: false },
      { method: 'POST', url: 'http://localhost:4101/api/other', status: null, failure: 'net::ERR_ABORTED', intercepted: false, aborted: true },
    ],
    perf: { requestCount: 400, loadMs: 9000 },
    axe: [{ id: 'color-contrast', impact: 'serious', nodes: 2, help: 'Contrast' }, { id: 'region', impact: 'moderate', nodes: 1, help: 'Landmarks' }, { id: 'minor-thing', impact: 'minor', nodes: 1, help: 'x' }],
  };
  const run = await makeRun({ plan: planWith([row('WL-01')]), profile: profile(), captures: [{ runId: 'c-7', items: [{ state: 'WL-01', lines: ['A'], errors: log }, { state: 'WL-01', width: 390, lines: ['A'], errors: log }] }] });
  try {
    const res = await runChecks(run.ctx, ['M10', 'M16', 'M17'], { captureRunId: 'c-7' });
    const got = res.findings.map((f) => `${f.source} ${f.rule} ${f.severity}`).sort();
    assert.deepEqual(got, [
      'check:M10 console-error P1', 'check:M10 failed-request P1',
      'check:M16 axe-moderate P3', 'check:M16 axe-serious P2',
      'check:M17 load-time P3', 'check:M17 request-count P3',
    ]);
  } finally { run.cleanup(); }
});

test('M12: the founder\'s organisation gets M7 and M10, and the plan\'s invariants hold there and in the messy world', async () => {
  const plan = planWith([row('WL-01', { invariants: ['at most one version row shows Submit', '"no orders yet" never beside "1 orders"'] })], { worlds: [world('design'), world('messy', 'messy')] });
  const run = await makeRun({
    plan, profile: profile(),
    captures: [{ runId: 'c-8', mode: 'full', items: [
      { state: 'WL-01', world: 'real-org', lines: ['Submit', 'Submit', 'Approved'] },
      { state: 'WL-01', world: 'messy', lines: ['No orders yet', 'History · 1 orders'] },
      { state: 'WL-01', lines: ['Submit', 'Submit'] },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M12', 'M7'], { captureRunId: 'c-8' });
    const got = res.findings.map((f) => `${f.source} ${f.rule} ${f.state}`).sort();
    assert.deepEqual(got, [
      'check:M12 copy:banned-word WL-01',
      'check:M12 invariant WL-01',
      'check:M12 invariant WL-01',
      'check:M7 count-one-plural WL-01',
    ]);
    assert.ok(res.findings.filter((f) => f.rule === 'invariant').every((f) => f.severity === 'P1'));
  } finally { run.cleanup(); }
});

test('M5 and M6 are advisory: their output goes to hints/, never to findings.json', async () => {
  const plan = planWith([row('WL-01', { markers: { text: ['Widgets', 'Save'], testids: [], forbidden: [] } })]);
  const design = domFor(['Widgets', 'Save']);
  const live = domFor(['Widgets', 'Save'], { fonts: [{ family: 'Brand Sans', loaded: false }] });
  live.elements[0].style.fontSize = 20;
  [live.elements[0].box, live.elements[1].box] = [live.elements[1].box, live.elements[0].box];
  const run = await makeRun({
    plan, profile: profile(), designs: { 'WL-01': { txt: 'Widgets\nSave\n', dom: design } },
    captures: [{ runId: 'c-9', items: [
      { state: 'WL-01', lines: ['Widgets', 'Save'], dom: live },
      { state: 'WL-01', width: 390, lines: ['Widgets', 'Save'], dom: domFor(['Widgets', 'Save'], { width: 390, scrollWidth: 520, extra: [{ text: 'Save changes now', testid: 'w-save', lines: 2, clipped: true }] }) },
    ] }],
  });
  try {
    const res = await runChecks(run.ctx, ['M5', 'M6'], { captureRunId: 'c-9' });
    assert.deepEqual(res.findings, []);
    const rules = res.hints.map((h) => h.rule).sort();
    assert.deepEqual(rules, ['font-not-loaded', 'phone-clipped', 'phone-overflow', 'phone-wraps', 'relation', 'style']);
    assert.ok(existsSync(join(run.paths.runDir, 'hints', 'M5.json')));
    assert.equal(JSON.parse(readFileSync(join(run.paths.runDir, 'hints', 'M6.json'), 'utf8')).hints.length, 4);
    assert.equal(existsSync(run.paths.findings), false);
  } finally { run.cleanup(); }
});

test('a check that needs a capture fails cleanly when there is none; M1 and M8 run without one', async () => {
  const run = await makeRun({ plan: planWith([row('WL-01', { copy: [{ key: 'widgets.title', en: 'Widgets', plural: false }] })]), profile: profile(), files: { 'apps/web/messages/en.json': '{"widgets":{"title":"Widgets"}}', 'apps/web/messages/fr.json': '{"widgets":{"title":"{count} gadgets"}}' } });
  try {
    const res = await runChecks(run.ctx, ['M7', 'M8'], {});
    assert.deepEqual(res.failures.map((f) => f.code), ['M7']);
    assert.match(res.failures[0].message, /needs a capture run/);
    assert.deepEqual(res.findings.map((f) => `${f.rule} ${f.where}`), ['count-outside-plural apps/web/messages/fr.json#widgets.title:{count}']);
  } finally { run.cleanup(); }
});

test('a check whose slice has not landed shows as a failure line, not a crash', async () => {
  const run = await makeRun({ plan: planWith([row('WL-01')]), profile: profile() });
  try {
    const boom = { id: 'M2', needsCapture: false, async run() { const e = new Error('not implemented (slice B2): checkM2'); e.exit = 2; e.code = 'not-implemented'; throw e; } };
    const res = await runChecksWith(run.ctx, ['M2'], {}, { checks: { M2: boom } });
    assert.equal(res.failures.length, 1);
    assert.match(res.failures[0].message, /not implemented/);
    assert.equal(res.exit, 2, 'its exit reaches the caller');
  } finally { run.cleanup(); }
});
