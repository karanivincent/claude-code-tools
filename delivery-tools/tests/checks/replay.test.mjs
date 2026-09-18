// Replay of M7, M8 and M3 on the real artefacts of an earlier build (spec 20.2). The set is private
// and never enters this repository: these tests run only when DELIVERY_REPLAY_DIR points at it.
// Every expectation is read from the set's expected/*.json; nothing here names the project.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { replayTest } from '../helpers/replay.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { makeCopyLinter } from '../../lib/checks/copy-lint.mjs';
import { parseElements, elementLocation } from '../../lib/checks/text.mjs';
import { lintMessages } from '../../lib/checks/message-lint.mjs';
import { flattenMessages } from '../../lib/checks/icu.mjs';
import { runChecks } from '../../lib/checks/index.mjs';
import { validateCaptureItems } from '../../lib/capture/validate.mjs';
import { makeRun, planWith, row } from './helpers.mjs';

const readJson = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));

/** live/<ID>.txt or live/<ID>@<width>.txt as a capture item. */
function liveItems(dir) {
  return readdirSync(join(dir, 'live')).filter((f) => f.endsWith('.txt')).sort().map((f) => {
    const m = /^([A-Z]{1,6}-\d{2,3})(?:@(\d+))?\.txt$/.exec(f);
    return { file: `live/${f}`, state: m[1], width: m[2] ? Number(m[2]) : 1440, txt: readFileSync(join(dir, 'live', f), 'utf8') };
  });
}

function replayProfile(m7) {
  const p = makeProfile();
  return { ...p, audit: { ...p.audit, bannedWords: { en: m7.profileLists.bannedWordsEn }, developerPhrases: m7.profileLists.developerPhrases, dateShape: 'D Mon' } };
}

