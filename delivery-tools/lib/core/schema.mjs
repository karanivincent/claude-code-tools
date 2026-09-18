// A small JSON Schema 2020-12 validator covering exactly the keywords the frozen schemas use.
// A schema using any other keyword is refused when it is loaded, so an unsupported keyword can
// never be silently ignored.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './hash.mjs';
import { DeliveryError, EXIT } from './exit.mjs';

export const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');
export const SCHEMA_BASE = 'https://delivery-tools.invalid/schemas/';

export const ANNOTATION_KEYWORDS = Object.freeze(['$schema', '$id', '$comment', 'title', 'description']);
export const ASSERTION_KEYWORDS = Object.freeze([
  '$defs', '$ref', 'type', 'enum', 'const',
  'properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties',
  'items', 'minItems', 'uniqueItems',
  'pattern', 'minLength',
  'minimum', 'maximum',
  'anyOf', 'oneOf',
]);
export const SUPPORTED_KEYWORDS = Object.freeze([...ANNOTATION_KEYWORDS, ...ASSERTION_KEYWORDS]);
const SUPPORTED = new Set(SUPPORTED_KEYWORDS);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

/** @typedef {{ path: string, message: string }} SchemaIssue */

/**
 * A set of schemas addressable by $id, so "plan.schema.json#/$defs/PlanRow" resolves from
 * a sibling schema.
 */
export class SchemaRegistry {
  constructor() { this.byId = new Map(); this.regexCache = new Map(); }

  /** @param {object} schema must carry an absolute $id */
  add(schema) {
    if (!schema || typeof schema !== 'object' || typeof schema.$id !== 'string') {
      throw new Error('schema needs an absolute $id');
    }
    assertKeywords(schema, schema.$id);
    this.byId.set(stripFragment(schema.$id), schema);
    return this;
  }

  /** @param {string} ref @param {string} base */
  resolve(ref, base) {
    const url = new URL(ref, base);
    const docId = stripFragment(url.href);
    const doc = this.byId.get(docId);
    if (!doc) throw new Error(`unresolvable $ref ${ref} (from ${base})`);
    const frag = decodeURIComponent(url.hash.replace(/^#/, ''));
    if (!frag) return { schema: doc, base: docId };
    let node = doc;
    for (const part of frag.split('/').slice(1)) {
      node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      if (node === undefined) throw new Error(`unresolvable $ref ${ref} (no ${frag})`);
    }
    return { schema: node, base: docId };
  }

  regex(pattern) {
    let re = this.regexCache.get(pattern);
    if (!re) { re = new RegExp(pattern, 'u'); this.regexCache.set(pattern, re); }
    return re;
  }

  /**
   * @param {object|string} schemaOrId a schema object or a registered $id / file name
   * @param {unknown} value
   * @returns {{ ok: boolean, errors: SchemaIssue[] }}
   */
  validate(schemaOrId, value) {
    let schema = schemaOrId;
    let base;
    if (typeof schemaOrId === 'string') {
      ({ schema, base } = this.resolve(schemaOrId, SCHEMA_BASE));
    } else {
      base = schema.$id ? stripFragment(schema.$id) : SCHEMA_BASE;
    }
    const errors = [];
    check(this, schema, value, '', base, errors);
    return { ok: errors.length === 0, errors };
  }
}

function stripFragment(id) { return id.split('#')[0]; }

/** Refuse any keyword outside SUPPORTED_KEYWORDS, anywhere in the schema tree. */
export function assertKeywords(schema, where = '#') {
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${where}: a schema must be an object or boolean`);
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`${where}: unsupported schema keyword "${k}"`);
    if (k === 'properties' || k === '$defs') for (const [pk, pv] of Object.entries(v)) assertKeywords(pv, `${where}/${k}/${pk}`);
    else if (k === 'items' || k === 'additionalProperties' || k === 'propertyNames') assertKeywords(v, `${where}/${k}`);
    else if (k === 'anyOf' || k === 'oneOf') v.forEach((s, i) => assertKeywords(s, `${where}/${k}/${i}`));
    else if (k === 'type') for (const t of [].concat(v)) if (!TYPES.has(t)) throw new Error(`${where}: unknown type "${t}"`);
  }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(t, v) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return t === actual;
}

function ptr(path, key) {
  return `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function check(reg, schema, value, path, base, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push({ path: path || '/', message: 'is not allowed here' }); return; }
  const at = path || '/';

  if (schema.$ref !== undefined) {
    const r = reg.resolve(schema.$ref, base);
    check(reg, r.schema, value, path, r.base, errors);
  }
  if (schema.type !== undefined) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeMatches(t, value))) {
      errors.push({ path: at, message: `must be ${types.join(' or ')}, got ${typeOf(value)}` });
      return; // the remaining keywords would only repeat the type error
    }
  }
  if (schema.const !== undefined && canonicalJson(schema.const) !== canonicalJson(value)) {
    errors.push({ path: at, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => canonicalJson(e) === canonicalJson(value))) {
    errors.push({ path: at, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }

  const t = typeOf(value);
  if (t === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) {
      errors.push({ path: at, message: `must have at least ${schema.minLength} character(s)` });
    }
    if (schema.pattern !== undefined && !reg.regex(schema.pattern).test(value)) {
      errors.push({ path: at, message: `must match pattern ${schema.pattern}` });
    }
  }
  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `must be <= ${schema.maximum}` });
  }
  if (t === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.uniqueItems === true) {
      const seen = new Map();
      value.forEach((item, i) => {
        const key = canonicalJson(item);
        if (seen.has(key)) errors.push({ path: ptr(path, i), message: `duplicates item ${seen.get(key)}` });
        else seen.set(key, i);
      });
    }
    if (schema.items !== undefined) value.forEach((item, i) => check(reg, schema.items, item, ptr(path, i), base, errors));
  }
  if (t === 'object') {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({ path: at, message: `must have at least ${schema.minProperties} propert${schema.minProperties === 1 ? 'y' : 'ies'}` });
    }
    for (const req of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, req)) errors.push({ path: at, message: `missing required property "${req}"` });
    }
    if (schema.propertyNames !== undefined) {
      for (const k of keys) {
        const sub = [];
        check(reg, schema.propertyNames, k, ptr(path, k), base, sub);
        if (sub.length) errors.push({ path: ptr(path, k), message: `property name "${k}" is not allowed: ${sub[0].message}` });
      }
    }
    const props = schema.properties ?? {};
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(props, k)) check(reg, props[k], value[k], ptr(path, k), base, errors);
      else if (schema.additionalProperties === false) errors.push({ path: at, message: `unknown property "${k}"` });
      else if (schema.additionalProperties !== undefined) check(reg, schema.additionalProperties, value[k], ptr(path, k), base, errors);
    }
  }

  if (schema.anyOf !== undefined) {
    const branches = schema.anyOf.map((s) => { const e = []; check(reg, s, value, path, base, e); return e; });
    if (!branches.some((e) => e.length === 0)) pushBest(errors, at, `must match at least one of ${branches.length} alternatives`, branches);
  }
  if (schema.oneOf !== undefined) {
    const branches = schema.oneOf.map((s) => { const e = []; check(reg, s, value, path, base, e); return e; });
    const matched = branches.filter((e) => e.length === 0).length;
    if (matched !== 1) pushBest(errors, at, `must match exactly one of ${branches.length} alternatives (matched ${matched})`, matched === 0 ? branches : []);
  }
}

