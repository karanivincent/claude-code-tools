// Typed, validated reads and writes of every run artefact by name, so each slice reads another
// slice's output through one door. state.json goes through state.mjs and the safety file
// through profile.mjs (read-only); both are refused here.

import { assertValid } from './schema.mjs';
import { readJson, writeJsonAtomic } from './fs.mjs';
import { sha256File } from './hash.mjs';
import { UsageError, EXIT } from './exit.mjs';

/**
 * name -> { schema, path(paths, key) }. key is the unit id, capture run id or state id where needed.
 * exit is the code for a file that exists but is invalid: 5 for files only the CLI writes.
 */
export const ARTEFACTS = Object.freeze({
  intent: { schema: 'intent', path: (p) => p.intentJson, exit: EXIT.USAGE },
  inventory: { schema: 'inventory', path: (p) => p.inventory, exit: EXIT.USAGE },
  baseline: { schema: 'baseline', path: (p) => p.baseline, exit: EXIT.USAGE },
  'baseline-head': { schema: 'baseline', path: (p) => p.baselineHead, exit: EXIT.INCONSISTENT },
  plan: { schema: 'plan', path: (p) => p.plan, exit: EXIT.USAGE },
  preflight: { schema: 'preflight', path: (p) => p.preflight, exit: EXIT.INCONSISTENT },
  candidates: { schema: 'candidates', path: (p) => p.candidates, exit: EXIT.INCONSISTENT },
  sidefx: { schema: 'sidefx', path: (p) => p.sidefx, exit: EXIT.INCONSISTENT },
  seedplan: { schema: 'seedplan', path: (p) => p.seedplan, exit: EXIT.INCONSISTENT },
  'unit-file': { schema: 'unit-file', path: (p, id) => p.unitFile(id), exit: EXIT.INCONSISTENT },
  'unit-report': { schema: 'unit-report', path: (p, id) => p.unitReport(id), exit: EXIT.USAGE },
  capture: { schema: 'capture', path: (p, runId) => p.captureManifest(runId), exit: EXIT.INCONSISTENT },
  findings: { schema: 'findings', path: (p) => p.findings, exit: EXIT.USAGE },
  ready: { schema: 'ready', path: (p) => p.ready, exit: EXIT.INCONSISTENT },
  'design-dom': { schema: 'dom', path: (p, stateId) => p.designRender(stateId, 'dom.json'), exit: EXIT.INCONSISTENT },
});

function entry(name) {
  const a = ARTEFACTS[name];
  if (!a) throw new UsageError(`unknown artefact "${name}" (state and safety have their own modules)`);
  return a;
}

/**
 * @param {import('./paths.mjs').FeaturePaths} paths
 * @param {keyof typeof ARTEFACTS} name
 * @param {{ key?: string, optional?: boolean }} [opts]
 * @returns {Promise<any|null>} null only when optional and absent
 */
export async function readArtefact(paths, name, opts = {}) {
  const a = entry(name);
  const path = a.path(paths, opts.key);
  const value = await readJson(path, { optional: opts.optional, exit: a.exit });
  if (value === null) return null;
  return assertValid(a.schema, value, { exit: a.exit, label: path });
}

/**
 * Validate, then write atomically. Returns the path written.
 * @param {import('./paths.mjs').FeaturePaths} paths
 * @param {keyof typeof ARTEFACTS} name
 * @param {unknown} value
 * @param {{ key?: string }} [opts]
 */
export async function writeArtefact(paths, name, value, opts = {}) {
  const a = entry(name);
  const path = a.path(paths, opts.key);
  assertValid(a.schema, value, { exit: EXIT.USAGE, label: `${name} (not written)` });
  await writeJsonAtomic(path, value);
  return path;
}

/** sha256 of an artefact's bytes on disk, or "absent" (the ready.json inputs convention). */
export async function artefactHash(paths, name, opts = {}) {
  try { return await sha256File(entry(name).path(paths, opts.key)); } catch (err) {
    if (err.code === 'ENOENT') return 'absent';
    throw err;
  }
}
