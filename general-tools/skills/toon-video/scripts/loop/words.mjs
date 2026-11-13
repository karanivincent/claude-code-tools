#!/usr/bin/env node
// words.mjs: one scene's words with scene-relative times, for look.sh --words (reviewer 3's stills on the action words).
// The voice script's full.json holds film times; look.sh wants the scene's own clock (the cliff film: every builder
// wrote this by hand).
//   node words.mjs <full.json> --from <film s> --to <film s> [--out <words.json>]
//   node words.mjs <full.json> --scene <id> --plan src/stories/<slug>/plan.ts [--out out/<slug>/scenes/<id>/words.json]
// Writes [{"w": "jumped", "s": 2.53, "e": 2.88}], times from the scene's first frame; words that end before the scene
// or start after it are left out. Prints the count.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const full = argv[0];
if (!full || full.startsWith('--')) { console.error('usage: node words.mjs <full.json> (--from s --to s | --scene id --plan plan.ts) [--out f]'); process.exit(2); }
let from = opt('--from') !== undefined ? Number(opt('--from')) : null, to = opt('--to') !== undefined ? Number(opt('--to')) : null;
if (opt('--scene')) {
  const plan = opt('--plan');
  if (!plan || !fs.existsSync(plan)) { console.error('words.mjs: --scene needs --plan <plan.ts>'); process.exit(2); }
  const src = fs.readFileSync(plan, 'utf8');
  const fps = Number(src.match(/FPS\s*=\s*(\d+)/)?.[1] ?? 30);
  const scenes = [...src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*frames:\s*(\d+)\s*\}/g)].map((m) => ({ id: m[1], frames: +m[2] }));
  const i = scenes.findIndex((s) => s.id === opt('--scene'));
  if (i < 0) { console.error(`words.mjs: no scene "${opt('--scene')}" in ${plan} (${scenes.map((s) => s.id).join(', ')})`); process.exit(1); }
  from = scenes.slice(0, i).reduce((n, s) => n + s.frames, 0) / fps; to = from + scenes[i].frames / fps;
}
if (from === null || to === null || !(to > from)) { console.error('words.mjs: give --from and --to (film seconds), or --scene and --plan'); process.exit(2); }
const F = JSON.parse(fs.readFileSync(full, 'utf8'));
const all = (F.lines ?? []).flatMap((l) => (l.words ?? []).map((w) => ({ w: w.w ?? w.word, s: w.s ?? w.start, e: w.e ?? w.end ?? w.s })));
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = all.filter((w) => w.s != null && w.e != null && w.e > from && w.s < to).map((w) => ({ w: w.w, s: r3(Math.max(0, w.s - from)), e: r3(Math.min(to, w.e) - from) }));
const text = JSON.stringify(out, null, 1) + '\n';
if (opt('--out')) { fs.writeFileSync(opt('--out'), text); console.log(`${out.length} words, ${from.toFixed(2)}-${to.toFixed(2)} s of the film -> ${opt('--out')}`); }
else process.stdout.write(text);
