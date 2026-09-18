// M5 (style parity) and M6 (layout relations) on marker elements, design dom against live dom
// (spec 8.1). Both are advisory until the replay of spec 20.3 proves them: runChecks files their
// output as hints for the auditors, never as findings that gate.

import { BUILD_CLASSES } from '../plan/check.mjs';
import { foldTypography, excerpt } from './text.mjs';

const norm = (s) => foldTypography(s ?? '').toLowerCase();
const ROLE_ALIASES = { a: 'link', link: 'link', button: 'button', select: 'select', combobox: 'select', listbox: 'select', checkbox: 'checkbox', switch: 'switch', tab: 'tab', textbox: 'textbox', input: 'textbox' };

function parseColor(c) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(String(c));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/** Colours within this distance count as the same design token. */
export const COLOR_TOLERANCE = 24;
function colorDistance(a, b) {
  const x = parseColor(a), y = parseColor(b);
  if (!x || !y) return a === b ? 0 : Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
const roleOf = (e) => ROLE_ALIASES[e.role ?? ''] ?? ROLE_ALIASES[e.tag ?? ''] ?? e.role ?? null;

/**
 * Marker elements of a row found on both sides: by text marker, then by test id (the design side
 * matched by the live element's text, since design renders carry no test ids).
 */
export function pairMarkers(row, designDom, liveDom) {
  const pairs = [];
  const byText = (dom, t) => (dom?.elements ?? []).find((e) => e.visible !== false && (norm(e.text) === norm(t) || norm(e.name) === norm(t)));
  const used = new Set();
  for (const t of row.markers?.text ?? []) {
    const d = byText(designDom, t);
    const l = byText(liveDom, t);
    if (d && l && !used.has(l)) { used.add(l); pairs.push({ label: t, design: d, live: l }); }
  }
  for (const id of row.markers?.testids ?? []) {
    const l = (liveDom?.elements ?? []).find((e) => e.testid === id && e.visible !== false);
    if (!l || used.has(l) || !l.text) continue;
    const d = byText(designDom, l.text);
    if (d) { used.add(l); pairs.push({ label: id, design: d, live: l }); }
  }
  return pairs;
}

/** Pure M5 over one state's pairs. */
export function styleDiffs(pairs) {
  const out = [];
  for (const { label, design: d, live: l } of pairs) {
    const ds = d.style, ls = l.style;
    const diffs = [];
    if (ds.fontClass !== ls.fontClass) diffs.push(`font ${ls.fontClass}, design ${ds.fontClass}`);
    if (Math.abs(ds.fontSize - ls.fontSize) > 1) diffs.push(`size ${ls.fontSize}px, design ${ds.fontSize}px`);
    if (ds.fontWeight !== ls.fontWeight) diffs.push(`weight ${ls.fontWeight}, design ${ds.fontWeight}`);
    if ((ds.textTransform || 'none') !== (ls.textTransform || 'none')) diffs.push(`transform ${ls.textTransform}, design ${ds.textTransform}`);
    if (Math.abs((ds.letterSpacing ?? 0) - (ls.letterSpacing ?? 0)) > 0.5) diffs.push(`letter spacing ${ls.letterSpacing}px, design ${ds.letterSpacing}px`);
    if (colorDistance(ds.color, ls.color) > COLOR_TOLERANCE) diffs.push(`colour ${ls.color}, design ${ds.color}`);
    if (d.icon && !l.icon) diffs.push('no icon, the design has one');
    const dr = roleOf(d), lr = roleOf(l);
    if (dr && lr && dr !== lr) diffs.push(`a ${lr}, the design has a ${dr}`);
    if (diffs.length) out.push({ label, diffs });
  }
  return out;
}

function relation(a, b) {
  const A = a.box, B = b.box;
  const inside = (x, y) => x.x >= y.x - 1 && x.y >= y.y - 1 && x.x + x.w <= y.x + y.w + 1 && x.y + x.h <= y.y + y.h + 1;
  if (inside(A, B)) return 'inside';
  if (inside(B, A)) return 'contains';
  if (A.y + A.h <= B.y + 1) return 'above';
  if (B.y + B.h <= A.y + 1) return 'below';
  if (A.x + A.w <= B.x + 1) return 'left of';
  if (B.x + B.w <= A.x + 1) return 'right of';
  return 'overlapping';
}

/** Pure M6 at desktop width: relations between top-level marker pairs that changed. */
export function layoutDiffs(pairs) {
  const top = pairs.filter((p) => !pairs.some((q) => q !== p && relation(p.design, q.design) === 'inside'));
  const out = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const d = relation(top[i].design, top[j].design);
      const l = relation(top[i].live, top[j].live);
      if (d !== l) out.push({ a: top[i].label, b: top[j].label, design: d, live: l });
    }
  }
  return out;
}

