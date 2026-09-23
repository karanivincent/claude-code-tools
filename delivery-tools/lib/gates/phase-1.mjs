// Phase 1 gate (preflight), spec 3.4: advance refuses unless every probe is green, or became a wave-0 task, or carries a named founder waiver where waivable.
// Owner: slice A1 (docs/ARCHITECTURE.md).
//
// Recomputed from sources, never from a recorded verdict. Parts:
//   preflight  preflightGate (lib/lifecycle/preflight.mjs, A2), minus the red probes the founder
//              waived with `delivery waive` (state.waivers). A waiver is his decision, not a verdict,
//              and only a probe PROBES marks waivable can be waived.

import { PASS, gateResult } from '../core/gate.mjs';
import { PROBES, preflightGate } from '../lifecycle/preflight.mjs';
import { dep, partsResult, safePart } from '../run/compose.mjs';
import { readRunState } from '../run/context.mjs';

export const PHASE = 1;
export const RULE = "every probe is green, or became a wave-0 task, or carries a named founder waiver where waivable";
export const PARTS = Object.freeze(['preflight']);

/** The probe a preflight failure is about: its code (P13), or a message that starts with one. */
export function probeOf(failure) {
  if (/^P\d{1,2}$/.test(failure.code)) return failure.code;
  return String(failure.message).match(/^(P\d{1,2})\b/)?.[1] ?? null;
}

/**
 * Drop the failures of probes that are waivable and waived (pure).
 * @param {import('../core/gate.mjs').GateResult} result
 * @param {{ probe: string, note: string }[]} waivers
 * @param {ReadonlyArray<{ id: string, waivable: boolean }>} probes
 * @returns {{ result: import('../core/gate.mjs').GateResult, waived: string[] }}
 */
export function applyWaivers(result, waivers, probes = PROBES) {
  if (result.ok) return { result, waived: [] };
  const waivable = new Set(probes.filter((p) => p.waivable).map((p) => p.id));
  const notes = new Map(waivers.filter((w) => waivable.has(w.probe)).map((w) => [w.probe, w.note]));
  const kept = [];
  const waived = [];
  for (const f of result.failures) {
    const p = probeOf(f);
    if (p && notes.has(p)) waived.push(`${p} waived: ${notes.get(p)}`);
    else kept.push(f);
  }
  return { result: kept.length ? gateResult(kept, result.exit) : PASS, waived: [...new Set(waived)] };
}

/** @returns {Promise<import('../run/compose.mjs').Part[]>} */
export async function evaluate(ctx) {
  let waived = [];
  const result = await safePart('preflight', async () => {
    const raw = await dep(ctx, 'preflightGate', preflightGate)(ctx);
    if (raw?.ok) return raw;
    const state = await readRunState(ctx);
    const applied = applyWaivers(raw, state.waivers, dep(ctx, 'PROBES', PROBES));
    waived = applied.waived;
    return applied.result;
  });
  return [{ id: 'preflight', result, notes: waived }];
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<import('../core/gate.mjs').GateResult>}
 */
export async function gate(ctx) {
  return partsResult(await evaluate(ctx));
}
