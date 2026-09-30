// Spike S1: can the plugin find a design's preset table by itself, and draw its states without hand edits?
// Read-only on the run: renders go to the scratchpad.
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const WT = '/Users/vince/Projects/Telitask/telitask-development/.claude/worktrees/delivery-settings-page';
const PLUGIN = '/Users/vince/Documents/Projects/claude-code-tools/delivery-tools';
const OUT = new URL('./s1-out/', import.meta.url).pathname;
const run = join(WT, '.delivery/settings-page');
const html = await readFile(join(run, 'design-serve/Telitask Dashboard.dc.html'), 'utf8');

// 1. Detect: a method `m(arg) { ... T[<something from arg>] ...}` where T is a top-level `const T = {`,
//    called somewhere as `this.m(this.props.P)`.
const tables = [...html.matchAll(/\bconst ([A-Z][A-Z0-9_]*) = \{/g)].map((m) => m[1]);
const found = [];
for (const m of html.matchAll(/\n\s*([a-zA-Z_$][\w$]*)\((\w+)\) \{/g)) {
  const [name, arg] = [m[1], m[2]];
  const body = html.slice(m.index, m.index + 600);
  const t = tables.find((T) => new RegExp(`\\b${T}\\[`).test(body));
  if (!t) continue;
  const call = new RegExp(`this\\.${name}\\(this\\.props\\.(\\w+)\\)`).exec(html);
  if (call) found.push({ method: name, arg, table: t, prop: call[1] });
}
console.log('detected:', found);
if (!found.length) process.exit(3);
const { table, prop } = found[0];

// Keys at depth 1 of the table literal.
const start = html.indexOf(`const ${table} = {`) + `const ${table} = `.length;
let depth = 0, i = start, keys = [], str = null;
for (; i < html.length; i++) {
  const c = html[i];
  if (str) { if (c === '\\') i++; else if (c === str) str = null; continue; }
  if (c === '"' || c === "'" || c === '`') { str = c; continue; }
  if (c === '{' || c === '[' || c === '(') depth++;
  else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) break; }
  else if (depth === 1) {
    const k = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/.exec(html.slice(i, i + 60));
    if (k && /[{,\s]/.test(html[i - 1] ?? ' ')) { keys.push(k[1] ?? k[2] ?? k[3]); i += k[0].length - 1; }
  }
}
keys = [...new Set(keys)];
const hand = JSON.parse(await readFile(join(run, 'cs-patches.json'), 'utf8'));
const handKeys = Object.keys(hand);
const missed = handKeys.filter((k) => !keys.includes(k));
console.log(`table ${table}: ${keys.length} keys; the run's hand list had ${handKeys.length}; missed ${missed.length}`, missed);

// 2. Render a sample through the plugin's own preset path, and compare with the hand-set renders.
const inv = JSON.parse(await readFile(join(WT, 'docs/delivery/settings-page/inventory.json'), 'utf8'));
const pairs = [];
for (const k of handKeys) {
  const st = inv.states.find((s) => s.reach?.steps?.length === 1 && isDeepStrictEqual(s.reach.steps[0].set, hand[k]));
  if (st) pairs.push({ key: k, state: st.id });
}
console.log(`hand-set states matched to a key: ${pairs.length}`);
const sample = pairs.slice(0, 6);
const { featurePaths } = await import(join(PLUGIN, 'lib/core/paths.mjs'));
const { renderDesign } = await import(join(PLUGIN, 'lib/design/render.mjs'));
const paths = featurePaths(WT, 'settings-page');
await mkdir(OUT, { recursive: true });
const spikeInv = { ...inv, states: sample.map((p) => ({ id: `PX-${p.key}`, screen: 'spike', name: p.key, reach: { kind: 'preset', props: { [prop]: p.key } }, shots: [] })) };
const ctx = { repoRoot: WT, env: process.env, out: { line: console.log, warn: console.warn, fail: console.error } };
const r = await renderDesign(ctx, { paths: { ...paths, designRender: () => {} }, inventory: spikeInv, adapter: 'claude-design', outDir: OUT, width: 'desktop', playwrightRoot: WT + '/apps/dashboard' });
console.log('rendered', r.rendered.length, 'failed', r.failed);
let same = 0;
for (const p of sample) {
  const a = await readFile(join(OUT, `PX-${p.key}.txt`), 'utf8').catch(() => '');
  const b = await readFile(join(run, 'design', `${p.state}.txt`), 'utf8').catch(() => '');
  const ok = a.trim() === b.trim();
  if (ok) same++;
  console.log(`${p.key} → ${p.state}: ${ok ? 'same text' : `differs (${a.split('\n').length} vs ${b.split('\n').length} lines)`}`);
}
console.log(`SUMMARY keys=${keys.length} hand=${handKeys.length} missed=${missed.length} sampleSame=${same}/${sample.length}`);