/** Pure M6 at phone width: overflow, clipped controls, labels that wrap where the design's do not. */
export function phoneProblems(liveDom, designDom) {
  const out = [];
  if (liveDom.document.scrollWidth > liveDom.document.clientWidth + 1) out.push({ what: 'overflow', detail: `the page scrolls sideways (${liveDom.document.scrollWidth}px in ${liveDom.document.clientWidth}px)` });
  for (const e of liveDom.elements) {
    if (e.kind !== 'control' || e.visible === false) continue;
    if (e.clipped) out.push({ what: 'clipped', detail: `control "${excerpt(e.name || e.text, 60)}" is clipped` });
    if (e.lines > 1) {
      const d = (designDom?.elements ?? []).find((x) => norm(x.text) === norm(e.text));
      if (!d || d.lines <= 1) out.push({ what: 'wraps', detail: `control "${excerpt(e.name || e.text, 60)}" wraps onto ${e.lines} lines` });
    }
  }
  return out;
}

async function statePairs(env) {
  const designWorlds = new Set((env.plan?.worlds ?? []).filter((w) => w.kind === 'design').map((w) => w.id));
  const out = [];
  const seen = new Set();
  for (const it of env.capture.items) {
    const { item } = it;
    if (!designWorlds.has(item.world) || item.locale !== env.primaryLocale || item.status !== 'reached' || seen.has(item.state)) continue;
    const row = env.rows.get(item.state);
    if (!row || !BUILD_CLASSES.has(row.class)) continue;
    const [design, liveDom] = [await env.design(item.state), await it.dom()];
    if (!design.dom || !liveDom) continue;
    seen.add(item.state);
    out.push({ it, row, designDom: design.dom, liveDom });
  }
  return out;
}

export const M5 = {
  id: 'M5',
  needsCapture: true,
  advisory: true,
  async run(env) {
    const hints = [];
    const unloaded = new Set();
    for (const it of env.capture.items) {
      const dom = await it.dom();
      for (const f of dom?.fonts ?? []) if (!f.loaded) unloaded.add(f.family);
    }
    if (unloaded.size) {
      hints.push(env.finding('M5', { rule: 'font-not-loaded', state: 'run', where: `${env.capture.runId}#fonts`, severity: 'P2', design: 'every font loaded', live: `not loaded: ${[...unloaded].sort().join(', ')}` }));
    }
    for (const { it, row, designDom, liveDom } of await statePairs(env)) {
      for (const d of styleDiffs(pairMarkers(row, designDom, liveDom))) {
        hints.push(env.finding('M5', { rule: 'style', state: row.id, where: `${it.item.files.dom}#${d.label}`, severity: 'P2', design: 'the design\'s style', live: `${d.label}: ${d.diffs.join('; ')}` }));
      }
    }
    return { findings: [], hints, failures: [] };
  },
};

export const M6 = {
  id: 'M6',
  needsCapture: true,
  advisory: true,
  async run(env) {
    const hints = [];
    const phone = env.profile.audit?.phoneWidth ?? 390;
    for (const { it, row, designDom, liveDom } of await statePairs(env)) {
      if (it.item.width <= phone) continue;
      for (const d of layoutDiffs(pairMarkers(row, designDom, liveDom))) {
        hints.push(env.finding('M6', { rule: 'relation', state: row.id, where: `${it.item.files.dom}#${d.a}~${d.b}`, severity: 'P2', design: `${d.a} ${d.design} ${d.b}`, live: `${d.a} ${d.live} ${d.b}` }));
      }
    }
    const seen = new Set();
    for (const it of env.capture.items) {
      if (it.item.width > phone || it.item.status !== 'reached') continue;
      const dom = await it.dom();
      if (!dom) continue;
      const design = await env.design(it.item.state);
      for (const p of phoneProblems(dom, design.dom)) {
        const key = `${it.item.state}|${p.what}|${p.detail}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hints.push(env.finding('M6', { rule: `phone-${p.what}`, state: it.item.state, where: `${it.item.files.dom}#${p.what}`, severity: 'P2', design: 'fits the phone width', live: p.detail }));
      }
    }
    return { findings: [], hints, failures: [] };
  },
};
