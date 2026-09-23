// The ICU parser and M8's message-file lint, on synthetic message files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcu, icuArguments, hasPlural, icuLiteralText, flattenMessages, IcuSyntaxError } from '../../lib/checks/icu.mjs';
import { lintMessages, isCountName, M8_RULES } from '../../lib/checks/message-lint.mjs';

const args = (m) => icuArguments(parseIcu(m)).map((a) => `${a.name}:${a.type}:${a.inPlural ? 'P' : '-'}${a.inSelect ? 'S' : '-'}`);

test('ICU: arguments, types, and whether each sits inside a plural or a select', () => {
  assert.deepEqual(args('{count} today'), ['count:simple:--']);
  assert.deepEqual(args('{count, number} orders'), ['count:number:--']);
  assert.deepEqual(args('{count, plural, one {# order} other {{count} orders on {day}}}'), ['count:plural:--', 'count:simple:P-', 'day:simple:P-']);
  assert.deepEqual(args('{kind, select, a {{count} a} other {{count} b}}'), ['kind:select:--', 'count:simple:-S', 'count:simple:-S']);
  assert.deepEqual(args('{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} try'), ['n:selectordinal:--']);
  assert.deepEqual(args('<b>{count}</b> orders'), ['count:simple:--']);
  assert.deepEqual(args("It''s '{literal}' here"), []);
  assert.deepEqual(args('{when, date, ::yyyyMMMd} at {when, time, short}'), ['when:date:--', 'when:time:--']);
  assert.ok(hasPlural(parseIcu('{n, plural, offset:1 =0 {none} other {# more}}')));
  assert.ok(!hasPlural(parseIcu('{n} more')));
});

test('ICU: apostrophes quote only before syntax, "#" is literal outside a plural', () => {
  assert.equal(icuLiteralText(parseIcu("It''s done")), "It's done");
  assert.equal(icuLiteralText(parseIcu("Use '{braces}' like '#' this")), "Use {braces} like '#' this");
  assert.equal(icuLiteralText(parseIcu('Item #3')), 'Item #3');
});

test('ICU: malformed messages are syntax errors', () => {
  for (const bad of ['{count', '{count, plural, one {x}}', 'a } b', '{count, plural, one {x} other {y}', '<b>bold', '{, number}', '{n, plural}']) {
    assert.throws(() => parseIcu(bad), IcuSyntaxError, bad);
  }
});

test('flattenMessages walks nested objects into dotted keys', () => {
  assert.deepEqual(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' }), [['a.b', 'x'], ['a.c.d', 'y'], ['e', 'z']]);
});

test('count names: count, n, and names ending in Count', () => {
  for (const n of ['count', 'n', 'callCount', 'order_count']) assert.ok(isCountName(n), n);
  for (const n of ['minutes', 'used', 'cap', 'counter', 'name', 'Count']) assert.ok(!isCountName(n), n);
});

const EN = {
  widgets: {
    list: { todayCount: '{count} today', total: '{count, plural, one {# order} other {# orders}}', selectOnly: '{kind, select, a {{count} orders} other {{count} items}}' },
    retry: { tryMore: 'Try {n} more times, {minutes} minutes apart.' },
    formatted: '{count, number} orders',
    nested: '<b>{count}</b> orders',
    pluralMarked: 'Orders: {when}',
    brand: 'Acme',
    minutes: '{count, plural, other {# minutes}}',
    quote: "It''s '{literal}' here",
  },
  other: { untouched: '{count} things' },
};
const FR = {
  widgets: {
    list: { todayCount: "{count} aujourd'hui", total: '{count, plural, one {# commande} other {# commandes}}', selectOnly: '{kind, select, a {{count} commandes} other {{count} articles}}' },
    retry: { tryMore: '{n} essais de plus, à {minutes} minutes d’intervalle.' },
    formatted: '{count, number} commandes',
    nested: '<b>{count}</b> commandes',
    pluralMarked: 'Approuver : {when}',
    brand: 'Acme',
    minutes: '{count, plural, other {# minutes}}',
    extraOnly: 'orpheline',
  },
};

test('M8 flags every count outside a plural, in every locale, and nothing inside one', () => {
  const keys = flattenMessages(EN.widgets, 'widgets').map(([k]) => k);
  const hits = lintMessages({ locales: [{ locale: 'en', file: 'm/en.json', messages: EN }, { locale: 'fr', file: 'm/fr.json', messages: FR }], primary: 'en', keys });
  const counts = (locale) => hits.filter((h) => h.locale === locale && h.rule === 'count-outside-plural').map((h) => `${h.key}:${h.placeholder}`).sort();
  const want = ['widgets.formatted:count', 'widgets.list.selectOnly:count', 'widgets.list.todayCount:count', 'widgets.nested:count', 'widgets.retry.tryMore:n'];
  assert.deepEqual(counts('en'), want);
  assert.deepEqual(counts('fr'), want);
  assert.ok(hits.every((h) => h.key.startsWith('widgets.')), 'only the keys asked for');
});

test('M8: missing keys, extra keys, plural-marked keys, banned words, identical translations', () => {
  const keys = flattenMessages(EN.widgets, 'widgets').map(([k]) => k);
  const hits = lintMessages({
    locales: [{ locale: 'en', file: 'm/en.json', messages: EN }, { locale: 'fr', file: 'm/fr.json', messages: FR }],
    primary: 'en', keys, pluralKeys: ['widgets.pluralMarked'],
    bannedWords: { fr: ['approuver'] }, sameAsPrimaryOk: ['Acme'],
  });
  const by = (rule) => hits.filter((h) => h.rule === rule).map((h) => `${h.locale}:${h.key}`).sort();
  assert.deepEqual(by('missing-key'), ['fr:widgets.quote']);
  assert.deepEqual(by('extra-key'), ['fr:widgets.extraOnly']);
  assert.deepEqual(by('plural-missing'), ['en:widgets.pluralMarked', 'fr:widgets.pluralMarked']);
  assert.deepEqual(by('banned-word'), ['fr:widgets.pluralMarked']);
  assert.deepEqual(by('identical-to-primary'), ['fr:widgets.minutes'], 'Acme is allowlisted; "minutes" is not');
  assert.equal(M8_RULES['missing-key'], 'P1');
  assert.equal(M8_RULES['count-outside-plural'], 'P1');
  assert.equal(M8_RULES['identical-to-primary'], 'P3');
});

test('M8: a message that does not parse is P1, and its other rules are not guessed at', () => {
  const hits = lintMessages({ locales: [{ locale: 'en', file: 'en.json', messages: { a: { b: '{count, plural, one {x}}' } } }], primary: 'en', keys: ['a.b'] });
  assert.deepEqual(hits.map((h) => h.rule), ['invalid-icu']);
  assert.equal(hits[0].severity, 'P1');
});
