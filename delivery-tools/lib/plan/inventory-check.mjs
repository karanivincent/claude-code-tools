// inventory check (spec 4.2 step 5). Owner: slice B1 (docs/ARCHITECTURE.md). checkInventory is
// pure; inventoryGate reads the files, looks for the render files on disk and composes it.
//
// "No controls" must be said, not implied: a state with no controls lists exactly one control whose
// role is "none" (label free, target "none", effect "none"). An empty list is a state nobody looked at.

import { isAbsolute, join } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { exists } from '../core/fs.mjs';
import { gateResult } from '../core/gate.mjs';
import { designTreeSha256 } from '../../adapters/design/index.mjs';

const RENDER_EXTS = Object.freeze(['txt', 'dom.json', 'png']);

/**
 * @param {{
 *   inventory: object, candidates?: object|null, intent?: object|null, baseline?: object|null,
 *   snapshotTree?: string|null,
 *   renderExists?: (stateId: string, ext: string, declared: string|undefined) => boolean,
 * }} input  snapshotTree is the snapshot's own designTreeSha256, hashed the way the candidates
 *   were; renderExists defaults to "yes" (pure callers that do not check the disk)
 * @returns {import('../core/gate.mjs').GateFailure[]}
 */
export function checkInventory({ inventory, candidates = null, intent = null, baseline = null, snapshotTree = null, renderExists = () => true }) {
  const out = [];
  const fail = (code, message) => out.push({ code, message });
  const states = new Map();
  for (const s of inventory.states ?? []) {
    if (states.has(s.id)) fail('inventory-duplicate', `state ${s.id} is listed twice`);
    states.set(s.id, s);
  }

  if (candidates && candidates.designTreeSha256 !== inventory.designTreeSha256) {
    fail('inventory-stale', `inventory is for design tree ${inventory.designTreeSha256.slice(0, 12)}, candidates for ${candidates.designTreeSha256.slice(0, 12)}: re-run the inventory on the current design`);
  }
  // TWO HASHES OF TWO DIFFERENT THINGS ARE NOT A FRESHNESS CHECK. This used to compare
  // `intent.design.treeSha256` — intake's hash of the EXPORT as delivered, `support.js` and all —
  // with the inventory's, which is `designTreeSha256(snapshotDir)`: the SNAPSHOT, whose runtime is
  // zipped, with every loose `.js` ignored. The two can never be equal, so `inventory check` could
  // never pass, for any design. Found on the first real run of phase 2, 2026-09-21. The caller now
  // hashes the snapshot the same way the candidates did, and that is what is compared.
  if (snapshotTree && snapshotTree !== inventory.designTreeSha256) {
    fail('inventory-stale', `inventory is for design tree ${inventory.designTreeSha256.slice(0, 12)}, but the snapshot is ${snapshotTree.slice(0, 12)}: re-run the inventory on the current design`);
  }

  const inv = new Map();
  for (const c of inventory.candidates ?? []) {
    if (inv.has(c.id)) fail('candidate-duplicate', `candidate ${c.id} is listed twice in the inventory`);
    inv.set(c.id, c);
    if (c.mappedTo) {
      if (!states.has(c.mappedTo)) fail('candidate-mapped-unknown', `candidate ${c.id} (${c.source}) is mapped to ${c.mappedTo}, which is not a state`);
    } else if (!c.excluded?.reason?.trim()) {
      fail('candidate-unmapped', `candidate ${c.id} (${c.kind}, ${c.source}) is neither mapped to a state nor excluded with a reason`);
    }
  }
  for (const c of candidates?.candidates ?? []) {
    if (!inv.has(c.id)) fail('candidate-missing', `candidate ${c.id} (${c.kind}, ${c.source}${c.detail ? `: ${c.detail}` : ''}) is not in the inventory; map it to a state or exclude it with a reason`);
  }

  for (const s of states.values()) {
    const where = `state ${s.id} (${s.screen}: ${s.name})`;
    // A SHOT IS A DESIGN REFERENCE WHATEVER THE REACH KIND, which is what this rule's own message
    // has always said and what the code did not do. Every design has exactly one state you reach by
    // arriving — a click-path with no steps — and it is referenced by its picture. Under the old
    // reading that state could never pass, for any design. Found on the first real run, 2026-09-21.
    const reachOk = (s.reach.kind === 'click-path' && (s.reach.steps ?? []).length)
      || (s.reach.kind === 'prop' && s.reach.props && Object.keys(s.reach.props).length)
      || (s.reach.kind === 'unspecified' && s.reach.unspecified)
      || (s.shots ?? []).length > 0;
    if (!reachOk) fail('state-no-reference', `${where} has no design reference: click steps, prop values, a shot, or the kind of undrawn state`);
    if (s.render.status === 'impossible') {
      if (!s.render.why?.trim()) fail('state-no-render', `${where} is impossible to render but gives no reason`);
    } else {
      if (s.reach.kind === 'unspecified') fail('state-no-render', `${where} is undrawn (${s.reach.unspecified}), so its render must be impossible with a reason`);
      const missing = RENDER_EXTS.filter((ext) => !renderExists(s.id, ext, s.render[ext === 'dom.json' ? 'dom' : ext]));
      if (missing.length) fail('state-no-render', `${where} has no design render (${missing.map((e) => `${s.id}.${e}`).join(', ')} missing); run delivery design render or mark it impossible with a reason`);
    }
    const controls = s.controls ?? [];
    if (!controls.length) fail('state-no-controls', `${where} lists no controls; list them, or write one control with role "none" to say it has none`);
    const explicitNone = controls.some((c) => c.role === 'none');
    if (explicitNone && controls.length > 1) fail('state-controls-invalid', `${where} says it has no controls but lists ${controls.length - 1} more`);
    for (const c of controls) {
      if (c.role === 'none') continue;
      if (!String(c.label ?? '').trim()) fail('control-invalid', `${where}: a ${c.role} control has no label`);
      if (!c.target) fail('control-invalid', `${where}: control "${c.label}" has no target`);
      else if (c.target !== 'external' && c.target !== 'none' && !states.has(c.target)) fail('control-invalid', `${where}: control "${c.label}" leads to ${c.target}, which is not a state`);
      if (!c.effect) fail('control-invalid', `${where}: control "${c.label}" has no effect class`);
    }
  }

  if (intent?.redesign) {
    if (!baseline) fail('baseline-missing', 'the intent says redesign but there is no baseline.json');
    for (const c of baseline?.capabilities ?? []) {
      if (!String(c.signature ?? '').trim()) fail('capability-invalid', `capability ${c.id} has no signature`);
      const ev = c.evidence ?? [];
      if (!ev.length || ev.some((e) => !e.file || !(e.line >= 1))) fail('capability-invalid', `capability ${c.id} (${c.signature}) has no file:line evidence`);
    }
  }
  return out;
}

