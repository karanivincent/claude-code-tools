// M4: copy parity in the design world (spec 8.1). Every element of a state's design render must be
// present in its live capture after normalisation (typography, case, the shape of dates and times,
// phone numbers), unless the row is adapt (its product text is expected instead) or the words
// belong to a cut row. A missing control label or heading is P1, anything else P2.

import { BUILD_CLASSES } from '../plan/check.mjs';
import { parseElements, elementLocation, parityForm, containsWords, excerpt, foldTypography } from './text.mjs';

/** Words that belong to cut rows: their markers, control labels and copy. */
function cutTexts(plan) {
  const out = new Set();
  for (const r of plan?.rows ?? []) {
    if (r.class !== 'cut') continue;
    for (const t of [...(r.markers?.text ?? []), ...(r.controls ?? []).map((c) => c.label), ...(r.copy ?? []).map((c) => c.en)]) {
      if (t && t.trim()) out.add(parityForm(t));
    }
  }
  return out;
}

/** Adapt substitutions, design text to product text, in parity form (longest first). */
function adaptSubs(plan) {
  return (plan?.rows ?? []).filter((r) => r.class === 'adapt' && r.adapt?.designText)
    .map((r) => ({ from: parityForm(r.adapt.designText), to: parityForm(r.adapt.productText ?? ''), row: r.id }))
    .filter((s) => s.from)
    .sort((a, b) => b.from.length - a.from.length);
}

/** The rule for a missing design element, from the design render's dom when it has one. */
function ruleFor(text, dom) {
  const want = foldTypography(text).toLowerCase();
  const el = (dom?.elements ?? []).find((e) => foldTypography(e.text ?? '').toLowerCase() === want || foldTypography(e.name ?? '').toLowerCase() === want);
  if (!el) return 'missing-text';
  if (el.kind === 'control' || ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'combobox', 'option'].includes(el.role)) return 'missing-control-label';
  if (/^h[1-6]$/.test(el.tag) || el.role === 'heading') return 'missing-heading';
  return 'missing-text';
}

/**
 * Pure: the design elements missing from a live capture.
 * @param {{ designTxt: string, designDom?: object|null, liveTxt: string, cut?: Set<string>, subs?: { from: string, to: string }[] }} input
 * @returns {{ el: { line: number, cell: number|null, text: string }, rule: string, expected: string }[]}
 */
export function missingDesignText({ designTxt, designDom = null, liveTxt, cut = new Set(), subs = [] }) {
  const live = parseElements(liveTxt).map((e) => parityForm(e.text));
  const liveSet = new Set(live);
  const joined = live.join('\n');
  const joinedFlat = live.join(' ');
  const out = [];
  for (const el of parseElements(designTxt)) {
    let want = parityForm(el.text);
    if (!want || cut.has(want)) continue;
    for (const s of subs) if (want.includes(s.from)) want = want.split(s.from).join(s.to);
    if (!want.trim()) continue;
    if (liveSet.has(want) || containsWords(joined, want) || containsWords(joinedFlat, want)) continue;
    out.push({ el, rule: ruleFor(el.text, designDom), expected: want });
  }
  return out;
}

export default {
  id: 'M4',
  needsCapture: true,
  async run(env) {
    const findings = [];
    const notes = [];
    const cut = cutTexts(env.plan);
    const subs = adaptSubs(env.plan);
    const designWorlds = new Set((env.plan?.worlds ?? []).filter((w) => w.kind === 'design').map((w) => w.id));
    const checked = new Set();
    let noRender = 0;
    for (const it of env.capture.items) {
      const { item } = it;
      if (!designWorlds.has(item.world) || item.locale !== env.primaryLocale || item.status !== 'reached') continue;
      const row = env.rows.get(item.state);
      if (!row || !BUILD_CLASSES.has(row.class) || checked.has(item.state)) continue;
      checked.add(item.state);
      const design = await env.design(item.state);
      if (design.txt === null) { noRender++; continue; }
      const liveTxt = await it.txt();
      if (liveTxt === null) continue;
      for (const m of missingDesignText({ designTxt: design.txt, designDom: design.dom, liveTxt, cut, subs })) {
        findings.push(env.finding('M4', {
          rule: m.rule,
          state: item.state,
          where: `design/${item.state}.txt:${elementLocation(m.el)}`,
          design: excerpt(m.el.text),
          live: `absent from ${item.files.txt}`,
        }));
      }
    }
    if (noRender) notes.push(`M4: ${noRender} captured state(s) have no design render text; copy parity was not checked for them`);
    const inRun = new Set(env.capture.items.filter((i) => designWorlds.has(i.item.world)).map((i) => i.item.state));
    return { findings, failures: [], notes, inScope: (f) => inRun.has(f.state) };
  },
};
