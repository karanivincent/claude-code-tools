#!/usr/bin/env node
// Assemble docs/delivery/<feature>/inventory.json from .delivery/<feature>/candidates.json and the
// extractors' group files (.delivery/<feature>/extract/*.json). It writes nothing, and exits 1
// with one FAIL line per problem, when a candidate is claimed by no group or claimed two different
// ways, a state id repeats, a mapping or a control target names an unknown state, or the result
// fails the inventory schema. Run it from the repository root, like the delivery CLI.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateAgainst } from '../../../lib/core/schema.mjs';
import { canonicalJson } from '../../../lib/core/hash.mjs';
import { writeJsonAtomic } from '../../../lib/core/fs.mjs';

const USAGE = `usage: node <plugin>/skills/design-inventory/scripts/assemble-inventory.mjs --feature <slug> [--check] [--json]

Build docs/delivery/<feature>/inventory.json from .delivery/<feature>/candidates.json and every
group file in .delivery/<feature>/extract/. Nothing is written while any problem stands.

options:
  --feature <slug>   the run (required)
  --check            report what would be written, and every problem, without writing
  --json             one JSON object on stdout
  --help             this text

exit: 0 written (or, with --check, would write); 1 a problem, one FAIL line each; 2 usage`;

const FEATURE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STATE_ID_RE = /^[A-Z]{1,6}-\d{2,3}$/;
const SHARED_REASON_NOTE_AT = 5;

/**
 * Pure assembly: no I/O.
 * @param {{ feature: string, candidates: object, parts: { file: string, doc: object }[], previous?: object|null }} input
 * @returns {{ inventory: object|null, failures: { code: string, message: string }[], notes: string[],
 *   counts: { candidates: number, mapped: number, excluded: number, states: number },
 *   diff: { added: string[], removed: string[], changed: string[] } | null }}
 */
