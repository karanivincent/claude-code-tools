// W3 item 4: world values checked against the generated database types before anything is
// written (lib/seed/validate.mjs), and the repo's own Json validator (commands.validateSeedJson).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnTypeProblems, jsonColumns, parseColumnTypes, runValidateSeedJson } from '../../lib/seed/validate.mjs';

const TYPES_TEXT = `
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type Database = {
  public: {
    Tables: {
      calls: {
        Row: {
          id: string
          organization_id: string
          duration: number
          notes: string | null
          answered: boolean
          status: Database["public"]["Enums"]["call_status"]
          summary: Json
          tags: string[] | null
          kind: "inbound" | "outbound"
        }
        Insert: {
          id?: string
        }
      }
    }
    Views: {
      call_totals: { Row: { organization_id: string | null; total: number | null } }
    }
    Enums: {
      call_status: "queued" | "done" | "failed"
      plan_tier:
        | "free"
        | "pro"
    }
  }
}`;

const types = () => parseColumnTypes(TYPES_TEXT);
const row = (values, extra = {}) => ({ world: 'design', table: 'calls', key: 'c1', values, ...extra });
const GOOD = { id: 'x', organization_id: 'o', duration: 60, notes: null, answered: true, status: 'done', summary: { a: 1 }, tags: ['a'], kind: 'inbound' };

test('parseColumnTypes: raw type text per column, views too, and the enum lists', () => {
  const t = types();
  assert.equal(t.get('calls').get('duration'), 'number');
  assert.equal(t.get('calls').get('notes'), 'string | null');
  assert.equal(t.get('calls').get('summary'), 'Json');
  assert.equal(t.get('calls').get('status'), 'Database["public"]["Enums"]["call_status"]');
  assert.equal(t.get('calls').get('kind'), '"inbound" | "outbound"');
  assert.equal(t.get('calls').has('id'), true);
  assert.equal(t.get('call_totals').get('total'), 'number | null');
  assert.deepEqual(t.enums.get('call_status'), ['queued', 'done', 'failed']);
  assert.deepEqual(t.enums.get('plan_tier'), ['free', 'pro'], 'a union written over several lines');
});

test('a fitting row has no problems', () => {
  assert.deepEqual(columnTypeProblems([row(GOOD)], types()), []);
});

test('a column the table does not have is named', () => {
  const [p] = columnTypeProblems([row({ ...GOOD, colour: 'red' })], types());
  assert.deepEqual({ ...p }, { world: 'design', table: 'calls', column: 'colour', value: 'red', why: 'calls.colour does not exist in database.types.ts' });
});

test('a table the types do not have is one problem, however many rows use it', () => {
  const rows = [row({ a: 1 }, { table: 'ghosts' }), row({ a: 2 }, { table: 'ghosts' })];
  const ps = columnTypeProblems(rows, types());
  assert.equal(ps.length, 1);
  assert.match(ps[0].why, /table ghosts does not exist in database\.types\.ts/);
});

test('a string in a number column, a number in a string column, a string in a boolean column', () => {
  const ps = columnTypeProblems([row({ ...GOOD, duration: '60', notes: 5, answered: 'yes' })], types());
  assert.deepEqual(ps.map((p) => p.column).sort(), ['answered', 'duration', 'notes']);
  assert.match(ps.find((p) => p.column === 'duration').why, /calls\.duration is number, and a string does not fit it/);
});

test('an enum value the enum does not list is refused, with the list', () => {
  const [p] = columnTypeProblems([row({ ...GOOD, status: 'manual' })], types());
  assert.equal(p.column, 'status');
  assert.equal(p.value, 'manual');
  assert.match(p.why, /"manual" is not one of queued, done, failed/);
  const [q] = columnTypeProblems([row({ ...GOOD, kind: 'sideways' })], types());
  assert.match(q.why, /"sideways" is not one of|does not fit/);
});

