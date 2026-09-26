// Picture mode at two widths: the phone items a map declares, how they are shot, named, reviewed and
// counted, and the regression that a desktop-only map behaves exactly as it did in 0.4.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderChecklist, validateMap, writesData } from '../../lib/picture/map.mjs';
import { buttonExpectation, captureOrder, contextOptions, resultLine, selectStates } from '../../lib/picture/shoot.mjs';
import { parseReview, renderCompare, summarise } from '../../lib/picture/review.mjs';
import { latestVerdicts, pictureNext, phoneRenderOwed } from '../../lib/picture/next.mjs';
import { pictureReadiness } from '../../lib/run/ready-compute.mjs';
import { planRenders, renderFileName } from '../../lib/design/render.mjs';
import {
  cropFor, designFileCandidates, designFor, itemKey, mapItems, mapWidths, normaliseItemKey, overflowProblem, parseItemKey, roundFiles, stateWidths,
} from '../../lib/picture/widths.mjs';
import { sampleMap } from './map.test.mjs';

/** The sample map at both widths: KC-05 responsive, KC-04 reached differently on a phone, KC-08 with its own mobile frame, KC-20 on a phone only. */
function phoneMap() {
  const m = sampleMap({ widths: ['desktop', 'phone'], pageArea: { left: 240, designLeft: 240, phone: { left: 0 } } });
  m.states[0].buttons[2].phone = 'hidden';
  m.states[0].buttons.push({ label: 'Menu', testid: 'kb-menu', effect: 'none', phone: 'shown' });
  m.states[1].reach.phone = { steps: [{ goto: '/dashboard/knowledge?view=check' }, { click: { testid: 'kb-menu' } }, { click: { testid: 'kb-add-knowledge' } }] };
  m.states[2].design = { phone: 'KC-M-08' };
  m.states.push({ id: 'KC-20', screen: 'To check', name: 'Navigation menu open', widths: ['phone'],
    reach: { world: 'design', role: 'admin', steps: [{ goto: '/dashboard/knowledge' }, { click: { testid: 'kb-menu' } }] }, buttons: [] });
  return m;
}
const desktopPictures = ['KC-05', 'KC-04', 'KC-08', 'KC-01', 'KC-M-08'];
const phonePictures = ['KC-05@phone', 'KC-04@phone', 'KC-08@phone', 'KC-01@phone', 'KC-20@phone', 'KC-M-08@phone'];
const designed = new Set([...desktopPictures, ...phonePictures]);
const has = (problems, text) => problems.some((p) => p.includes(text));

// ---- Map validation ----

test('a map at both widths, with a responsive state, a mobile frame, a phone-only state and phone reach steps, is valid', () => {
  assert.deepEqual(validateMap(phoneMap(), { designed }), []);
});

test('widths must be known names, listed once, and a state may only narrow the map\'s list', () => {
  assert.ok(has(validateMap(sampleMap({ widths: ['tablet'] }), { designed }), 'widths names "tablet"'));
  assert.ok(has(validateMap(sampleMap({ widths: [] }), { designed }), 'widths must be a list of widths'));
  assert.ok(has(validateMap(sampleMap({ widths: ['phone', 'phone'] }), { designed }), 'widths lists a width twice'));
  const m = sampleMap();
  m.states[1].widths = ['phone'];
  assert.ok(has(validateMap(m, { designed }), 'state KC-04 is checked at phone, which the map\'s widths do not declare'));
  const p = phoneMap();
  p.states[1].widths = ['watch'];
  assert.ok(has(validateMap(p, { designed }), 'state KC-04 widths names "watch"'));
});

test('pageArea.phone takes whole pixels', () => {
  const m = phoneMap();
  m.pageArea.phone = { left: -1 };
  assert.ok(has(validateMap(m, { designed }), 'pageArea.phone.left must be a whole number of pixels'));
});

