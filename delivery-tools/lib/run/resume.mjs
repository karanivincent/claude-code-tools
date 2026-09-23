// Resume (spec 11.3 step 3): where every build unit stands, from files and git only. A report file
// means the builder finished; commits on the unit branch with no report mean it died, so it is
// continued on that branch; a record with no work means it is dispatched fresh. A unit that is
// merged or has a report is finished and is never dispatched again.

import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { parseEvent } from '../core/state.mjs';
import { unitGateStatus } from '../gate/unit.mjs';
import { dep, safePart } from './compose.mjs';
import { inWorktree } from './context.mjs';

/**
 * @typedef {'merged'|'reported'|'died'|'dispatched'|'pending'} UnitState
 * @typedef {{ unit: string, title: string, wave: number|null, kind: string|null, status: UnitState,
 *             branch: string|null, ahead: number, hasRecord: boolean, unitFile: string|null,
 *             brief: string|null, gateGreen: boolean|null }} UnitStatus
 */

/**
 * @param {{ merged: boolean, hasReport: boolean, hasRecord: boolean, ahead: number }} f
 * @returns {UnitState}
 */
export function classifyUnit({ merged, hasReport, hasRecord, ahead }) {
  if (merged) return 'merged';
  if (hasReport) return 'reported';
  if (ahead > 0) return 'died';
  if (hasRecord) return 'dispatched';
  return 'pending';
}

/** Units the journal shows merged by `wave merge <unit>` with exit 0 (A2 journals it). */
export function mergedInJournal(journal) {
  const out = new Set();
  for (const e of journal ?? []) {
    const { command, exit } = parseEvent(e.event);
    const m = command.match(/^wave merge (\S+)$/);
    if (m && exit === 0) out.add(m[1]);
  }
  return out;
}

/**
 * Head SHAs whose `ready` came out red since the run last entered "pr" (pure). One per fix wave
 * attempt: the first is the audit's own result, each later one a fix wave that left red behind.
 */
export function redReadyHeadsSincePr(journal) {
  let start = 0;
  (journal ?? []).forEach((e, i) => {
    const { command, exit } = parseEvent(e.event);
    if (command === 'advance pr' && exit === 0) start = i + 1;
  });
  const heads = [];
  for (const e of (journal ?? []).slice(start)) {
    const { command, exit, counts } = parseEvent(e.event);
    if (command === 'ready' && exit !== 0 && counts.sha && !heads.includes(counts.sha)) heads.push(counts.sha);
  }
  return heads;
}

async function countAhead(git, head, tip) {
  const r = await git.raw(['rev-list', '--count', `${head}..${tip}`]);
  return r.code === 0 ? Number(String(r.stdout).trim()) || 0 : 0;
}

async function firstParentSet(git) {
  const r = await git.raw(['rev-list', '--first-parent', '--max-count=20000', 'HEAD']);
  return new Set(r.code === 0 ? String(r.stdout).split('\n').filter(Boolean) : []);
}

/**
 * Every plan unit and every in-flight record, classified.
 * @param {object} ctx a ctx bound to the run's worktree
 * @param {object} state
 * @param {object|null} plan
 * @param {{ gates?: boolean }} [opts] gates: ask unitGateStatus (B1) about reported units
 * @returns {Promise<UnitStatus[]>}
 */
export async function unitStatuses(ctx, state, plan, opts = {}) {
  const paths = ctx.requirePaths();
  const git = ctx.git;
  const head = await git.revParse('HEAD');
  const journalMerged = mergedInJournal(state.journal);
  let firstParents = null;
  const ids = [...new Set([...(plan?.units ?? []).map((u) => u.id), ...state.inFlight.map((r) => r.unit)])];
  const out = [];
  for (const id of ids) {
    const unit = plan?.units.find((u) => u.id === id) ?? null;
    const rec = state.inFlight.find((r) => r.unit === id) ?? null;
    let unitFile = null;
    try { unitFile = await readArtefact(paths, 'unit-file', { key: id, optional: true }); } catch { unitFile = null; }
    const branch = rec?.branch ?? unitFile?.branch ?? null;
    const reports = [rec?.report, unitFile?.reportPath].filter(Boolean).map((p) => inWorktree(paths.repoRoot, p));
    reports.push(paths.unitReport(id));
    const hasReport = reports.some((p) => existsSync(p));
    const tip = branch ? await git.revParse(branch) : null;
    const ahead = tip && head ? await countAhead(git, head, tip) : 0;
    let merged = journalMerged.has(id);
    if (!merged && tip && head && ahead === 0 && hasReport && tip !== head) {
      // A --no-ff merge brings the unit's tip in as a second parent; a branch that never moved
      // sits on the first-parent chain instead.
      firstParents ??= await firstParentSet(git);
      merged = !firstParents.has(tip);
    }
    const status = classifyUnit({ merged, hasReport, hasRecord: Boolean(rec), ahead });
    let gateGreen = null;
    if (status === 'reported' && opts.gates !== false) {
      gateGreen = (await safePart(`unit ${id}`, () => dep(ctx, 'unitGateStatus', unitGateStatus)(ctx, id))).ok;
    }
    const unitFileRel = unitFile ? relative(paths.repoRoot, paths.unitFile(id)) : null;
    out.push({
      unit: id, title: unit?.title ?? '', wave: unit?.wave ?? null, kind: unit?.kind ?? null, status, branch, ahead,
      hasRecord: Boolean(rec), unitFile: unitFileRel, brief: rec?.brief ?? unitFileRel, gateGreen,
    });
  }
  return out;
}
