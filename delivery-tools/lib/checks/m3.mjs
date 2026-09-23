// M3: reach (spec 6.2, 8.1). Every seeded state, and every action state the capture answers by an
// intercept, must be captured and reached in its world and role: markers present, no forbidden
// marker, not identical to a sibling, served SHA right. The per-item verdicts come from the capture
// validator (slice C's validateCaptureItems), which re-reads the files and never trusts
// capture.json's own status; this check adds coverage (a state never captured at all) and turns
// each state not reached into one P1.

import { validateCaptureItems } from '../capture/validate.mjs';
import { BUILD_CLASSES } from '../plan/check.mjs';
import { excerpt } from './text.mjs';

/** Rows a capture must reach: built, and seeded or answered by an intercept (spec 6.1). */
export function capturedRows(plan) {
  return (plan?.rows ?? []).filter((r) => BUILD_CLASSES.has(r.class) && r.reach
    && (r.reach.class === 'seeded' || (r.reach.class === 'action' && r.reach.intercept)));
}

/**
 * The rows this capture run is expected to cover, by mode (spec 9): baseline and real-org runs
 * owe none; branch runs owe the states they captured plus any the caller names (the unit's);
 * wave runs owe the states of units in waves up to the run's current wave; full and staging owe all.
 * @param {object} env
 * @param {{ unitStates?: string[] }} [opts]
 */
export function expectedRows(env, opts = {}) {
  const mode = env.capture?.doc.mode;
  const rows = capturedRows(env.plan);
  if (mode === 'baseline' || mode === 'real-org') return [];
  if (mode === 'branch') {
    const inRun = new Set(env.capture.items.map((i) => i.item.state));
    for (const s of opts.unitStates ?? []) inRun.add(s);
    return rows.filter((r) => inRun.has(r.id));
  }
  if (mode === 'wave' && Number.isInteger(env.state?.wave)) {
    const units = new Map((env.plan?.units ?? []).map((u) => [u.id, u]));
    return rows.filter((r) => (units.get(r.owner)?.wave ?? 0) <= env.state.wave);
  }
  return rows;
}

/**
 * Pure: findings from the validator's verdicts and the expected rows.
 * @param {object} env
 * @param {import('../capture/validate.mjs').ItemVerdict[]} verdicts
 * @param {object[]} expected rows
 */
export function reachFindings(env, verdicts, expected) {
  const findings = [];
  const mine = verdicts.filter((v) => !env.isRealOrg(v) && env.rows.get(v.state)?.class !== 'cut');
  const groups = new Map();
  for (const v of mine) {
    const k = `${v.state}.${v.world}.${v.role}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  for (const [k, list] of groups) {
    const bad = list.filter((v) => v.status !== 'reached');
    if (!bad.length) continue;
    const v = bad[0];
    const variants = bad.map((b) => `${b.width}/${b.locale}/${b.theme}${b.why ? ` (${b.why})` : ''}`);
    findings.push(env.finding('M3', {
      rule: 'not-reached',
      state: v.state,
      where: k,
      design: 'the state reached, with its markers',
      live: excerpt(`not reached in ${bad.length} of ${list.length} captures: ${variants.join('; ')}`, 600),
    }));
  }
  for (const r of expected) {
    const k = `${r.id}.${r.reach.world}.${r.reach.role}`;
    if (groups.has(k)) continue;
    findings.push(env.finding('M3', {
      rule: 'not-captured',
      state: r.id,
      where: k,
      design: `captured in world ${r.reach.world} as ${r.reach.role}`,
      live: 'no capture of this state in this run',
    }));
  }
  return findings;
}

export default {
  id: 'M3',
  needsCapture: true,
  async run(env, opts = {}) {
    const validate = opts.validateCaptureItems ?? validateCaptureItems;
    const verdicts = await validate(env.ctx, env.capture.runId);
    const expected = expectedRows(env, opts);
    const scope = new Set([...env.capture.items.map((i) => i.item.state), ...expected.map((r) => r.id)]);
    // A state the plan no longer captures (now prop, unseedable or cut, or gone from the plan) can
    // never be re-captured, so its old reach finding would stay open for ever and hold every gate
    // and merge of its owner. The row's own verification (a component test, a cut issue) owns it now.
    const captured = new Set(capturedRows(env.plan).map((r) => r.id));
    return { findings: reachFindings(env, verdicts, expected), failures: [], inScope: (f) => scope.has(f.state) || !captured.has(f.state) };
  },
};
