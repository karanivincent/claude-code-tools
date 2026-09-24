// The capture validator's rules (spec 6.2), including synthetic twins of the three real refusals
// 20.2 names for M3: a round-shaped state captured in the one-at-a-time shape (required markers
// missing, a forbidden one present, identical to its sibling), and two prop-only states whose
// captures are byte-identical to their neighbours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeItems, normaliseText, markerPattern, textShows, errorReasons, sameSha, textHash } from '../../lib/capture/judge.mjs';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const rowsOf = (list) => new Map(list.map((r) => [r.id, r]));
const item = (state, lines, over = {}) => ({
  key: `${state}.${over.world ?? 'design'}.${over.role ?? 'admin'}.${over.width ?? 1440}.${over.locale ?? 'en'}.light`,
  state, world: 'design', role: 'admin', width: 1440, locale: 'en', theme: 'light', check: 'markers',
  written: true, error: null, lines, testids: [], servedSha: SHA, errors: { schemaVersion: 1, console: [], requests: [], perf: { requestCount: 1, loadMs: 1 }, axe: null },
  ...over,
});
const judge = (items, rows, extra = {}) => judgeItems({ items, rows: rowsOf(rows), expectedSha: SHA, primaryLocale: 'en', ...extra });

// the "rounds" Today card and the "one at a time" Today card of a generic dispatch screen
const ROUND = { id: 'DS-05', markers: { text: ['Today’s round', 'Pause', 'still to call'], testids: ['today-card'], forbidden: ['Coming up', 'Add a call'] } };
const ONE = { id: 'DS-07', markers: { text: ['Coming up', 'Add a call'], testids: ['today-card'], forbidden: ['Pause'] } };
const ONE_SHAPE = ['Dispatch', 'Today', 'Coming up', 'Add a call', 'When', 'Customer'];

test('twin of a round state captured in the one-at-a-time shape: markers missing, forbidden present, identical text', () => {
  const v = judge([item('DS-05', ONE_SHAPE, { testids: ['today-card'] }), item('DS-07', ONE_SHAPE, { testids: ['today-card'] })], [ROUND, ONE]);
  assert.equal(v[0].status, 'not-reached');
  assert.match(v[0].why, /missing markers "Today’s round", "Pause", "still to call"/);
  assert.match(v[0].why, /forbidden markers present "Coming up", "Add a call"/);
  assert.match(v[0].why, /identical text to DS-07 \(same world and role\)/);
  assert.equal(v[1].status, 'not-reached', 'its sibling is refused too: which one is wrong is not decidable from text');
  assert.match(v[1].why, /identical text to DS-05/);
});

test('twins of two prop-only states whose captures equal their neighbours', () => {
  const allowance = { id: 'AS-01', markers: { text: ['of 50 moves used today'], testids: [], forbidden: ['moves are used up'] } };
  const spent = { id: 'AS-05', markers: { text: ['Today’s 50 moves are used up.'], testids: [], forbidden: ['of 50 moves used today'] } };
  const lines = ['Write with help', '3 of 50 moves used today', 'Write it'];
  const v = judge([item('AS-01', lines), item('AS-05', lines)], [allowance, spent]);
  assert.equal(v[1].status, 'not-reached');
  assert.match(v[1].why, /missing marker "Today’s 50 moves are used up\."/);
  assert.match(v[1].why, /forbidden marker present "of 50 moves used today"/);
  assert.match(v[1].why, /identical text to AS-01/);
});

test('same-as declared in the plan lets two identical captures stand', () => {
  const a = { id: 'OV-10', markers: { text: ['How calls start'], testids: [], forbidden: [] } };
  const b = { id: 'OV-12', markers: { text: ['How calls end'], testids: [], forbidden: [], sameAs: { state: 'OV-10', why: 'regions of one page' } } };
  const page = ['How calls start', 'How calls end'];
  const v = judge([item('OV-10', page), item('OV-12', page)], [a, b]);
  assert.deepEqual(v.map((x) => x.status), ['reached', 'reached']);
});

test('same-as is followed to its end: states declared the same as one page all stand together', () => {
  const page = ['Home', 'Calls', 'Knowledge'];
  const hub = { id: 'KC-05', markers: { text: ['Knowledge'], testids: [], forbidden: [] } };
  const same = (id) => ({ id, markers: { text: ['Home'], testids: [], forbidden: [], sameAs: { state: 'KC-05', why: 'the sidebar on the page' } } });
  const v = judge([item('SH-01', page), item('CAP-054', page), item('CAP-055', page)], [hub, same('SH-01'), same('CAP-054'), same('CAP-055')]);
  assert.deepEqual(v.map((x) => x.status), ['reached', 'reached', 'reached']);
  const other = { id: 'KC-09', markers: { text: ['Home'], testids: [], forbidden: [] } };
  const w = judge([item('SH-01', page), item('KC-09', page)], [hub, same('SH-01'), other]);
  assert.match(w[1].why, /identical text to SH-01/);
});

