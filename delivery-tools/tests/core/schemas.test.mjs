// The frozen schemas: shape rules, and one valid and one invalid synthetic example each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_DIR, schemaNames, validateAgainst, assertValid, assertKeywords } from '../../lib/core/schema.mjs';
import { FIXTURES_DIR, loadFixture } from '../helpers/fixtures.mjs';

const SECTION_17 = ['profile', 'safety', 'intent', 'inventory', 'baseline', 'plan', 'unit-file', 'unit-report', 'sidefx', 'seedplan', 'capture', 'findings', 'state', 'ready'];
const SUPPLEMENTARY = ['preflight', 'candidates', 'dom', 'capture-errors', 'capture-controls', 'components'];
const ARTEFACTS = [...SECTION_17, ...SUPPLEMENTARY];
// A bare array has nowhere to carry schemaVersion; the capture manifest that names it does.
const BARE_ARRAYS = ['capture-controls'];
// components.json is the one artefact shared by every run instead of belonging to one (spec
// components-first §2): its own top-level key is "version", not "schemaVersion".
const NO_SCHEMA_VERSION = [...BARE_ARRAYS, 'components'];
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

test('every artefact requires schemaVersion const 1, except the bare arrays', () => {
  for (const name of BARE_ARRAYS) assert.equal(raw(name).type, 'array', name);
  for (const name of ARTEFACTS.filter((n) => !NO_SCHEMA_VERSION.includes(n))) {
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
}

test('every artefact has an invalid example, and every invalid example names a known schema', () => {
  for (const name of ARTEFACTS) assert.ok(reasons[name], `${name} has no invalid example`);
  for (const stem of Object.keys(reasons)) assert.ok(ARTEFACTS.includes(stem.split('--')[0]), stem);
});

// <schema>.invalid.json, plus <schema>--<variant>.invalid.json for fields added after the first freeze.
for (const [stem, { path, contains }] of Object.entries(reasons)) {
  const name = stem.split('--')[0];
  test(`${stem}: the synthetic invalid example fails for its planted reason`, () => {
    const r = validateAgainst(name, loadFixture(`schemas/${stem}.invalid.json`));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path === path && e.message.includes(contains)), `${stem}: wanted ${path} ${contains}; got ${JSON.stringify(r.errors)}`);
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

// Fix round 1: a components run's gallery state ids ("C-<Name>-NN", components-first spec §3)
// widened common.schema.json's Id (and inventory's inline mappedTo copy) alongside it, so a
// components run's inventory.json (states[].id) and any candidate mapped to one still validate.
test('Id (and inventory\'s mappedTo copy) accepts a components-run gallery state id, still rejects a lowercase one or a single digit', () => {
  const base = () => loadFixture('schemas/inventory.valid.json');
  const withStateId = (id) => { const inv = base(); inv.states = [{ ...inv.states[0], id }]; return inv; };
  assert.equal(validateAgainst('inventory', withStateId('C-Picker-01')).ok, true);
  assert.equal(validateAgainst('inventory', withStateId('C-DatePicker-12')).ok, true);
  assert.equal(validateAgainst('inventory', withStateId('c-picker-01')).ok, false);
  assert.equal(validateAgainst('inventory', withStateId('C-Picker-1')).ok, false);
  assert.equal(validateAgainst('inventory', withStateId('KC-05')).ok, true, 'the screen-id form still validates');

  const withMappedTo = (mappedTo) => { const inv = base(); inv.candidates = [{ ...inv.candidates[0], mappedTo }]; return inv; };
  assert.equal(validateAgainst('inventory', withMappedTo('C-Picker-01')).ok, true);
  assert.equal(validateAgainst('inventory', withMappedTo('c-picker-01')).ok, false);
});
