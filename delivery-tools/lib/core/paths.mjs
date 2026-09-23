// Where every artefact of a run lives (spec D8, section 17). Committed, derived files go under
// docs/delivery/<feature>/; run state goes under .delivery/<feature>/ (gitignored). The design
// snapshot docs/design/<feature>/ is written once by intake and never edited.

import { join } from 'node:path';
import { UsageError } from './exit.mjs';

export const FEATURE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const UNIT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const DEFAULT_ROOTS = Object.freeze({
  designRoot: 'docs/design',
  deliveryRoot: 'docs/delivery',
  runRoot: '.delivery',
});

/** @param {string} feature */
export function assertFeatureSlug(feature) {
  if (!FEATURE_RE.test(String(feature ?? ''))) {
    throw new UsageError(`feature slug "${feature}" must match ${FEATURE_RE} (lowercase words and hyphens)`);
  }
  return feature;
}

/** @param {string} id a unit id, world id or capture run id used in a file name */
export function assertFileId(id, what = 'id') {
  if (!UNIT_ID_RE.test(String(id ?? ''))) throw new UsageError(`${what} "${id}" must match ${UNIT_ID_RE}`);
  return id;
}

/**
 * @typedef {object} FeaturePaths  absolute paths
 * @property {string} repoRoot
 * @property {string} feature
 * @property {string} designSnapshot   docs/design/<feature>/            (intake; never edited)
 * @property {string} deliveryDir      docs/delivery/<feature>/          (committed)
 * @property {string} intentDir        docs/delivery/<feature>/intent/   (uploads, --brief files, rounds/)
 * @property {string} intentJson       docs/delivery/<feature>/intent.json
 * @property {string} intentMd         docs/delivery/<feature>/intent.md
 * @property {string} inventory        docs/delivery/<feature>/inventory.json
 * @property {string} baseline         docs/delivery/<feature>/baseline.json
 * @property {string} plan             docs/delivery/<feature>/plan.json
 * @property {string} spec             docs/delivery/<feature>/spec.md   (rendered from plan.json)
 * @property {string} runDir           .delivery/<feature>/              (gitignored)
 * @property {string} state            .delivery/<feature>/state.json
 * @property {string} stateLock        .delivery/<feature>/state.lock
 * @property {string} preflight        .delivery/<feature>/preflight.json
 * @property {string} candidates       .delivery/<feature>/candidates.json
 * @property {string} designRenders    .delivery/<feature>/design/       (<ID>.png, <ID>.txt, <ID>.dom.json)
 * @property {string} designServe      .delivery/<feature>/design-serve/ (unzipped runtime, never committed)
 * @property {string} sidefx           .delivery/<feature>/sidefx.json
 * @property {string} seedplan         .delivery/<feature>/seedplan.json
 * @property {string} captures         .delivery/<feature>/captures/     (<runId>/capture.json and files)
 * @property {string} units            .delivery/<feature>/units/        (<id>.json, <id>.report.json)
 * @property {string} findings         .delivery/<feature>/findings.json
 * @property {string} ready            .delivery/<feature>/ready.json
 * @property {string} punchList        .delivery/<feature>/punch-list.html
 * @property {string} baselineHead     .delivery/<feature>/baseline-head.json (baseline --against output)
 * @property {(id: string) => string} unitFile
 * @property {(id: string) => string} unitReport
 * @property {(runId: string) => string} captureDir
 * @property {(runId: string) => string} captureManifest
 * @property {(stateId: string, ext: 'png'|'txt'|'dom.json') => string} designRender
 */

/**
 * @param {string} repoRoot absolute root of the worktree the run lives in
 * @param {string} feature
 * @param {{ designRoot?: string, deliveryRoot?: string, runRoot?: string }} [roots] profile.paths
 * @returns {FeaturePaths}
 */
export function featurePaths(repoRoot, feature, roots = {}) {
  assertFeatureSlug(feature);
  const r = { ...DEFAULT_ROOTS, ...pick(roots, ['designRoot', 'deliveryRoot', 'runRoot']) };
  const deliveryDir = join(repoRoot, r.deliveryRoot, feature);
  const runDir = join(repoRoot, r.runRoot, feature);
  const units = join(runDir, 'units');
  const captures = join(runDir, 'captures');
  const designRenders = join(runDir, 'design');
  return {
    repoRoot,
    feature,
    designSnapshot: join(repoRoot, r.designRoot, feature),
    deliveryDir,
    intentDir: join(deliveryDir, 'intent'),
    intentJson: join(deliveryDir, 'intent.json'),
    intentMd: join(deliveryDir, 'intent.md'),
    inventory: join(deliveryDir, 'inventory.json'),
    baseline: join(deliveryDir, 'baseline.json'),
    plan: join(deliveryDir, 'plan.json'),
    spec: join(deliveryDir, 'spec.md'),
    runDir,
    state: join(runDir, 'state.json'),
    stateLock: join(runDir, 'state.lock'),
    preflight: join(runDir, 'preflight.json'),
    candidates: join(runDir, 'candidates.json'),
    designRenders,
    designServe: join(runDir, 'design-serve'),
    sidefx: join(runDir, 'sidefx.json'),
    seedplan: join(runDir, 'seedplan.json'),
    captures,
    units,
    findings: join(runDir, 'findings.json'),
    ready: join(runDir, 'ready.json'),
    punchList: join(runDir, 'punch-list.html'),
    baselineHead: join(runDir, 'baseline-head.json'),
    unitFile: (id) => join(units, `${assertFileId(id, 'unit id')}.json`),
    unitReport: (id) => join(units, `${assertFileId(id, 'unit id')}.report.json`),
    captureDir: (runId) => join(captures, assertFileId(runId, 'capture run id')),
    captureManifest: (runId) => join(captures, assertFileId(runId, 'capture run id'), 'capture.json'),
    designRender: (stateId, ext) => join(designRenders, `${assertFileId(stateId, 'state id')}.${ext}`),
  };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && typeof obj[k] === 'string' && obj[k]) out[k] = obj[k];
  return out;
}