/**
 * Phase-2 gate input: every candidate in candidates.json is in inventory.candidates, mapped or
 * excluded with a reason; every state has an id, a design reference, a render (render files
 * present) or an impossible reason, and a control or an explicit none; every control has a target
 * and an effect class; for a redesign, every capability has a signature and evidence.
 * Called by lib/gates/phase-2.mjs (A1) and the inventory check command.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function inventoryGate(ctx) {
  const paths = ctx.requirePaths();
  const inventory = await readArtefact(paths, 'inventory', { optional: true });
  if (!inventory) return gateResult([{ code: 'inventory-missing', message: `no inventory at ${paths.inventory}; run the design-inventory skill` }]);
  const failures = [];
  const candidates = await readArtefact(paths, 'candidates', { optional: true });
  if (!candidates) failures.push({ code: 'candidates-missing', message: `no candidates at ${paths.candidates}; run delivery design candidates` });
  const intent = await readArtefact(paths, 'intent', { optional: true });
  const baseline = await readArtefact(paths, 'baseline', { optional: true });
  if (inventory.feature !== paths.feature) failures.push({ code: 'inventory-feature', message: `inventory.json is for feature ${inventory.feature}, not ${paths.feature}` });

  const present = new Set();
  for (const s of inventory.states ?? []) {
    if (s.render?.status !== 'ok') continue;
    for (const ext of RENDER_EXTS) {
      const declared = s.render[ext === 'dom.json' ? 'dom' : ext];
      const candidatesPaths = [paths.designRender(s.id, ext)];
      if (declared) candidatesPaths.unshift(isAbsolute(declared) ? declared : join(paths.designRenders, declared), join(paths.repoRoot, declared));
      for (const p of candidatesPaths) if (await exists(p)) { present.add(`${s.id}|${ext}`); break; }
    }
  }
  const snapshotTree = await designTreeSha256(paths.designSnapshot).catch(() => null);
  failures.push(...checkInventory({ inventory, candidates, intent, baseline, snapshotTree, renderExists: (id, ext) => present.has(`${id}|${ext}`) }));
  return gateResult(failures);
}