function pushBest(errors, at, message, branches) {
  const best = branches.filter((b) => b.length).sort((a, b) => a.length - b.length)[0];
  errors.push({ path: at, message: best ? `${message}; closest: ${best[0].path} ${best[0].message}` : message });
}

let defaultRegistry = null;

/** Every schema in schemas/, loaded once. Throws on any unsupported keyword. */
export function schemaRegistry() {
  if (defaultRegistry) return defaultRegistry;
  const reg = new SchemaRegistry();
  for (const f of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.schema.json')).sort()) {
    reg.add(JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8')));
  }
  defaultRegistry = reg;
  return reg;
}

/** Names of every shipped schema, e.g. ["baseline", "capture", ...]. */
export function schemaNames() {
  return readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.schema.json')).map((n) => n.replace(/\.schema\.json$/, '')).sort();
}

/**
 * Validate a value against a shipped schema by name ("plan", "unit-report", ...).
 * @param {string} name
 * @param {unknown} value
 * @returns {{ ok: boolean, errors: SchemaIssue[] }}
 */
export function validateAgainst(name, value) {
  return schemaRegistry().validate(`${SCHEMA_BASE}${name}.schema.json`, value);
}

/**
 * Throw a DeliveryError listing every schema issue (one failure line each) when invalid.
 * @param {string} name schema name
 * @param {unknown} value
 * @param {{ exit?: number, label?: string }} [opts] exit defaults to 2 (configuration);
 *   use 5 for artefacts only the CLI writes (state, ready) since invalid means tampered
 */
export function assertValid(name, value, opts = {}) {
  const { ok, errors } = validateAgainst(name, value);
  if (ok) return value;
  const label = opts.label ?? name;
  const failures = errors.map((e) => ({ code: 'schema', message: `${label}${e.path === '/' ? '' : e.path}: ${e.message}` }));
  throw new DeliveryError(opts.exit ?? EXIT.USAGE, `${label} does not match schema ${name} (${errors.length} issue(s))`, { code: 'schema', failures });
}