export function assembleInventory({ feature, candidates, parts, previous = null }) {
  const failures = [];
  const fail = (code, message) => failures.push({ code, message });
  const notes = [];

  const states = [];
  const stateFile = new Map();
  for (const { file, doc } of parts) {
    if (!doc || typeof doc !== 'object') { fail('part', `${file}: not a JSON object`); continue; }
    if (doc.feature !== feature) fail('part', `${file}: feature is "${doc.feature}", expected "${feature}"`);
    if (!Array.isArray(doc.candidates)) fail('part', `${file}: "candidates" must be an array`);
    if (!Array.isArray(doc.states)) { fail('part', `${file}: "states" must be an array`); continue; }
    for (const s of doc.states) {
      const id = s?.id;
      if (stateFile.has(id)) fail('duplicate-state', `${id} is defined in ${stateFile.get(id)} and ${file}`);
      else { stateFile.set(id, file); states.push(s); }
    }
  }
  const stateIds = new Set(stateFile.keys());

  const known = new Map((candidates.candidates ?? []).map((c) => [c.id, c]));
  const claims = new Map();
  for (const { file, doc } of parts) {
    for (const c of Array.isArray(doc?.candidates) ? doc.candidates : []) {
      if (!known.has(c?.id)) { fail('unknown-candidate', `${file}: ${c?.id} is not in candidates.json`); continue; }
      const excluded = c.excluded && typeof c.excluded.reason === 'string' ? c.excluded.reason.trim() : null;
      if (c.mappedTo != null && excluded) { fail('bad-claim', `${file}: ${c.id} is both mapped (${c.mappedTo}) and excluded`); continue; }
      if (c.mappedTo == null && !excluded) { fail('bad-claim', `${file}: ${c.id} is neither mapped nor excluded with a reason`); continue; }
      if (c.mappedTo != null && !stateIds.has(c.mappedTo)) { fail('unknown-state', `${file}: ${c.id} maps to ${c.mappedTo}, which no group defines`); continue; }
      const claim = c.mappedTo != null ? { mappedTo: c.mappedTo } : { mappedTo: null, excluded: { reason: excluded } };
      const list = claims.get(c.id) ?? [];
      list.push({ file, claim });
      claims.set(c.id, list);
    }
  }

  const outCandidates = [];
  let mapped = 0, excludedCount = 0;
  const reasonUse = new Map();
  for (const c of candidates.candidates ?? []) {
    const list = claims.get(c.id) ?? [];
    const distinct = [...new Set(list.map((l) => canonicalJson(l.claim)))];
    if (list.length === 0) { fail('unclaimed', `${c.id} (${c.kind}, ${c.source}) is neither mapped nor excluded by any group`); continue; }
    if (distinct.length > 1) {
      fail('claimed-twice', `${c.id} is claimed differently by ${list.map((l) => `${l.file} (${l.claim.mappedTo ?? 'excluded'})`).join(' and ')}`);
      continue;
    }
    const { claim } = list[0];
    outCandidates.push({ id: c.id, kind: c.kind, source: c.source, ...claim });
    if (claim.mappedTo) mapped++;
    else { excludedCount++; reasonUse.set(claim.excluded.reason, (reasonUse.get(claim.excluded.reason) ?? 0) + 1); }
  }
  for (const [reason, n] of reasonUse) {
    if (n >= SHARED_REASON_NOTE_AT) notes.push(`one exclusion reason covers ${n} candidates: "${reason}"`);
  }

  for (const s of states) {
    if (typeof s?.id !== 'string' || !STATE_ID_RE.test(s.id)) fail('state-id', `state id "${s?.id}" must look like AB-01`);
    for (const ctl of Array.isArray(s?.controls) ? s.controls : []) {
      if (typeof ctl?.target === 'string' && STATE_ID_RE.test(ctl.target) && !stateIds.has(ctl.target)) {
        fail('unknown-target', `${s.id}: control "${ctl.label}" leads to ${ctl.target}, which no group defines`);
      }
    }
  }

  const inventory = {
    schemaVersion: 1,
    feature,
    designTreeSha256: candidates.designTreeSha256,
    candidates: outCandidates,
    states,
  };
  if (failures.length === 0) {
    const { ok, errors } = validateAgainst('inventory', inventory);
    if (!ok) for (const e of errors) fail('schema', `inventory${e.path === '/' ? '' : e.path}: ${e.message}`);
  }

  let diff = null;
  if (previous && Array.isArray(previous.states)) {
    const before = new Map(previous.states.map((s) => [s.id, canonicalJson(s)]));
    const after = new Map(states.map((s) => [s.id, canonicalJson(s)]));
    diff = {
      added: [...after.keys()].filter((id) => !before.has(id)).sort(),
      removed: [...before.keys()].filter((id) => !after.has(id)).sort(),
      changed: [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)).sort(),
    };
  }

  return {
    inventory: failures.length === 0 ? inventory : null,
    failures,
    notes,
    counts: { candidates: (candidates.candidates ?? []).length, mapped, excluded: excludedCount, states: states.length },
    diff,
  };
}