test('design.phone must name a design picture, and design takes only its allowed shapes', () => {
  const m = phoneMap();
  m.states[2].design = { phone: 'KC-M-99' };
  assert.ok(has(validateMap(m, { designed }), 'state KC-08 design.phone names KC-M-99, which has no design picture'));
  m.states[2].design = { mobile: 'KC-M-08' };
  assert.ok(has(validateMap(m, { designed }), 'state KC-08 design must be false, a design state id'));
  m.states[2].design = 3;
  assert.ok(has(validateMap(m, { designed }), 'state KC-08 design must be false'));
  m.states[2].design = { phone: false };
  // With no state pointing at it any more, the mobile frame's picture is one without a state.
  assert.deepEqual(validateMap(m, { designed }), ['design state KC-M-08 has a picture but no entry in the map']);
  assert.deepEqual(validateMap(m, { designed: new Set([...designed].filter((p) => !p.startsWith('KC-M-'))) }), []);
});

test('a mobile frame a state points at is covered; one nothing points at is a picture without a state', () => {
  assert.ok(!has(validateMap(phoneMap(), { designed }), 'KC-M-08 has a picture but no entry'));
  assert.ok(has(validateMap(phoneMap(), { designed: new Set([...designed, 'KC-M-09']) }), 'design state KC-M-09 has a picture but no entry'));
  assert.ok(has(validateMap(phoneMap(), { designed: new Set([...designed, 'KC-M-09@phone']) }), 'design state KC-M-09 has a picture but no entry'));
});

test('phone pictures are required once the design is rendered at phone width, not before', () => {
  const without = new Set([...designed].filter((p) => p !== 'KC-04@phone'));
  assert.ok(has(validateMap(phoneMap(), { designed: without }), 'state KC-04 has no phone design picture'));
  const desktopOnly = new Set(desktopPictures);
  assert.deepEqual(validateMap(phoneMap(), { designed: desktopOnly }), []);
  // A phone-only state needs no desktop picture.
  assert.ok(!has(validateMap(phoneMap(), { designed }), 'state KC-20 has no design picture'));
});

test('reach.phone must be steps, belongs to a state checked on a phone, and obeys the same step and safety rules', () => {
  const m = phoneMap();
  m.states[1].reach.phone = { steps: [] };
  assert.ok(has(validateMap(m, { designed }), 'state KC-04 reach.phone must be { "steps": [...] }'));
  const d = sampleMap();
  d.states[1].reach.phone = { steps: [{ goto: '/x' }] };
  assert.ok(has(validateMap(d, { designed }), 'state KC-04 has reach.phone but is not checked at phone width'));
  const s = phoneMap();
  s.states[1].reach.phone.steps.push({ click: { testid: 'kb-read-website' } });
  assert.ok(has(validateMap(s, { designed }), 'clicks "kb-read-website", whose effect is metered'));
  const k = phoneMap();
  k.states[1].reach.phone.steps.push({ goto: '/x', click: { testid: 'a' } });
  assert.ok(has(validateMap(k, { designed }), 'state KC-04 reach.phone has a step that is not exactly one of'));
  const t = phoneMap();
  t.states[3].reach.phone = { steps: [{ goto: '/x' }] };
  assert.ok(has(validateMap(t, { designed }), 'state KC-01 is reached by a component test, so it has no reach.phone'));
});

test('a button\'s phone visibility is "hidden" or "shown"', () => {
  const m = phoneMap();
  m.states[0].buttons[0].phone = 'sometimes';
  assert.ok(has(validateMap(m, { designed }), 'button "Add knowledge" phone must be "hidden" or "shown"'));
});

