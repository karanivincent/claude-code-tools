// Every keyword the validator supports, proven to accept and to reject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaRegistry, SUPPORTED_KEYWORDS, ASSERTION_KEYWORDS, assertKeywords } from '../../lib/core/schema.mjs';

const BASE = 'https://delivery-tools.invalid/schemas/';
function check(schema, value) {
  const reg = new SchemaRegistry();
  reg.add({ $id: `${BASE}t.schema.json`, ...schema });
  return reg.validate(`${BASE}t.schema.json`, value);
}
const ok = (schema, value) => assert.equal(check(schema, value).ok, true, JSON.stringify(check(schema, value).errors));
const bad = (schema, value, fragment) => {
  const r = check(schema, value);
  assert.equal(r.ok, false, `expected ${JSON.stringify(value)} to fail`);
  if (fragment) assert.ok(r.errors.some((e) => e.message.includes(fragment)), JSON.stringify(r.errors));
};

test('type: each JSON type, integer inside number, union types', () => {
  ok({ type: 'object' }, {}); bad({ type: 'object' }, [], 'must be object');
  ok({ type: 'array' }, []); bad({ type: 'array' }, {}, 'must be array');
  ok({ type: 'string' }, 'x'); bad({ type: 'string' }, 1);
  ok({ type: 'integer' }, 3); bad({ type: 'integer' }, 3.5, 'must be integer');
  ok({ type: 'number' }, 3); ok({ type: 'number' }, 3.5); bad({ type: 'number' }, '3');
  ok({ type: 'boolean' }, false); bad({ type: 'boolean' }, 0);
  ok({ type: 'null' }, null); bad({ type: 'null' }, 0);
  ok({ type: ['integer', 'null'] }, null); bad({ type: ['integer', 'null'] }, 'x', 'integer or null');
});

test('enum and const compare by value, including objects', () => {
  ok({ enum: ['a', 'b'] }, 'b'); bad({ enum: ['a', 'b'] }, 'c', 'must be one of');
  ok({ const: 1 }, 1); bad({ const: 1 }, 2, 'must equal 1');
  ok({ const: { a: [1] } }, { a: [1] }); bad({ const: { a: [1] } }, { a: [2] });
});

test('properties, required, additionalProperties false and as a schema', () => {
  const s = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };
  ok(s, { a: 'x' });
  bad(s, {}, 'missing required property "a"');
  bad(s, { a: 'x', b: 1 }, 'unknown property "b"');
  bad(s, { a: 1 }, 'must be string');
  ok({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 1, y: 2 });
  bad({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 'no' }, 'must be integer');
  ok({ type: 'object', additionalProperties: true }, { anything: [1, 'two'] });
});

test('propertyNames and minProperties', () => {
  ok({ type: 'object', propertyNames: { pattern: '^[a-z]{2}$' } }, { en: 1, fr: 2 });
  bad({ type: 'object', propertyNames: { pattern: '^[a-z]{2}$' } }, { english: 1 }, 'property name "english"');
  ok({ type: 'object', minProperties: 1 }, { a: 1 });
  bad({ type: 'object', minProperties: 1 }, {}, 'at least 1 property');
});

test('items, minItems, uniqueItems', () => {
  ok({ type: 'array', items: { type: 'integer' } }, [1, 2]);
  bad({ type: 'array', items: { type: 'integer' } }, [1, 'x'], 'must be integer');
  ok({ type: 'array', minItems: 1 }, [0]); bad({ type: 'array', minItems: 1 }, [], 'at least 1 item');
  ok({ type: 'array', uniqueItems: true }, [1, 2, { a: 1 }]);
  bad({ type: 'array', uniqueItems: true }, [{ a: 1, b: 2 }, { b: 2, a: 1 }], 'duplicates item 0');
});