function parseArgs(argv) {
  const opts = { feature: null, check: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--feature') opts.feature = argv[++i] ?? null;
    else if (a.startsWith('--feature=')) opts.feature = a.slice('--feature='.length);
    else return { error: `unknown argument "${a}"` };
  }
  return opts;
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: (s: string) => void }} [io]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const print = io.stdout ?? ((s) => process.stdout.write(s + '\n'));
  const opts = parseArgs(argv);
  if (opts.help) { print(USAGE); return 0; }
  const usage = (message) => {
    if (opts.json) print(JSON.stringify({ ok: false, exit: 2, failures: [{ code: 'usage', message }] }));
    else print(`FAIL usage ${message}`);
    return 2;
  };
  if (opts.error) return usage(opts.error);
  if (!opts.feature || !FEATURE_RE.test(opts.feature)) return usage('--feature <slug> is required (lowercase words and hyphens)');

  let roots = { deliveryRoot: 'docs/delivery', runRoot: '.delivery' };
  const profilePath = join(cwd, '.claude', 'delivery-profile.json');
  if (existsSync(profilePath)) {
    try {
      const p = (await readJsonFile(profilePath)).paths ?? {};
      if (typeof p.deliveryRoot === 'string' && p.deliveryRoot) roots.deliveryRoot = p.deliveryRoot;
      if (typeof p.runRoot === 'string' && p.runRoot) roots.runRoot = p.runRoot;
    } catch (err) {
      return usage(`${profilePath}: ${err.message}`);
    }
  }
  const runDir = resolve(cwd, roots.runRoot, opts.feature);
  const candidatesPath = join(runDir, 'candidates.json');
  const extractDir = join(runDir, 'extract');
  const inventoryPath = resolve(cwd, roots.deliveryRoot, opts.feature, 'inventory.json');
  if (!existsSync(candidatesPath)) return usage(`${candidatesPath} not found: run "delivery design candidates" first, from the repository root`);

  let candidates;
  try { candidates = await readJsonFile(candidatesPath); } catch (err) { return usage(`${candidatesPath}: ${err.message}`); }
  const cv = validateAgainst('candidates', candidates);
  if (!cv.ok) return usage(`${candidatesPath} does not match the candidates schema: ${cv.errors[0].path} ${cv.errors[0].message}`);

  const parts = [];
  const failures = [];
  const names = existsSync(extractDir) ? (await readdir(extractDir)).filter((n) => n.endsWith('.json')).sort() : [];
  for (const name of names) {
    try { parts.push({ file: `extract/${name}`, doc: await readJsonFile(join(extractDir, name)) }); }
    catch (err) { failures.push({ code: 'part', message: `extract/${name}: ${err.message}` }); }
  }
  if (names.length === 0) failures.push({ code: 'part', message: `no group files in ${extractDir}` });

  let previous = null;
  if (existsSync(inventoryPath)) {
    try { previous = await readJsonFile(inventoryPath); } catch { previous = null; }
  }

  const res = assembleInventory({ feature: opts.feature, candidates, parts, previous });
  const all = [...failures, ...res.failures];
  const ok = all.length === 0;
  if (ok && !opts.check) await writeJsonAtomic(inventoryPath, res.inventory);

  const summary = `${ok ? (opts.check ? 'would write' : 'wrote') : 'not written'} ${inventoryPath}: ` +
    `${res.counts.candidates} candidates (${res.counts.mapped} mapped, ${res.counts.excluded} excluded), ${res.counts.states} states`;
  if (opts.json) {
    print(JSON.stringify({ ok, exit: ok ? 0 : 1, failures: all, lines: [summary, ...res.notes], data: { counts: res.counts, diff: res.diff, path: inventoryPath } }));
  } else {
    for (const f of all) print(`FAIL ${f.code} ${f.message}`);
    print(summary);
    for (const n of res.notes) print(`NOTE ${n}`);
    if (res.diff) {
      for (const k of ['added', 'removed', 'changed']) if (res.diff[k].length) print(`${k.toUpperCase()} ${res.diff[k].join(' ')}`);
    }
  }
  return ok ? 0 : 1;
}

/**
 * Was this file run, rather than imported? Both sides are resolved through the filesystem first.
 *
 * A PLUGIN IS REACHED THROUGH A SYMLINK, AND A SYMLINK BROKE THIS SILENTLY. `import.meta.url`
 * is always the real path; `process.argv[1]` is the path the caller typed. Installed from a
 * marketplace that links to a checkout, the two differ, this guard is false, `main` never runs —
 * and the script exits 0 having printed nothing and written nothing. A silent no-op that reports
 * success is the worst failure shape there is: the phase it belongs to just looks finished.
 * Found on the first real run of it, 2026-09-21.
 */
function runDirectly() {
  const arg = process.argv[1];
  if (!arg) return false;
  try { return pathToFileURL(realpathSync(arg)).href === import.meta.url; } catch { return false; }
}

if (runDirectly()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    process.stdout.write(`FAIL internal ${err.message}\n`);
    process.exitCode = 1;
  });
}
