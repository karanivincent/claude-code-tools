// M9: controls (spec 8.1), from the captured DOM of each reached state in the fixture worlds.
// Every planned control is on the page; one with no enabledWhen (or "always") is enabled; for the
// member role each control is hidden, disabled or enabled as the plan's permission says, and a
// state whose controls have a member rule is captured for a member when the run captures members.
//
// Clicks: when the capture clicked an item's controls it writes <key>.controls.json beside the
// item, one entry per control ({ testid, target, reached, why? }); a click whose target's markers
// did not appear is a dead control or a wrong target. Without that file, targets rest on M3
// reaching every target state. Only the primary locale in the light theme is checked (spec 9:
// other locales and dark get M3, M6, M7, M8, M10 and M16).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILD_CLASSES } from '../plan/check.mjs';
import { MEMBER_VARIANT_MODES, hiddenFromMembers } from '../capture/job.mjs';

const ALWAYS = new Set(['', 'always']);

function controlsIn(dom, testid) {
  return (dom?.elements ?? []).filter((e) => e.testid === testid && e.visible !== false);
}

/**
 * Pure: problems with one row's controls on one captured DOM.
 * @param {object} row plan row
 * @param {object} dom dom.json of the capture
 * @param {'admin'|'member'} role
 * @returns {{ rule: string, testid: string, live: string, design: string }[]}
 */
export function controlProblems(row, dom, role) {
  const out = [];
  for (const c of row.controls ?? []) {
    if (!c.testid) continue;
    // A control may carry its own member rule, and it wins: a screen where a member sees the tabs
    // and the rows but not the button that creates one cannot be described by a single rule for
    // the whole row, and the row's rule then says a member sees a control that is not there.
    const member = role === 'member' ? c.permission?.member ?? row.permission?.member ?? null : null;
    const els = controlsIn(dom, c.testid);
    const present = els.length > 0;
    const disabled = present && els.every((e) => e.disabled === true);
    if (member === 'hidden') {
      if (present) out.push({ rule: 'member-treatment', testid: c.testid, design: 'hidden for a member', live: `"${c.label}" is shown to a member${disabled ? ' (disabled)' : ''}` });
      continue;
    }
    if (!present) {
      out.push(member
        ? { rule: 'member-treatment', testid: c.testid, design: `shown ${member} to a member`, live: `"${c.label}" is not on the page for a member` }
        : { rule: 'control-missing', testid: c.testid, design: `"${c.label}" on the page`, live: `no element with test id ${c.testid}` });
      continue;
    }
    if (member === 'disabled') {
      if (!disabled) out.push({ rule: 'member-treatment', testid: c.testid, design: 'disabled for a member', live: `"${c.label}" is enabled for a member` });
      continue;
    }
    const mustBeEnabled = member === 'enabled' || ALWAYS.has(String(c.enabledWhen ?? '').trim().toLowerCase());
    if (mustBeEnabled && disabled) {
      out.push({ rule: member ? 'member-treatment' : 'wrongly-disabled', testid: c.testid, design: member ? 'enabled for a member' : 'enabled', live: `"${c.label}" is disabled` });
    }
  }
  return out;
}

/**
 * The click results of one captured item, or null when the capture wrote none. Entries without a
 * test id are ignored; "ok" is read as "reached" for writers that use it.
 */
export async function clickResults(env, item) {
  const base = item.files.txt.replace(/\.txt$/, '');
  let list;
  try { list = JSON.parse(await readFile(join(env.capture.dir, `${base}.controls.json`), 'utf8')); } catch { return null; }
  if (!Array.isArray(list)) return null;
  return list.filter((c) => c && typeof c.testid === 'string').map((c) => ({
    testid: c.testid, target: c.target ?? null, reached: c.reached ?? c.ok ?? null, why: c.why ?? c.reason ?? null, verifyTarget: c.verifyTarget,
  }));
}