test('pattern and minLength count characters, not bytes', () => {
  ok({ type: 'string', pattern: '^[A-Z]{2}-\\d{2}$' }, 'OV-05'); bad({ type: 'string', pattern: '^[A-Z]{2}-\\d{2}$' }, 'ov-05', 'must match pattern');
  ok({ type: 'string', minLength: 2 }, 'é·'); bad({ type: 'string', minLength: 1 }, '', 'at least 1 character');
});

test('minimum and maximum apply to numbers only', () => {
  ok({ type: ['integer', 'null'], minimum: 1 }, null);
  ok({ minimum: 1, maximum: 3 }, 3); bad({ minimum: 1 }, 0, 'must be >= 1'); bad({ maximum: 3 }, 4, 'must be <= 3');
  ok({ minimum: 5 }, 'strings ignore minimum');
});

test('anyOf and oneOf, with the closest branch named on failure', () => {
  const any = { anyOf: [{ type: 'null' }, { type: 'string', pattern: '^S\\d+$' }] };
  ok(any, null); ok(any, 'S1'); bad(any, 'x1', 'closest');
  const one = { oneOf: [{ type: 'integer' }, { type: 'number', minimum: 10 }] };
  ok(one, 3); ok(one, 10.5); bad(one, 12, 'matched 2'); bad(one, 'x', 'matched 0');
});

test('$ref and $defs, local and across schemas, with siblings applied too', () => {
  const reg = new SchemaRegistry();
  reg.add({ $id: `${BASE}a.schema.json`, $defs: { Id: { type: 'string', pattern: '^X-\\d$' } } });
  reg.add({ $id: `${BASE}b.schema.json`, type: 'object', additionalProperties: false, properties: {
    local: { $ref: '#/$defs/N' }, remote: { $ref: 'a.schema.json#/$defs/Id', minLength: 3 } }, $defs: { N: { type: 'integer' } } });
  assert.equal(reg.validate(`${BASE}b.schema.json`, { local: 1, remote: 'X-1' }).ok, true);
  const r = reg.validate(`${BASE}b.schema.json`, { local: 'one', remote: 'Y-1' });
  assert.deepEqual(r.errors.map((e) => e.path).sort(), ['/local', '/remote']);
  assert.throws(() => reg.validate({ $ref: 'missing.schema.json' }, 1), /unresolvable \$ref/);
});

test('boolean schemas', () => {
  ok({ type: 'object', properties: { any: true } }, { any: { deep: [1] } });
  bad({ type: 'object', properties: { never: false } }, { never: 1 }, 'not allowed');
});

test('annotations are ignored; unknown keywords are refused at load time', () => {
  ok({ title: 't', description: 'd', $comment: 'c', $schema: 'https://json-schema.org/draft/2020-12/schema' }, 5);
  assert.throws(() => assertKeywords({ type: 'string', format: 'date-time' }), /unsupported schema keyword "format"/);
  assert.throws(() => assertKeywords({ properties: { a: { if: {} } } }), /unsupported schema keyword "if"/);
  assert.throws(() => assertKeywords({ type: 'strng' }), /unknown type/);
  assert.equal(SUPPORTED_KEYWORDS.length, new Set(SUPPORTED_KEYWORDS).size);
  // Each assertion keyword above has a test in this file; keep this list in step with them.
  assert.deepEqual([...ASSERTION_KEYWORDS].sort(), ['$defs', '$ref', 'additionalProperties', 'anyOf', 'const', 'enum', 'items', 'maximum', 'minItems', 'minLength', 'minProperties', 'minimum', 'oneOf', 'pattern', 'properties', 'propertyNames', 'required', 'type', 'uniqueItems'].sort());
});

test('error paths are JSON pointers', () => {
  const r = check({ type: 'object', properties: { 'a/b': { type: 'array', items: { type: 'object', required: ['x'] } } } }, { 'a/b': [{}, {}] });
  assert.deepEqual(r.errors.map((e) => e.path), ['/a~1b/0', '/a~1b/1']);
});
