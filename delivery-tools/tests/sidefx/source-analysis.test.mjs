// The pieces the side-effect map and the baseline both stand on: globs, the tokenizer, the
// query-builder chain extractor and the SQL where-clause reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, globLiteralPrefix, matchesAny } from '../../lib/sidefx/glob.mjs';
import { tokenize, literalValue, topLevelConsts } from '../../lib/sidefx/tokenize.mjs';
import { extractTsChains, enclosingFunction } from '../../lib/sidefx/ts-chains.mjs';
import { sqlPredicates, indexFunctions, parseCronCommand, functionDefinitions } from '../../lib/sidefx/sql.mjs';
import { WORKER_TS, MIGRATION_1, MIGRATION_2 } from './fixtures.mjs';

test('globs: ** spans directories, * stays in a segment, [[] escapes a bracket, braces alternate', () => {
  assert.ok(matchesAny('apps/server/src/jobs/sweep.ts', ['apps/server/src/jobs/**/*.ts']));
  assert.ok(matchesAny('apps/server/src/jobs/a/b/sweep.ts', ['apps/server/src/jobs/**/*.ts']));
  assert.ok(!matchesAny('apps/server/src/jobsx/sweep.ts', ['apps/server/src/jobs/**/*.ts']));
  assert.ok(!matchesAny('db/migrations/a/b.sql', ['db/migrations/*.sql']));
  assert.ok(globToRegExp('apps/web/src/app/[[]locale]/**/page.tsx').test('apps/web/src/app/[locale]/widgets/[id]/page.tsx'));
  assert.ok(!globToRegExp('apps/web/src/app/[[]locale]/**/page.tsx').test('apps/web/src/app/l/widgets/page.tsx'));
  assert.ok(globToRegExp('src/**/*.{ts,tsx}').test('src/a/b.tsx'));
  assert.equal(globLiteralPrefix('apps/web/src/app/[[]locale]/**/page.tsx'), 'apps/web/src/app/[locale]/');
  assert.equal(globLiteralPrefix('**/*.ts'), '');
});

test('tokenizer: strings, templates, regex and division, comments, JSX text with apostrophes', () => {
  const src = "const a = 'x\\'y'; // note\nconst r = /a\\/b/g; const d = a / 2;\nconst t = `p${q}r`;\n";
  const tk = tokenize(src);
  assert.equal(tk.find((t) => t.t === 'str').v, "x'y");
  assert.equal(tk.filter((t) => t.t === 're').length, 1);
  assert.ok(tk.some((t) => t.t === 'p' && t.v === '/'), 'a / 2 is division');
  const tpl = tk.find((t) => t.t === 'tpl');
  assert.deepEqual(tpl.quasis, ['p', 'r']);
  assert.equal(tpl.line, 3);
  const jsx = tokenize("export function C() {\n  const t = useT('w');\n  return <p className=\"x\">Don't {t('title')}</p>;\n}\nconst after = 'ok';\n", { jsx: true });
  assert.ok(jsx.some((t) => t.t === 'jsx' && t.v === 'p'));
  assert.ok(jsx.some((t) => t.t === 'attr' && t.v === 'className'));
  assert.ok(jsx.some((t) => t.t === 'str' && t.v === 'title'), 'the expression container is tokenized');
  assert.ok(jsx.some((t) => t.t === 'str' && t.v === 'ok' && t.line === 5), "the apostrophe in Don't opened no string");
});

test('literals: arrays with as const, top-level consts, and what is not literal', () => {
  const tk = tokenize("const A = ['x', 'y'] as const;\nconst B = 3;\nfunction f() { const C = 'no'; }\n");
  const consts = topLevelConsts(tk);
  assert.deepEqual(consts.get('A'), ['x', 'y']);
  assert.equal(consts.get('B'), 3);
  assert.ok(!consts.has('C'), 'only top-level constants');
  assert.deepEqual(literalValue(tokenize('A'), consts), ['x', 'y']);
});

test('chains: literal filters become predicates, non-literal ones are dropped, the function is named', () => {
  const { chains, rpcs } = extractTsChains('apps/server/src/jobs/sweep.ts', WORKER_TS);
  const find = (table, fn) => chains.find((c) => c.table === table && c.fn === fn);
  assert.deepEqual(find('practice_runs', 'resumeRuns').filters, [
    { column: 'status', op: 'eq', value: 'queued' },
    { column: 'deferred_at', op: 'not-null', value: null },
  ]);
  const today = find('practice_runs', 'countToday');
  assert.deepEqual(today.filters, [{ column: 'mode', op: 'eq', value: 'to_phone' }], 'the gte on a runtime value is dropped');
  assert.equal(today.fnLine, 15, 'a head whose parameters span lines is still found');
  assert.deepEqual(find('outbound_batches', 'listOpen').filters, [{ column: 'status', op: 'in', value: ['pending', 'running'] }], 'through a cast and a const array');
  assert.deepEqual(find('outbound_batches', 'byId').filters, [], 'an id lookup has no literal filter');
  assert.deepEqual(find('widgets', 'claim').filters, [{ column: 'state', op: 'eq', value: 'armed' }, { column: 'kind', op: 'eq', value: 3 }], 'through (x.from() as any).update().match()');
  assert.deepEqual(find('outbound_calls', 'sweep').filters, [{ column: 'status', op: 'in', value: ['stale', 'orphaned'] }], 'filter(col, "in", "(a,b)")');
  assert.ok(!chains.some((c) => c.table === 'hello'), 'Buffer.from is not a query');
  assert.deepEqual(rpcs, [{ name: 'claim_outbound_calls', line: 39 }], 'an rpc name on the next line is found');
});