test('text is compared normalised: curly quotes, no-break spaces and runs of spaces', () => {
  assert.equal(normaliseText(`Today’s  round${String.fromCharCode(0xa0)}now`), "Today's round now");
  const v = judge([item('DS-05', ["Today's round", 'Pause', '43 still to call'], { testids: ['today-card'] })], [ROUND]);
  assert.equal(v[0].status, 'reached', v[0].why);
});

test('outside the design world numbers in text markers match any number', () => {
  assert.ok(markerPattern('3 widgets in stock').test('12 widgets in stock'));
  assert.ok(!markerPattern('3 widgets in stock').test('widgets in stock'));
  assert.ok(textShows(['5 widgets in stock'], '3 widgets in stock', true));
  assert.ok(!textShows(['5 widgets in stock'], '3 widgets in stock', false));
  const row = { id: 'WG-01', markers: { text: ['3 widgets in stock'], testids: [], forbidden: [] } };
  const messy = judge([item('WG-01', ['5 widgets in stock'], { world: 'messy' })], [row], { worldKinds: { messy: 'messy', design: 'design' } });
  assert.equal(messy[0].status, 'reached');
  const design = judge([item('WG-01', ['5 widgets in stock'])], [row], { worldKinds: { design: 'design' } });
  assert.equal(design[0].status, 'not-reached');
});

test('in another locale the words are not English: test ids still bind, text markers do not', () => {
  const row = { id: 'WG-01', markers: { text: ['3 widgets in stock'], testids: ['widget-list'], forbidden: ['No widgets yet', 'widget-empty'] } };
  const ok = judge([item('WG-01', ['3 widgets en stock'], { locale: 'fr', testids: ['widget-list'] })], [row]);
  assert.equal(ok[0].status, 'reached');
  const bad = judge([item('WG-01', ['3 widgets en stock'], { locale: 'fr', testids: ['widget-empty'] })], [row]);
  assert.match(bad[0].why, /missing marker testid widget-list; forbidden marker present testid widget-empty/);
});

test('served SHA: a different build, or none reported, refuses the capture', () => {
  const row = { id: 'WG-01', markers: { text: ['Widgets'], testids: [], forbidden: [] } };
  assert.match(judge([item('WG-01', ['Widgets'], { servedSha: '0123456789abcdef0123456789abcdef01234567' })], [row])[0].why, /served 0123456789ab, expected abcdef123456/);
  assert.match(judge([item('WG-01', ['Widgets'], { servedSha: null })], [row])[0].why, /reported no served SHA/);
  assert.equal(judge([item('WG-01', ['Widgets'], { servedSha: SHA.slice(0, 7) })], [row])[0].status, 'reached', 'an abbreviated SHA of the same commit');
  assert.ok(sameSha('abcdef1', SHA));
  assert.ok(!sameSha('abcdef', SHA), 'fewer than 7 characters proves nothing');
});

test('console errors and failed requests refuse a capture; intercepts, read-only aborts and cancelled navigation do not', () => {
  const errs = (console, requests) => ({ schemaVersion: 1, console, requests, perf: { requestCount: 1, loadMs: 1 }, axe: null });
  const req = (over) => ({ method: 'GET', url: 'https://app.example.invalid/api/x', status: 200, failure: null, intercepted: false, aborted: false, ...over });
  assert.deepEqual(errorReasons(errs([{ type: 'warning', text: 'deprecated' }], [req({ status: 500, intercepted: true }), req({ method: 'POST', status: null, failure: 'net::ERR_BLOCKED_BY_CLIENT', aborted: true }), req({ status: null, failure: 'net::ERR_ABORTED' })])), []);
  assert.deepEqual(errorReasons(errs([{ type: 'error', text: 'Uncaught TypeError: x is undefined' }], [])), ['console error: Uncaught TypeError: x is undefined']);
  assert.deepEqual(errorReasons(errs([], [req({ status: 404 }), req({ status: 500 })])), ['failed requests (2): GET /api/x 404']);
  assert.deepEqual(errorReasons(errs([], [req({ status: null, failure: 'net::ERR_CONNECTION_REFUSED' })])), ['failed request: GET /api/x net::ERR_CONNECTION_REFUSED']);
});