test('the checklist names the widths, phone-only states, phone reach steps, mobile frames and phone-only buttons', () => {
  const md = renderChecklist(phoneMap());
  assert.match(md, /^Widths: desktop \(1440 px\) and phone \(390 px\)\./m);
  assert.match(md, /## KC-20: To check \/ Navigation menu open\n- Widths: phone only/);
  assert.match(md, /- Reached on a phone by: open \/dashboard\/knowledge\?view=check then click "kb-menu" then click "kb-add-knowledge"/);
  assert.match(md, /- Phone design: its own mobile frame, KC-M-08/);
  assert.match(md, /Button "Menu" \(kb-menu\) → stays \(on a phone only\)/);
  assert.match(md, /Button "Read my website" \(kb-read-website\) → stays \(hidden on a phone\) \[metered/);
});

// ---- Items, names and crops ----

test('item keys: the desktop keeps the state id, the phone adds @phone', () => {
  assert.equal(itemKey('KC-05'), 'KC-05');
  assert.equal(itemKey('KC-05', 'desktop'), 'KC-05');
  assert.equal(itemKey('KC-05', 'phone'), 'KC-05@phone');
  assert.deepEqual(parseItemKey('KC-05@phone'), { id: 'KC-05', width: 'phone' });
  assert.deepEqual(parseItemKey('KC-05'), { id: 'KC-05', width: 'desktop' });
  assert.equal(normaliseItemKey('KC-05@desktop'), 'KC-05');
  assert.deepEqual(mapWidths(sampleMap()), ['desktop']);
  assert.deepEqual(stateWidths(phoneMap().states[4], phoneMap()), ['phone']);
  assert.deepEqual(mapItems(phoneMap()).map((i) => i.key),
    ['KC-05', 'KC-05@phone', 'KC-04', 'KC-04@phone', 'KC-08', 'KC-08@phone', 'KC-01', 'KC-01@phone', 'KC-20@phone']);
});

test('file names: round pictures, design renders, and which design picture each item uses', () => {
  assert.deepEqual(roundFiles('KC-05'), { live: 'KC-05.live.png', design: 'KC-05.design.png' });
  assert.deepEqual(roundFiles('KC-05@phone'), { live: 'KC-05@phone.live.png', design: 'KC-05@phone.design.png' });
  assert.equal(renderFileName('KC-05', 'desktop', 'png'), 'KC-05.png');
  assert.equal(renderFileName('KC-05', 'phone', 'png'), 'KC-05@phone.png');
  assert.equal(renderFileName('KC-05', 'phone', 'dom.json'), 'KC-05@phone.dom.json');
  const m = phoneMap();
  assert.deepEqual(designFileCandidates(m.states[0], 'desktop'), ['KC-05.png']);
  assert.deepEqual(designFileCandidates(m.states[0], 'phone'), ['KC-05@phone.png']);
  assert.deepEqual(designFileCandidates(m.states[2], 'desktop'), ['KC-08.png']);
  assert.deepEqual(designFileCandidates(m.states[2], 'phone'), ['KC-M-08@phone.png', 'KC-M-08.png']);
  assert.deepEqual(designFileCandidates({ id: 'X', design: 'Y' }, 'desktop'), ['Y.png']);
  assert.deepEqual(designFileCandidates({ id: 'X', design: 'Y' }, 'phone'), ['Y@phone.png']);
  assert.deepEqual(designFileCandidates({ id: 'X', design: false }, 'phone'), []);
  assert.deepEqual(designFileCandidates({ id: 'X', design: { phone: false } }, 'phone'), []);
  assert.deepEqual(designFor({ id: 'X', design: { desktop: false, phone: 'M' } }, 'desktop'), null);
});

test('crops: the desktop keeps pageArea, the phone has no sidebar unless pageArea.phone says so', () => {
  assert.deepEqual(cropFor(phoneMap(), 'desktop'), { left: 240, designLeft: 240 });
  assert.deepEqual(cropFor(phoneMap(), 'phone'), { left: 0, designLeft: 0 });
  assert.deepEqual(cropFor(sampleMap(), 'phone'), { left: 0, designLeft: 0 });
  assert.deepEqual(cropFor({ pageArea: { phone: { left: 4, designLeft: 8 } } }, 'phone'), { left: 4, designLeft: 8 });
});

test('a phone design render skips picture-only states and renders the rest', () => {
  const inv = { states: [
    { id: 'A-01', reach: { kind: 'click', steps: [] } },
    { id: 'A-02', reach: { kind: 'shot-only' }, shots: ['shots/a.png'] },
  ] };
  const plan = planRenders(inv, { adapter: 'claude-design', width: 'phone' });
  assert.deepEqual(plan.map((p) => p.action), ['render', 'skip']);
  assert.match(plan[1].why, /"design": \{ "phone": "A-02" \}/);
  assert.deepEqual(planRenders(inv, { adapter: 'claude-design' }).map((p) => p.action), ['render', 'shot']);
});

// ---- Shoot ----

test('item selection: an id picks every width, id@phone one width, and ! leaves items out', () => {
  const m = phoneMap();
  const keys = (picks) => selectStates(m, picks).items.map((i) => i.key);
  assert.deepEqual(keys([]), ['KC-05', 'KC-05@phone', 'KC-04', 'KC-04@phone', 'KC-08', 'KC-08@phone', 'KC-20@phone']);
  assert.deepEqual(keys(['KC-05@phone']), ['KC-05@phone']);
  assert.deepEqual(keys(['KC-05']), ['KC-05', 'KC-05@phone']);
  assert.deepEqual(keys(['KC-05@desktop']), ['KC-05']);
  assert.deepEqual(keys(['!KC-05@phone']), ['KC-05', 'KC-04', 'KC-04@phone', 'KC-08', 'KC-08@phone', 'KC-20@phone']);
  assert.deepEqual(keys(['KC-05', 'KC-04', '!KC-04@phone']), ['KC-05', 'KC-05@phone', 'KC-04']);
  assert.deepEqual(selectStates(m, ['KC-20@desktop', 'KC-05@tablet']).unknown, ['KC-20@desktop', 'KC-05@tablet']);
  assert.deepEqual(selectStates(sampleMap(), ['KC-05@phone']).unknown, ['KC-05@phone']);
});

test('capture order: every width reads before any width writes, one context per width', () => {
  const m = phoneMap();
  m.states.push({ id: 'KC-06', screen: 'To check', name: 'Member', reach: { world: 'design', role: 'member', steps: [{ goto: '/dashboard/knowledge' }] } });
  const order = captureOrder(selectStates(m).items, m);
  assert.deepEqual(order.map((e) => `${e.world}/${e.role}@${e.width}: ${e.items.map((i) => i.key).join(' ')}`), [
    'design/member@desktop: KC-06',
    'design/member@phone: KC-06@phone',
    'design/admin@desktop: KC-05 KC-04',
    'design/admin@phone: KC-05@phone KC-04@phone KC-20@phone KC-08@phone',
    'design/admin@desktop: KC-08',
  ]);
  assert.deepEqual(order[3].writes, ['KC-08@phone']);
  assert.deepEqual(order[4].writes, ['KC-08']);
});

test('writing is judged by the steps of the width: reach.phone can save where the desktop does not', () => {
  const m = phoneMap();
  const s = m.states[1];
  assert.equal(writesData(s, m, 'desktop'), false);
  s.reach.phone.steps.push({ click: { testid: 'kb-asked-save-0' } });
  assert.equal(writesData(s, m, 'phone'), true);
  assert.equal(writesData(s, m, 'desktop'), false);
});

test('the phone is its own touch context at 390 x 844', () => {
  assert.deepEqual(contextOptions('phone'), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.deepEqual(contextOptions('desktop'), { viewport: { width: 1440, height: 900 } });
});

test('buttons hidden on a phone, and phone-only buttons, are expected by width; a leak says which width', () => {
  const hiddenOnPhone = { phone: 'hidden' };
  const phoneOnly = { phone: 'shown' };
  assert.deepEqual(buttonExpectation(hiddenOnPhone, 'admin', 'phone'), { shouldBe: 'hidden', hiddenAt: 'phone' });
  assert.deepEqual(buttonExpectation(hiddenOnPhone, 'admin', 'desktop'), { shouldBe: 'shown' });
  assert.deepEqual(buttonExpectation(phoneOnly, 'admin', 'desktop'), { shouldBe: 'hidden', hiddenAt: 'desktop' });
  assert.deepEqual(buttonExpectation(phoneOnly, 'admin', 'phone'), { shouldBe: 'shown' });
  assert.deepEqual(buttonExpectation({ member: 'hidden' }, 'member', 'phone'), { shouldBe: 'hidden' });
  const line = resultLine('KC-05@phone', { width: 'phone', reached: true, problems: ['the page scrolls sideways by 12 px'], buttons: [
    { label: 'Read my website', onPage: true, shouldBe: 'hidden', hiddenAt: 'phone' },
    { label: 'Menu', onPage: false, shouldBe: 'shown' },
  ] });
  assert.equal(line, 'KC-05@phone reached · missing: Menu · shown at phone width: Read my website · the page scrolls sideways by 12 px');
});

test('the sideways-scroll check: more than one pixel wider than the window is a problem', () => {
  assert.equal(overflowProblem(390, 390), null);
  assert.equal(overflowProblem(391, 390), null);
  assert.deepEqual(overflowProblem(402, 390), { by: 12, problem: 'the page scrolls sideways by 12 px' });
});

// ---- Review ----

const PHONE_REVIEW = `3 items match, 2 have problems.

## KC-05@phone
- must fix: the tabs wrap onto three lines; the phone design scrolls them in one row.

## KC-04@desktop (menu)
- small: the divider is lighter than the design.

## KC-04@phone
- small: the menu sits under the header.

## Matching
KC-05, KC-08, KC-08@phone
`;

test('a review parses ## <ID>@phone headings, reads @desktop as the state id, and ignores items the map lacks', () => {
  const keys = mapItems(phoneMap()).map((i) => i.key);
  const r = parseReview(PHONE_REVIEW, keys);
  assert.deepEqual(Object.keys(r), ['KC-05@phone', 'KC-04', 'KC-04@phone']);
  assert.deepEqual(r['KC-05@phone'].must, ['the tabs wrap onto three lines; the phone design scrolls them in one row.']);
  assert.deepEqual(r['KC-04'].small, ['the divider is lighter than the design.']);
  assert.deepEqual(Object.keys(parseReview(PHONE_REVIEW)), ['KC-05@phone', 'KC-04', 'KC-04@phone']);
  // A desktop-only map has no phone items: a phone section is not filed under the desktop state.
  assert.deepEqual(Object.keys(parseReview(PHONE_REVIEW, mapItems(sampleMap()).map((i) => i.key))), ['KC-04']);
});

function phoneShoot() {
  return { states: {
    'KC-05': { reached: true }, 'KC-05@phone': { reached: true, overflow: 12, problems: ['the page scrolls sideways by 12 px'] },
    'KC-04': { reached: true }, 'KC-04@phone': { reached: true },
    'KC-08': { reached: true }, 'KC-08@phone': { reached: true, overflow: 30 },
    'KC-20@phone': { reached: false },
  } };
}

test('summarise gives every item a verdict, and the shoot\'s sideways scroll is a must fix', () => {
  const m = phoneMap();
  const s = summarise({ map: m, shoot: phoneShoot(), notes: parseReview(PHONE_REVIEW, mapItems(m).map((i) => i.key)) });
  assert.deepEqual(Object.keys(s.states), ['KC-05', 'KC-05@phone', 'KC-04', 'KC-04@phone', 'KC-08', 'KC-08@phone', 'KC-01', 'KC-01@phone', 'KC-20@phone']);
  assert.equal(s.states['KC-05'].verdict, 'match');
  // The reviewer's note is not about sideways scroll, so the shoot's is added next to it.
  assert.equal(s.states['KC-05@phone'].must.length, 2);
  assert.equal(s.states['KC-08@phone'].verdict, 'must');
  assert.deepEqual(s.states['KC-08@phone'].must, ['the page scrolls sideways by 30 px (found by the shoot)']);
  assert.equal(s.states['KC-20@phone'].verdict, 'not-reached');
  assert.deepEqual(s.counts, { match: 2, small: 2, must: 2, notReached: 1, testOnly: 2 });
});

test('the comparison page shows each state with a row per width, and tallies items', () => {
  const m = phoneMap();
  const summary = summarise({ map: m, shoot: phoneShoot(), notes: parseReview(PHONE_REVIEW, mapItems(m).map((i) => i.key)) });
  const html = renderCompare({ title: 'Knowledge: round 2', round: 2, beforeRound: 1, map: m, summary,
    pictures: (key) => ({ design: roundFiles(key).design, before: `before/${roundFiles(key).live}`, now: roundFiles(key).live }) });
  const cardOf = (id) => { const at = html.indexOf(`id="${id}"`); return html.slice(html.lastIndexOf('<article', at), html.indexOf('</article>', at)); };
  const card = cardOf('KC-05');
  assert.match(card, /data-verdict="must"/);
  assert.match(card, /<span class="pill match">Desktop: matches<\/span><span class="pill must">Phone: 2 to fix<\/span>/);
  assert.match(card, /<section class="width desktop" aria-label="Desktop">/);
  assert.match(card, /<section class="width phone" aria-label="Phone">/);
  assert.match(card, /src="KC-05@phone.live.png"/);
  assert.match(card, /src="before\/KC-05@phone.live.png"/);
  assert.match(card, /src="KC-05@phone.design.png"/);
  const phoneOnly = cardOf('KC-20');
  assert.doesNotMatch(phoneOnly, /width desktop/);
  assert.match(html, /<li><b>2<\/b>match<\/li><li><b>2<\/b>small differences only<\/li><li><b>2<\/b>to fix<\/li><li><b>1<\/b>not reached<\/li><li><b>2<\/b>unit tests only<\/li>/);
  assert.match(html, /Each designed state, at each width it is checked at:/);
});

// ---- Readiness and status by item ----

function tmpRun() {
  const root = mkdtempSync(join(tmpdir(), 'delivery-widths-'));
  const runDir = join(root, '.delivery', 'f');
  const paths = { runDir, deliveryDir: join(root, 'docs', 'delivery', 'f'), designRenders: join(runDir, 'design'), seedplan: join(runDir, 'seedplan.json') };
  mkdirSync(paths.deliveryDir, { recursive: true });
  const round = (n, states) => {
    const dir = join(runDir, 'rounds', String(n));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'shoot.json'), JSON.stringify({ states: {} }));
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ states: Object.fromEntries(Object.entries(states).map(([k, verdict]) => [k, { verdict }])) }));
  };
  return { root, paths, round, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('latestVerdicts and pictureReadiness key and count by item', () => {
  const r = tmpRun();
  try {
    r.round(1, { 'KC-05': 'must', 'KC-05@phone': 'must', 'KC-04': 'match', 'KC-04@phone': 'must' });
    r.round(2, { 'KC-05': 'match', 'KC-05@phone': 'not-shot', 'KC-04': 'match', 'KC-04@phone': 'small' });
    const latest = latestVerdicts(r.paths);
    assert.deepEqual([...latest.keys()].sort(), ['KC-04', 'KC-04@phone', 'KC-05', 'KC-05@phone']);
    assert.deepEqual(latest.get('KC-05@phone'), { verdict: 'must', round: 1 });
    assert.deepEqual(latest.get('KC-04@phone'), { verdict: 'small', round: 2 });
    const red = pictureReadiness(r.paths);
    assert.equal(red.ok, false);
    assert.match(red.detail, /^1 item\(s\) still to fix and 1 fix round\(s\) left: KC-05@phone \(round 1\)/);
    r.round(3, { 'KC-05@phone': 'match' });
    const green = pictureReadiness(r.paths);
    assert.equal(green.ok, true);
    assert.equal(green.detail, '4 item(s): 3 match, 1 small differences, every pictured item reached');
  } finally { r.cleanup(); }
});

test('status asks for the phone render when the map checks a responsive phone and none exists', () => {
  const m = phoneMap();
  assert.equal(phoneRenderOwed(m, new Set(desktopPictures)), true);
  assert.equal(phoneRenderOwed(m, designed), false);
  assert.equal(phoneRenderOwed(sampleMap(), new Set(desktopPictures)), false);
  const onlyFrames = phoneMap();
  onlyFrames.states = onlyFrames.states.filter((s) => s.id === 'KC-08');
  assert.equal(phoneRenderOwed(onlyFrames, new Set(desktopPictures)), false);
  const next = pictureNext({ designed: 5, hasMap: true, mapError: null, problemCount: 0, checklistStale: false, seedStale: false, rounds: [], phoneRenderOwed: true }, { cli: 'delivery' });
  assert.equal(next.step, 'pictures');
  assert.match(next.text, /delivery design render --width phone, then delivery map/);
});

// ---- The regression: a desktop-only map is exactly 0.4.5 ----

test('a desktop-only map keeps 0.4.5\'s file names, design sources, review keys and verdicts', () => {
  const m = sampleMap();
  const items = mapItems(m);
  // 0.4.5 named round pictures <ID>.live.png and <ID>.design.png, and cropped design/<ID>.png.
  assert.deepEqual(items.flatMap((i) => Object.values(roundFiles(i.key))),
    ['KC-05.live.png', 'KC-05.design.png', 'KC-04.live.png', 'KC-04.design.png', 'KC-08.live.png', 'KC-08.design.png', 'KC-01.live.png', 'KC-01.design.png']);
  assert.deepEqual(items.flatMap((i) => designFileCandidates(i.state, i.width)), ['KC-05.png', 'KC-04.png', 'KC-08.png', 'KC-01.png']);
  assert.deepEqual(items.map((i) => renderFileName(i.id, i.width, 'png')), ['KC-05.png', 'KC-04.png', 'KC-08.png', 'KC-01.png']);
  assert.deepEqual(selectStates(m).items.map((i) => i.key), ['KC-05', 'KC-04', 'KC-08']);
  assert.deepEqual(captureOrder(selectStates(m).items, m).map((e) => [e.width, e.items.map((i) => i.key), e.writes]),
    [['desktop', ['KC-05', 'KC-04', 'KC-08'], ['KC-08']]]);
  // review.json from 0.4.5 for the same notes and shoot, captured before the change.
  const review = `## KC-05\n- must fix: a\n- small: b\n\n## KC-04\n- small: c\n`;
  const shoot = { states: { 'KC-05': { reached: true }, 'KC-04': { reached: true }, 'KC-08': { reached: false } } };
  const s = summarise({ map: m, shoot, notes: parseReview(review, items.map((i) => i.key)) });
  assert.deepEqual(s, {
    states: {
      'KC-05': { verdict: 'must', must: ['a'], small: ['b'] },
      'KC-04': { verdict: 'small', must: [], small: ['c'] },
      'KC-08': { verdict: 'not-reached', must: [], small: [] },
      'KC-01': { verdict: 'test-only', must: [], small: [] },
    },
    counts: { match: 0, small: 1, must: 1, notReached: 1, testOnly: 1 },
  });
  // The checklist and the comparison page gain nothing at one width.
  assert.doesNotMatch(renderChecklist(m), /Widths|phone/i);
  const html = renderCompare({ title: 't', round: 1, beforeRound: null, map: m, summary: s, pictures: (k) => ({ design: roundFiles(k).design, before: null, now: roundFiles(k).live }) });
  assert.doesNotMatch(html, /class="width|Desktop:|at each width/);
  assert.match(html, /<span class="pill must">1 to fix<\/span><\/header>\n  <div class="trio">/);
});

test('a desktop-only run reads state(s), not item(s), in readiness', () => {
  const r = tmpRun();
  try {
    r.round(1, { 'KC-05': 'match', 'KC-04': 'small' });
    assert.equal(pictureReadiness(r.paths).detail, '2 state(s): 1 match, 1 small differences, every pictured state reached');
  } finally { r.cleanup(); }
});

test('a phone tab bar fixed along the bottom is shared navigation, hidden before the picture', async () => {
  const { isBottomBar } = await import('../../lib/picture/shoot.mjs');
  assert.equal(isBottomBar({ bottom: 844, width: 390, height: 64 }, 390, 844), true);
  assert.equal(isBottomBar({ bottom: 844, width: 200, height: 64 }, 390, 844), false, 'a floating button is not a bar');
  assert.equal(isBottomBar({ bottom: 700, width: 390, height: 64 }, 390, 844), false, 'not at the bottom');
  assert.equal(isBottomBar({ bottom: 844, width: 390, height: 600 }, 390, 844), false, 'a full-height panel is not a bar');
});
