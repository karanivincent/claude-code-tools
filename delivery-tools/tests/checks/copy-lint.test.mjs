// M7's element lint on synthetic twins of the real leaks (spec 20.2), and the element model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCopyLinter, lintCopy, dateShapeRe, M7_RULES } from '../../lib/checks/copy-lint.mjs';
import { parseElements, elementLocation, parityForm, isPhoneShaped } from '../../lib/checks/text.mjs';
import { loadFixture } from '../helpers/fixtures.mjs';

const FIX = loadFixture('checks/m7-elements.json');
const lint = makeCopyLinter({ locale: 'en', ...FIX.profile });

/** Whether a hit's span overlaps the expected substring's span in the text. */
function covers(text, hits, match) {
  const s = text.indexOf(match);
  assert.ok(s >= 0, `fixture: "${match}" is not in "${text}"`);
  return hits.some((h) => h.index < s + match.length && h.index + h.match.length > s);
}

test('every synthetic leak is flagged by the right rule, covering the offending text', () => {
  for (const f of FIX.mustFlag) {
    const hits = lint(f.text);
    const rules = hits.map((h) => h.rule);
    assert.ok(hits.length, `not flagged: ${f.text}`);
    assert.ok(f.rules.some((r) => rules.includes(r)), `${f.text}: rules ${rules.join(', ')}, want one of ${f.rules.join(', ')}`);
    for (const r of f.notRules ?? []) assert.ok(!rules.includes(r), `${f.text}: must not be flagged as ${r}`);
    for (const m of f.matches) assert.ok(covers(f.text, hits, m), `${f.text}: no hit covers "${m}" (${JSON.stringify(hits)})`);
  }
});

test('nothing on the must-not-flag list is flagged', () => {
  for (const f of FIX.mustNotFlag) assert.deepEqual(lint(f.text), [], `${f.text} (${f.why})`);
});

test('every rule has a severity from spec 8.1: leaks, ids, keys, notes, banned words P1; dates, spacing, plurals P2', () => {
  const p1 = ['leak-preposition-punctuation', 'leak-empty-quotes', 'leak-dash-in-sentence', 'leak-token', 'uuid', 'message-key', 'developer-phrase', 'banned-word'];
  for (const r of p1) assert.equal(M7_RULES[r].severity, 'P1', r);
  for (const r of ['numeric-date', 'spacing', 'count-one-plural']) assert.equal(M7_RULES[r].severity, 'P2', r);
});

test('word lists come from the options only: nothing is banned or a developer phrase by default', () => {
  const bare = makeCopyLinter({ locale: 'en' });
  assert.deepEqual(bare('Approved'), []);
  assert.deepEqual(bare('Loopback'), []);
  assert.deepEqual(bare('TODO: later'), []);
  assert.deepEqual(makeCopyLinter({ locale: 'en', bannedWords: ['widget*'] })('Two widgetry parts').map((h) => h.rule), ['banned-word']);
});

test('banned words are per locale, whole words, any case', () => {
  const fr = makeCopyLinter({ locale: 'fr', bannedWords: ['approuver'] });
  assert.deepEqual(fr('Approuver la version').map((h) => h.rule), ['banned-word']);
  assert.deepEqual(fr('désapprouver'), []);
});

test('French typography: a space before : ; ! ? is correct; before . and , it is not', () => {
  const fr = makeCopyLinter({ locale: 'fr' });
  assert.deepEqual(fr('Attention : la version a changé !'), []);
  assert.deepEqual(fr('Commandes du jour .').map((h) => h.rule), ['spacing']);
  assert.deepEqual(fr('Aucun appel sur .').map((h) => h.rule), ['leak-preposition-punctuation']);
  const en = makeCopyLinter({ locale: 'en' });
  assert.deepEqual(en('Attention : read this').map((h) => h.rule), ['spacing']);
});

test('the date shape comes from the profile: a numeric date is fine when the shape is numeric', () => {
  assert.ok(dateShapeRe('D Mon').test('17 Sep'));
  assert.ok(!dateShapeRe('D Mon').test('8/31/2026'));
  assert.deepEqual(lintCopy('Due 31/08/2026', { locale: 'en', dateShape: 'DD/MM/YYYY' }), []);
  assert.deepEqual(lintCopy('Due 31/08/2026', { locale: 'en', dateShape: 'D Mon' }).map((h) => h.rule), ['numeric-date']);
});

test('message keys: with the namespaces known, only a key under one of them is flagged', () => {
  const withNs = makeCopyLinter({ locale: 'en', namespaces: ['widgets'] });
  assert.deepEqual(withNs('widgets.list.title').map((h) => h.rule), ['message-key']);
  assert.deepEqual(withNs('gadgets.list.title'), []);
  assert.deepEqual(lint('app.example.com'), []);
});

test('a leak and a spacing typo at the same spot are one problem, the leak', () => {
  assert.deepEqual(lint('No orders yet on .').map((h) => h.rule), ['leak-preposition-punctuation']);
});

test('the element model: one element per line, table cells split on tabs, empty ones skipped', () => {
  const els = parseElements('Title\n\nName\tCalls\tStatus\nAcme\t\t—\n  trailing  \r\n');
  assert.deepEqual(els, [
    { line: 1, cell: null, text: 'Title' },
    { line: 3, cell: 0, text: 'Name' }, { line: 3, cell: 1, text: 'Calls' }, { line: 3, cell: 2, text: 'Status' },
    { line: 4, cell: 0, text: 'Acme' }, { line: 4, cell: 2, text: '—' },
    { line: 5, cell: null, text: 'trailing' },
  ]);
  assert.equal(elementLocation(els[0]), '1');
  assert.equal(elementLocation(els[5]), '4#2');
});

test('parity form: dates keep their shape, so a numeric date never matches a designed "17 Sep"', () => {
  assert.equal(parityForm('Live since 17 Sep'), parityForm('Live since 3 Sep'));
  assert.notEqual(parityForm('Live since 17 Sep'), parityForm('Live since 8/31/2026'));
  assert.equal(parityForm('started 8:00 am'), parityForm('started 10:40 AM'));
  assert.equal(parityForm('Today’s round'), parityForm("today's round"));
  assert.equal(parityForm('Rings +1 555 010 0199'), parityForm('Rings +1 555 010 0123'));
  assert.equal(parityForm('Rings 0712•••123'), 'rings phone');
  assert.equal(parityForm('294 orders'), '294 orders');
  assert.ok(isPhoneShaped('+15550100001'));
  assert.ok(!isPhoneShaped('1 250'));
});