test('nothing written, an error while reaching, an edited .txt, or no visible text: not reached', () => {
  const row = { id: 'WG-01', markers: { text: ['Widgets'], testids: [], forbidden: [] } };
  assert.equal(judge([item('WG-01', [], { written: false })], [row])[0].why, 'the capture wrote nothing for this item');
  assert.match(judge([item('WG-01', [], { written: false, error: 'sign-in as a@example.invalid failed: timeout' })], [row])[0].why, /sign-in .* failed/);
  assert.match(judge([item('WG-01', ['Widgets'], { tampered: 'the .txt no longer matches the capture (changed after capture)' })], [row])[0].why, /changed after capture/);
  assert.match(judge([item('WG-01', [])], [row])[0].why, /no visible text/);
  assert.match(judge([item('ZZ-01', ['x'])], [row])[0].why, /no markers/);
});

test('member, real-organisation and baseline items are captured, not judged against markers', () => {
  const row = { id: 'WG-01', markers: { text: ['Widgets'], testids: ['widget-list'], forbidden: [] } };
  const v = judge([
    item('WG-01', ['Something else'], { role: 'member', check: 'permission' }),
    item('WG-01', ['Real data'], { world: 'real-org', check: 'none' }),
  ], [row]);
  assert.deepEqual(v.map((x) => x.status), ['reached', 'reached']);
  assert.equal(textHash(['a', ' b ']), textHash(['a', 'b']));
});

test('an error state reached by an intercept may log its failure; a thrown page error still refuses', () => {
  const row = { id: 'WG-04', reach: { class: 'action', world: 'design', role: 'admin', steps: [], intercept: { method: 'POST', url: '/api/refresh', status: 500, body: '{}' } }, markers: { text: ['Refresh failed'], testids: [], forbidden: [] } };
  const errs = (console) => ({ schemaVersion: 1, console, requests: [], perf: { requestCount: 1, loadMs: 1 }, axe: null });
  const logged = judge([item('WG-04', ['Refresh failed'], { errors: errs([{ type: 'error', text: 'refresh failed: 500' }]) })], [row]);
  assert.equal(logged[0].status, 'reached', logged[0].why);
  const thrown = judge([item('WG-04', ['Refresh failed'], { errors: errs([{ type: 'pageerror', text: 'TypeError: boom' }]) })], [row]);
  assert.match(thrown[0].why, /console error: TypeError: boom/);
});

// A world exists to make the data differ. Two worlds rendering the same text mean the world never
// reached the app, and every marker those two states share then passes. The widgets rehearsal's
// wave-0 smoke captured four items, every one byte-identical, and the design state was reported
// reached.
test('two worlds that render the same text are both refused, unless the plan says same-as', () => {
  const shell = ['Widgets', 'List', 'Settings', '3 WIDGETS IN STOCK'];
  const design = { id: 'WG-01', markers: { text: ['Widgets', 'List'], testids: [], forbidden: [] }, reach: { class: 'seeded', world: 'design' } };
  const empty = { id: 'WG-02', markers: { text: ['Widgets', 'List'], testids: [], forbidden: [] }, reach: { class: 'seeded', world: 'empty' } };

  const v = judge(
    [item('WG-01', shell, { world: 'design' }), item('WG-02', shell, { world: 'empty' })],
    [design, empty],
  );
  assert.deepEqual(v.map((x) => x.status), ['not-reached', 'not-reached']);
  assert.match(v[0].why, /identical text to WG-02 \(empty\) in another world, so the world made no difference/);
  assert.match(v[1].why, /identical text to WG-01 \(design\) in another world/);

  // The plan may declare that two states really are one page.
  const declared = judge(
    [item('WG-01', shell, { world: 'design' }), item('WG-02', shell, { world: 'empty' })],
    [design, { ...empty, markers: { ...empty.markers, sameAs: { state: 'WG-01', why: 'the same shell' } } }],
  );
  assert.deepEqual(declared.map((x) => x.status), ['reached', 'reached']);

  // Different text in two worlds is the normal case and says nothing.
  const differing = judge(
    [item('WG-01', shell, { world: 'design' }), item('WG-02', ['Widgets', 'List', 'Settings', 'NO WIDGETS YET'], { world: 'empty' })],
    [design, empty],
  );
  assert.deepEqual(differing.map((x) => x.status), ['reached', 'reached']);
});
