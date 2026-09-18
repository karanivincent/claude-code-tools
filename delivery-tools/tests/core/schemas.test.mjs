// The frozen schemas: shape rules, and one valid and one invalid synthetic example each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_DIR, schemaNames, validateAgainst, assertValid, assertKeywords } from '../../lib/core/schema.mjs';
import { FIXTURES_DIR, loadFixture } from '../helpers/fixtures.mjs';

const SECTION_17 = ['profile', 'safety', 'intent', 'inventory', 'baseline', 'plan', 'unit-file', 'unit-report', 'sidefx', 'seedplan', 'capture', 'findings', 'state', 'ready'];
const SUPPLEMENTARY = ['preflight', 'candidates', 'dom', 'capture-errors'];
const ARTEFACTS = [...SECTION_17, ...SUPPLEMENTARY];
const raw = (name) => JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.schema.json`), 'utf8'));

test('the schema set is exactly section 17 plus the documented supplements and common', () => {
  assert.deepEqual(schemaNames(), [...ARTEFACTS, 'common'].sort());
});

test('every schema is 2020-12, has its $id, and uses only supported keywords', () => {
  for (const name of schemaNames()) {
    const s = raw(name);
    assert.equal(s.$schema, 'https://json-schema.org/draft/2020-12/schema', name);
    assert.equal(s.$id, `https://delivery-tools.invalid/schemas/${name}.schema.json`, name);
    assert.doesNotThrow(() => assertKeywords(s, name));
  }
});

test('every artefact requires schemaVersion const 1', () => {
  for (const name of ARTEFACTS) {
    const s = raw(name);
    assert.deepEqual(s.properties.schemaVersion, { const: 1 }, name);
    assert.ok(s.required.includes('schemaVersion'), name);
  }
});

// A record (additionalProperties is a schema, no properties) is the one allowed open object.
function walkObjects(node, path, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n, i) => walkObjects(n, `${path}/${i}`, visit)); return; }
  if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))) visit(node, path);
  for (const [k, v] of Object.entries(node)) if (k !== 'enum' && k !== 'const') walkObjects(v, `${path}/${k}`, visit);
}

test('every object schema is closed: additionalProperties false, or a pure record', () => {
  for (const name of schemaNames()) {
    walkObjects(raw(name), name, (node, path) => {
      const ap = node.additionalProperties;
      if (ap === false) return;
      assert.ok(ap !== undefined, `${path}: object without additionalProperties`);
      assert.ok(node.properties === undefined, `${path}: an object with properties must set additionalProperties false`);
    });
  }
});

test('every required property is declared', () => {
  for (const name of schemaNames()) {
    walkObjects(raw(name), name, (node, path) => {
      for (const r of node.required ?? []) assert.ok(node.properties && r in node.properties, `${path}: required "${r}" not in properties`);
    });
  }
});

const reasons = loadFixture('schemas/invalid-reasons.json');

for (const name of ARTEFACTS) {
  test(`${name}: the synthetic valid example validates`, () => {
    const r = validateAgainst(name, loadFixture(`schemas/${name}.valid.json`));
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });
  test(`${name}: the synthetic invalid example fails for its planted reason`, () => {
    const r = validateAgainst(name, loadFixture(`schemas/${name}.invalid.json`));
    assert.equal(r.ok, false);
    const { path, contains } = reasons[name];
    assert.ok(r.errors.some((e) => e.path === path && e.message.includes(contains)), `${name}: wanted ${path} ${contains}; got ${JSON.stringify(r.errors)}`);
  });
}

test('assertValid throws one failure line per issue with the chosen exit code', () => {
  const bad = loadFixture('schemas/state.invalid.json');
  bad.wave = -1;
  try {
    assertValid('state', bad, { exit: 5, label: 'state.json' });
    assert.fail('should throw');
  } catch (err) {
    assert.equal(err.exit, 5);
    assert.equal(err.failures.length, 2);
    assert.ok(err.failures.every((f) => f.code === 'schema' && f.message.startsWith('state.json/')));
  }
});

test('fixtures carry nothing project-specific', () => {
  const all = ARTEFACTS.map((n) => readFileSync(join(FIXTURES_DIR, 'schemas', `${n}.valid.json`), 'utf8')).join('\n');
  const name = new RegExp('ksatilet'.split('').reverse().join(''), 'i');
  for (const word of [name, /254\d{9}/, /supabase\.co/, /vercel\.app/]) assert.doesNotMatch(all, word);
});
