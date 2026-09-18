// In-flight builder records (spec 4.5 dispatch, 11.3 step 3). Owner: slice A1 (docs/ARCHITECTURE.md).
// state.json records a unit before its builder is dispatched, so a resumed session can tell a
// finished unit (report written) from a dead builder (commits, no report) from one never started.

import { UsageError } from '../core/exit.mjs';
import { assertFileId } from '../core/paths.mjs';
import { formatEvent, loadState, updateState } from '../core/state.mjs';

/**
 * Record that a builder is about to be dispatched for a unit (state.inFlight, journalled).
 * Called by wave start (A2), which writes each unit file and records it before the main session dispatches.
 * A second record for the same unit replaces the first: a "continue on branch" re-dispatch.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ unit: string, agent: string, branch: string, brief: string, report: string }} rec
 * @returns {Promise<void>}
 */
export async function recordDispatch(ctx, rec) {
  const paths = ctx.requirePaths();
  const unit = assertFileId(rec?.unit, 'unit id');
  for (const k of ['agent', 'branch', 'brief', 'report']) {
    if (typeof rec[k] !== 'string' || !rec[k].trim()) throw new UsageError(`recordDispatch: ${k} is required for unit ${unit}`);
  }
  const at = ctx.clock.now().toISOString();
  const entry = { unit, agent: rec.agent, branch: rec.branch, brief: rec.brief, report: rec.report, at };
  await updateState(
    paths,
    (s) => ({ ...s, inFlight: [...s.inFlight.filter((r) => r.unit !== unit), entry] }),
    { at, event: formatEvent({ command: `dispatch ${unit}`, counts: { agent: rec.agent, branch: rec.branch } }), inputs: entry, outputs: {} },
  );
}

/**
 * Remove a unit's in-flight record once it is merged (journalled). Called by wave merge (A2).
 * Clearing a unit that has no record changes nothing and journals nothing.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} unit
 * @returns {Promise<void>}
 */
export async function clearDispatch(ctx, unit) {
  const paths = ctx.requirePaths();
  assertFileId(unit, 'unit id');
  const current = await loadState(paths.state);
  if (!current.inFlight.some((r) => r.unit === unit)) return;
  const at = ctx.clock.now().toISOString();
  await updateState(
    paths,
    (s) => ({ ...s, inFlight: s.inFlight.filter((r) => r.unit !== unit) }),
    { at, event: formatEvent({ command: `undispatch ${unit}` }), inputs: { unit }, outputs: {} },
  );
}