/** Pure: dead controls and wrong targets from click results, against the plan row's controls. */
export function clickProblems(row, clicks) {
  const out = [];
  for (const c of row.controls ?? []) {
    if (!c.testid || !(c.effect === 'none' || c.effect === 'free')) continue;
    const r = clicks.find((x) => x.testid === c.testid);
    if (!r || r.reached !== false) continue;
    // A control whose target this run could not judge is not a control that failed to reach it.
    if (r.verifyTarget === false) continue;
    const leadsSomewhere = c.target !== 'none' && c.target !== 'external';
    out.push({
      rule: leadsSomewhere && r.target && r.target !== c.target ? 'wrong-target' : 'dead-control',
      testid: c.testid,
      design: leadsSomewhere ? `"${c.label}" leads to ${c.target}` : `"${c.label}" works`,
      live: `clicking "${c.label}" ${r.why ? `did not reach it: ${r.why}` : 'did not reach its target'}`,
    });
  }
  return out;
}

export default {
  id: 'M9',
  needsCapture: true,
  async run(env) {
    const findings = [];
    const seen = new Set();
    let clicked = 0;
    // Only a mode that adds a member variant of every permission row can be judged for missing
    // one. A branch capture adds none: its only member items are rows whose own reach is a member,
    // and reading that as "this run captures members" made every other permission row a P1 the
    // unit gate could never clear -- eight of them, on a screen with a single member row.
    const capturesMembers = MEMBER_VARIANT_MODES.has(env.capture.doc?.mode);
    const memberStates = new Set(env.capture.items.filter((i) => i.item.role === 'member').map((i) => i.item.state));
    for (const it of env.capture.items) {
      const { item } = it;
      if (env.isRealOrg(item) || item.status !== 'reached' || item.locale !== env.primaryLocale || item.theme !== 'light') continue;
      const row = env.rows.get(item.state);
      // A copy of a row in a world the row does not name is captured as data, not as this state:
      // the messy world's copy exists to test the row's invariants, and its controls belong to the
      // world the row names. Asking the messy world for the one-widget line found no such element.
      if (row?.reach?.world && item.world !== row.reach.world) continue;
      if (!row || !BUILD_CLASSES.has(row.class) || !(row.controls ?? []).length) continue;
      const dom = await it.dom();
      if (!dom) continue;
      const role = item.role === 'member' ? 'member' : 'admin';
      const clicks = role === 'admin' ? await clickResults(env, item) : null;
      if (clicks) clicked++;
      for (const p of [...controlProblems(row, dom, role), ...(clicks ? clickProblems(row, clicks) : [])]) {
        const key = `${item.state}|${role}|${p.rule}|${p.testid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(env.finding('M9', { rule: p.rule, state: item.state, where: `${item.files.txt}#${role}:${p.testid}`, design: p.design, live: p.live }));
      }
    }
    if (capturesMembers) {
      const shutToMembers = hiddenFromMembers(env.plan);
      for (const row of env.plan?.rows ?? []) {
        if (!row.permission || !BUILD_CLASSES.has(row.class) || !(row.controls ?? []).length) continue;
        if (!env.capture.items.some((i) => i.item.state === row.id) || memberStates.has(row.id)) continue;
        // The same rule the job builds by: a state an admin reaches by clicking a control the plan
        // hides from members is a state no member capture can exist for, so it is not owed one.
        if ((row.reach?.steps ?? []).some((st) => st.click?.testid && shutToMembers.has(st.click.testid))) continue;
        findings.push(env.finding('M9', {
          rule: 'member-not-captured', state: row.id, where: `${row.id}#member`,
          design: `captured as a member (controls ${row.permission.member})`, live: 'no member capture of this state in this run',
        }));
      }
    }
    const files = new Set(env.capture.items.map((i) => i.item.files.txt));
    const states = new Set(env.capture.items.map((i) => i.item.state));
    return {
      findings,
      failures: [],
      notes: clicked ? [] : ['M9: this capture recorded no click results; control targets rest on M3 reaching every target state'],
      inScope: (f) => files.has(String(f.where).replace(/#.*$/, '')) || (f.rule === 'member-not-captured' && states.has(f.state)),
    };
  },
};