test('enclosing function: declaration, object property arrow, method; module level otherwise', () => {
  const lines = WORKER_TS.split('\n');
  assert.equal(enclosingFunction(lines, 8).name, 'resumeRuns');
  assert.equal(enclosingFunction(lines, 30).name, 'listOpen');
  assert.equal(enclosingFunction(lines, 50).name, 'sweep');
  assert.equal(enclosingFunction(['const x = db.from("t").eq("a", "b");'], 1).name, '<module>');
});

test('SQL: function definitions, the latest one wins, where clauses as predicates', () => {
  const defs = functionDefinitions('db/migrations/20260201000000_second.sql', MIGRATION_2);
  assert.deepEqual(defs.map((d) => d.name), ['claim_outbound_calls', 'cleanup_runs']);
  assert.deepEqual(defs[0].params, ['p_org', 'p_limit']);
  const index = indexFunctions([
    { path: 'db/migrations/20260201000000_second.sql', text: MIGRATION_2 },
    { path: 'db/migrations/20260101000000_first.sql', text: MIGRATION_1 },
  ]);
  const claim = index.get('claim_outbound_calls');
  assert.equal(claim.latest.file, 'db/migrations/20260201000000_second.sql');
  assert.equal(claim.all.length, 2);
  const preds = sqlPredicates(claim.latest.body, { lineOffset: claim.latest.bodyLine - 1, vars: claim.latest.params });
  const due = preds.find((p) => p.filters.some((f) => f.column === 'release_at'));
  assert.equal(due.table, 'outbound_calls');
  assert.deepEqual(due.filters, [
    { column: 'status', op: 'eq', value: 'queued' },
    { column: 'release_at', op: 'lte', value: 'now()' },
  ], 'the parameter, the or-group and the not-exists guard are dropped');
  assert.equal(due.line, 20, 'lines are file lines (the where keyword)');
  assert.ok(preds.some((p) => p.table === 'outbound_calls' && p.filters[0].op === 'in' && p.filters[0].value.length === 2));
  assert.ok(!preds.some((p) => p.table === 'outbound_batches'), 'rows in a not-exists guard stop the claim; they are not its targets');
  assert.ok(!preds.some((p) => p.filters.some((f) => f.column === 'v_mode')), 'a plpgsql variable is not a column');
});

test('SQL: an UPDATE with no where acts on every row; intervals and between are kept', () => {
  const index = indexFunctions([{ path: 'm.sql', text: MIGRATION_2 }]);
  const def = index.get('cleanup_runs').latest;
  const preds = sqlPredicates(def.body, { lineOffset: def.bodyLine - 1 });
  assert.deepEqual(preds.find((p) => p.table === 'practice_runs'), { table: 'practice_runs', filters: [], kind: 'update', line: 43, endLine: 43 });
  const del = preds.find((p) => p.table === 'practice_notes');
  assert.equal(del.kind, 'delete');
  assert.deepEqual(del.filters, [
    { column: 'created_at', op: 'lt', value: "now() - interval '7 days'" },
    { column: 'kind', op: 'gte', value: 1 },
    { column: 'kind', op: 'lte', value: 3 },
  ]);
});

test('cron: commands are parsed like function bodies; what cannot be read is named', () => {
  const index = indexFunctions([{ path: 'm.sql', text: MIGRATION_2 }]);
  const ok = parseCronCommand('select cleanup_runs()', index);
  assert.deepEqual(ok.unparsed, []);
  assert.ok(ok.predicates.some((p) => p.table === 'practice_runs'));
  assert.deepEqual(parseCronCommand('vacuum analyze', index), { predicates: [], unparsed: [] });
  const ext = parseCronCommand("select net.http_post(url := 'https://hooks.example.invalid/x')", index);
  assert.ok(ext.unparsed.some((u) => /outside the database/.test(u)));
  const unknown = parseCronCommand('select mystery_job()', index);
  assert.ok(unknown.unparsed.some((u) => /mystery_job/.test(u)));
  const dml = parseCronCommand("update widgets set state = 'idle' where state = 'armed'", index);
  assert.deepEqual(dml.unparsed, []);
  assert.deepEqual(dml.predicates[0].filters, [{ column: 'state', op: 'eq', value: 'armed' }]);
});