test('null is refused only where the type has no "| null"', () => {
  const ps = columnTypeProblems([row({ ...GOOD, notes: null, duration: null })], types());
  assert.deepEqual(ps.map((p) => p.column), ['duration']);
  assert.match(ps[0].why, /does not allow null/);
});

test('markers are skipped: $ref, $rel and $orgName resolve later', () => {
  const values = { ...GOOD, organization_id: { $ref: 'org' }, duration: { $rel: 'now-1d' }, notes: { $orgName: true } };
  assert.deepEqual(columnTypeProblems([row(values)], types()), []);
});

test('a value set later (deferred) is checked as what it will be', () => {
  const r = row({ ...GOOD, status: null }, { deferred: { status: 'manual' } });
  assert.equal(columnTypeProblems([r], types())[0].value, 'manual');
});

test('jsonColumns: only Json columns holding an object or an array', () => {
  const rows = [row(GOOD), row({ ...GOOD, summary: [1, 2] }, { key: 'c2' }), row({ ...GOOD, summary: 'text' }, { key: 'c3' }), row({ ...GOOD, summary: { $ref: 'x' } }, { key: 'c4' })];
  assert.deepEqual(jsonColumns(rows, types()), [
    { world: 'design', table: 'calls', key: 'c1', column: 'summary', value: { a: 1 } },
    { world: 'design', table: 'calls', key: 'c2', column: 'summary', value: [1, 2] },
  ]);
});

const ENTRIES = [{ world: 'design', table: 'calls', key: 'c1', column: 'summary', value: { a: 1 } }];

test('runValidateSeedJson: the command gets the entries on stdin and its problems come back', async () => {
  let seen;
  const exec = async (command, opts) => {
    seen = { command, ...opts };
    return { code: 1, stdout: JSON.stringify({ problems: [{ world: 'design', table: 'calls', row: 'c1', column: 'summary', message: 'missing "headline"' }] }) };
  };
  const r = await runValidateSeedJson('pnpm check-json', ENTRIES, { cwd: '/repo', exec });
  assert.equal(seen.command, 'pnpm check-json');
  assert.equal(seen.cwd, '/repo');
  assert.deepEqual(JSON.parse(seen.input), { entries: [{ world: 'design', table: 'calls', row: 'c1', column: 'summary', value: { a: 1 } }] });
  assert.deepEqual(r, { problems: [{ world: 'design', table: 'calls', row: 'c1', column: 'summary', message: 'missing "headline"' }], note: null });
});

test('runValidateSeedJson: a missing, slow, crashing or babbling command is a note, never a problem', async () => {
  const cases = [
    [{ code: 127, stdout: '' }, /not runnable/],
    [{ code: 124, stdout: '', timedOut: true }, /longer than 30 seconds/],
    [{ code: 2, stdout: '', stderr: 'boom' }, /exited 2: boom/],
    [{ code: 0, stdout: 'not json' }, /did not print JSON/],
    [{ code: 0, stdout: '{"ok":true}' }, /did not print/],
  ];
  for (const [result, note] of cases) {
    const r = await runValidateSeedJson('x', ENTRIES, { exec: async () => result });
    assert.deepEqual(r.problems, []);
    assert.match(r.note, note);
  }
  const thrown = await runValidateSeedJson('x', ENTRIES, { exec: async () => { throw new Error('spawn failed'); } });
  assert.match(thrown.note, /could not run \(spawn failed\)/);
});

test('runValidateSeedJson: no Json values, no command run', async () => {
  const r = await runValidateSeedJson('x', [], { exec: async () => { throw new Error('must not run'); } });
  assert.deepEqual(r, { problems: [], note: null });
});

test('runValidateSeedJson: the default exec really runs sh with stdin (a real shell command)', async () => {
  const cmd = `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s).entries[0];console.log(JSON.stringify({problems:[{world:e.world,table:e.table,row:e.row,column:e.column,message:'seen'}]}));process.exit(1)})"`;
  const r = await runValidateSeedJson(cmd, ENTRIES);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].message, 'seen');
});