replayTest('M7 flags every must-flag element with the right rule and none of the must-not-flag ones (pure lint)', { needs: ['expected/m7.json', 'live'] }, (t, dir) => {
  const m7 = readJson(dir, 'expected/m7.json');
  const lint = makeCopyLinter({ locale: 'en', bannedWords: m7.profileLists.bannedWordsEn, developerPhrases: m7.profileLists.developerPhrases, dateShape: 'D Mon' });
  let flagged = 0, clean = 0;
  for (const [file, spec] of Object.entries(m7.files)) {
    const els = parseElements(readFileSync(join(dir, file), 'utf8'));
    const at = (line, cell) => els.find((e) => e.line === line && e.cell === (cell ?? null));
    for (const f of spec.mustFlag ?? []) {
      const el = at(f.line, f.cell);
      assert.ok(el, `${file}:${f.line} has no such element`);
      const hits = lint(el.text);
      const rules = hits.map((h) => h.rule);
      assert.ok(hits.length, `${file}:${f.line} not flagged: ${el.text}`);
      if (f.ruleHints) assert.ok(f.ruleHints.some((r) => rules.includes(r)), `${file}:${f.line} rules ${rules} not in ${f.ruleHints}`);
      for (const r of f.notRuleHints ?? []) assert.ok(!rules.includes(r), `${file}:${f.line} flagged as ${r}`);
      for (const m of f.matches) {
        const s = el.text.indexOf(m);
        assert.ok(hits.some((h) => h.index < s + m.length && h.index + h.match.length > s), `${file}:${f.line}: nothing covers ${m}`);
      }
      flagged++;
    }
    for (const f of spec.mustNotFlag ?? []) {
      const el = at(f.line, f.cell);
      assert.ok(el, `${file}:${f.line} has no such element`);
      assert.deepEqual(lint(el.text), [], `${file}:${f.line}${f.cell !== undefined ? `#${f.cell}` : ''} flagged: ${el.text}`);
      clean++;
    }
  }
  for (const s of m7.synthetic?.mustNotFlag ?? []) { assert.deepEqual(lint(s.text), [], s.text); clean++; }
  for (const n of m7.specNamed) assert.ok(n.at.length, n.match);
  assert.ok(flagged > 50 && clean > 250, `${flagged} flagged, ${clean} clean`);
});

replayTest('M7 through the check: every must-flag element becomes a finding on its state, no must-not-flag one does', { needs: ['expected/m7.json', 'live'] }, async (t, dir) => {
  const m7 = readJson(dir, 'expected/m7.json');
  const items = liveItems(dir);
  const run = await makeRun({ profile: replayProfile(m7), captures: [{ runId: 'c-replay', mode: 'full', items: items.map((i) => ({ state: i.state, width: i.width, txt: i.txt })) }] });
  try {
    const res = await runChecks(run.ctx, ['M7'], { captureRunId: 'c-replay', record: false });
    // Resolve each finding to its element's text: rules by (state, text).
    const byKey = new Map();
    for (const f of res.findings) {
      const [file, loc] = f.where.split(':');
      const [line, cell] = loc.split('#').map(Number);
      const el = parseElements(readFileSync(join(run.paths.captureDir('c-replay'), file), 'utf8')).find((e) => e.line === line && e.cell === (Number.isNaN(cell) || cell === undefined ? null : cell));
      const k = `${f.state}|${el.text}`;
      byKey.set(k, [...(byKey.get(k) ?? []), f.rule]);
    }
    for (const [file, spec] of Object.entries(m7.files)) {
      const state = /live\/([A-Z]{1,6}-\d{2,3})/.exec(file)[1];
      const els = parseElements(readFileSync(join(dir, file), 'utf8'));
      const text = (line, cell) => els.find((e) => e.line === line && e.cell === (cell ?? null)).text;
      for (const f of spec.mustFlag ?? []) {
        const rules = byKey.get(`${state}|${text(f.line, f.cell)}`) ?? [];
        assert.ok(rules.length, `${file}:${f.line} has no finding`);
        if (f.ruleHints) assert.ok(f.ruleHints.some((r) => rules.includes(r)), `${file}:${f.line}: ${rules}`);
        for (const r of f.notRuleHints ?? []) assert.ok(!rules.includes(r), `${file}:${f.line}: ${r}`);
      }
      for (const f of spec.mustNotFlag ?? []) assert.equal(byKey.get(`${state}|${text(f.line, f.cell)}`), undefined, `${file}:${f.line}${f.cell !== undefined ? `#${f.cell}` : ''}`);
    }
    const sev = (rule) => [...new Set(res.findings.filter((f) => f.rule === rule).map((f) => f.severity))];
    assert.deepEqual(sev('uuid'), ['P1']);
    assert.deepEqual(sev('numeric-date'), ['P2']);
  } finally { run.cleanup(); }
});

function messageFiles(dir, m8) {
  const refs = readJson(dir, 'refs.json');
  return refs.messageFiles.map(({ locale, file }) => ({
    locale, file,
    messages: JSON.parse(execFileSync('git', ['show', `${m8.sha}:${file}`], { cwd: refs.repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })),
  }));
}

replayTest('M8 reproduces expected/m8.json: the {count} keys outside a plural, exactly, per locale, and tryMore\'s {n}', { needs: ['expected/m8.json', 'refs.json'] }, async (t, dir) => {
  const m8 = readJson(dir, 'expected/m8.json');
  const locales = messageFiles(dir, m8);
  const primary = locales.find((l) => l.locale === 'en');
  const root = m8.found.en.keys[0].split('.')[0];
  const keys = flattenMessages(primary.messages[root], root).filter(([, v]) => typeof v === 'string').map(([k]) => k);
  const hits = lintMessages({ locales, primary: 'en', keys });
  for (const l of locales) {
    const count = hits.filter((h) => h.locale === l.locale && h.rule === 'count-outside-plural' && h.placeholder === 'count').map((h) => h.key).sort();
    assert.deepEqual(count, [...m8.found[l.locale].keys].sort(), l.locale);
    assert.equal(count.length, m8.spec.expectedPerLocale);
    const n = hits.filter((h) => h.locale === l.locale && h.rule === 'count-outside-plural' && h.placeholder === 'n').map((h) => h.key);
    assert.ok(n.includes(m8.mustFlag.n.key), `${l.locale}: ${m8.mustFlag.n.key} not flagged`);
    for (const k of n) assert.ok(k === m8.mustFlag.n.key || m8.notAsserted.otherNOutsidePlural.includes(k), `${l.locale}: unexpected {n} key ${k}`);
    assert.ok(hits.filter((h) => h.locale === l.locale && h.rule === 'count-outside-plural').every((h) => h.severity === 'P1'));
  }

  // The same through the check, from files on disk and a plan that names every key.
  const profile = makeProfile();
  profile.paths = { ...profile.paths, messages: locales.map((l) => ({ locale: l.locale, file: `messages/${l.locale}.json` })) };
  const files = Object.fromEntries(locales.map((l) => [`messages/${l.locale}.json`, JSON.stringify(l.messages)]));
  const plan = planWith([row('AA-01', { copy: keys.map((key) => ({ key, en: 'x', plural: false })) })]);
  const run = await makeRun({ profile, plan, files });
  try {
    const res = await runChecks(run.ctx, ['M8'], { record: false });
    for (const l of locales) {
      const got = res.findings.filter((f) => f.rule === 'count-outside-plural' && f.where.startsWith(`messages/${l.locale}.json#`) && f.where.endsWith(':{count}'))
        .map((f) => f.where.slice(`messages/${l.locale}.json#`.length, -':{count}'.length)).sort();
      assert.deepEqual(got, [...m8.found[l.locale].keys].sort(), l.locale);
    }
  } finally { run.cleanup(); }
});

replayTest('M3 refuses every capture expected/m3.json names: a state missing its markers and two identical to a sibling', { needs: ['expected/m3.json', 'live'] }, async (t, dir) => {
  const m3 = readJson(dir, 'expected/m3.json');
  const items = liveItems(dir);
  const markers = new Map(m3.mustRefuse.map((r) => [r.state, { text: r.requiredText.map((x) => x.product), testids: [], forbidden: r.forbiddenText.map((x) => x.text) }]));
  const states = [...new Set(items.map((i) => i.state))];
  const plan = planWith(states.map((s) => row(s, { markers: markers.get(s) ?? { text: [], testids: [], forbidden: [] } })), { worlds: [{ id: 'org', kind: 'design', orgName: 'Delivery fixture · replay', users: [{ role: 'admin', email: 'delivery+replay-admin@example.invalid' }], notes: '' }] });
  for (const r of plan.rows) r.reach.world = 'org';
  const run = await makeRun({ plan, captures: [{ runId: 'c-replay', mode: 'full', items: items.map((i) => ({ state: i.state, world: 'org', width: i.width, txt: i.txt })) }] });
  try {
    const verdicts = await validateCaptureItems(run.ctx, 'c-replay');
    const res = await runChecks(run.ctx, ['M3'], { captureRunId: 'c-replay', record: false });
    for (const r of m3.mustRefuse) {
      const f = res.findings.find((x) => x.state === r.state && x.rule === 'not-reached');
      assert.ok(f, `${r.state} was not refused`);
      assert.equal(f.severity, 'P1');
      const v = verdicts.find((x) => x.state === r.state && x.width === 1440);
      assert.equal(v.status, 'not-reached');
      if (r.reasons.includes('required-marker-missing')) assert.match(v.why, /missing marker/, r.state);
      if (r.reasons.includes('forbidden-marker-present')) assert.match(v.why, /forbidden marker/, r.state);
      if (r.reasons.includes('identical-text')) for (const i of r.identicalTo) assert.match(v.why, new RegExp(`identical text to [^;]*${i.state}`), r.state);
    }
  } finally { run.cleanup(); }
});
