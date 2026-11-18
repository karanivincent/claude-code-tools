#!/usr/bin/env node
// __SLUG__: the rendered-world checks (toon-world SKILL.md "A rendered world behind drawn people"), read from the film's
// own files, no render. Each line names its rule:
//   S3-213  the ink pass is off for the world: the stage file's ink toggle (stage.tsx) and each place's `ink`
//   S3-224  no rim on the cards: each place light's rims, read as look/cardshade.ts draws them (a warm card tint turns
//           the warm rim on even with rims.on 0); a place that draws its cards flat (`people.flat`) passes
//   S3-223  never emissive: every emissive set in the cards' code (this story's cast.ts, src/look/cardshade.ts) is zero
//   S2-36   each scene names a reference frame that is on disk: a "Scene | Reference frame" (or "Scene frame") table in
//           stories/__SLUG__/scenes.md, parts.md or plan.md; a catalog id (s011) is looked up as <id>.jpg/png under
//           out/__SLUG__/ref/, stories/__SLUG__/ref/ and stories/__SLUG__/references/ (and any --ref-dir)
//   S3-231  each place has a probe still: out/__SLUG__/places/<place>/probe.jpg (or probe-<name>.jpg/png)
//   S3-191  the parts plan names each place's light source and its side: a "## <place>" section with a light line, or
//           a light table row with a "Source" column (stories/__SLUG__/parts.md or plan.md)
// Why (audit A, 18 November 2026, findings 16 and 21): these rules were proved by a reviewer's eye or by a file nobody
// read; the hannibal-oxen film had to copy its ink switch, flat cards and rim settings by hand, and the template film
// still turns the ink pass and the card rims on. Not checked here (they need the flat card mode and the soft shadows,
// which are not in templates/look yet): S3-223's one even tone with no gradient, S3-221 soft shadows, S3-226 contact.
//   node src/stories/__SLUG__/tools/world-check.mjs [--skip probe,frames,...] [--ref-dir <dir>]
// Checks: ink, rims, emissive, frames, probe, light. Prints one line per fault (FAULT <scene> (<place>) <rule>: ...);
// exit 1 on a fault, 2 when the film's files cannot be read.
import fs from 'node:fs';
import path from 'node:path';
import { args, loadFilm, loadScene, loadTs, loadKit, STORY_DIR, SLUG, OUT } from './lib.mjs';

const { o } = args();
const skip = new Set(String(o.skip ?? '').split(',').filter(Boolean));
const kit = await loadKit('world');
if (!kit) { console.error('world-check: src/toon-kit/world.ts is missing: sync the kit (toon-world/scripts/sync-kit.mjs)'); process.exit(2); }
let film, places;
const used = {};
try {
  film = await loadFilm();
  for (const s of film.SCENES) used[s.id] = (await loadScene(s.id)).PLACE;
} catch (e) { console.error(`world-check: cannot read the scenes: ${e.message}`); process.exit(2); }
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const faults = [];

if (!skip.has('ink') || !skip.has('rims')) {
  try { places = (await loadTs(path.join(STORY_DIR, 'places', 'index.ts'))).PLACES; } catch (e) { console.error(`world-check: cannot load places/index.ts in node: ${e.message}`); process.exit(2); }
}
if (!skip.has('ink')) {
  const stage = read(path.join(STORY_DIR, 'stage.tsx')) ?? read(path.join(STORY_DIR, 'Stage.tsx'));
  if (stage === null) faults.push({ rule: 'S3-213', what: 'no stage.tsx in the story: the ink setting cannot be read' });
  else faults.push(...kit.checkInk(stage, places, used));
}
if (!skip.has('rims')) faults.push(...kit.checkRims(places, used));
if (!skip.has('emissive')) {
  const files = {};
  for (const p of [path.join(STORY_DIR, 'cast.ts'), path.resolve('src', 'look', 'cardshade.ts')]) { const t = read(p); if (t !== null) files[path.relative(process.cwd(), p)] = t; }
  faults.push(...kit.checkEmissive(files));
}
const docs = {};
for (const n of ['scenes.md', 'parts.md', 'plan.md']) { const t = read(path.resolve('stories', SLUG, n)); if (t !== null) docs[`stories/${SLUG}/${n}`] = t; }
if (!skip.has('frames')) {
  const dirs = [path.join(OUT, 'ref'), path.resolve('stories', SLUG, 'ref'), path.resolve('stories', SLUG, 'references'), ...[].concat(o['ref-dir'] ?? []).map((d) => path.resolve(d))];
  const names = new Set();
  for (const d of dirs) if (fs.existsSync(d)) for (const f of fs.readdirSync(d, { recursive: true })) names.add(path.basename(String(f)).toLowerCase());
  const found = (t) => (/\.(jpe?g|png|webp)$/i.test(t)
    ? [path.resolve(t), path.resolve('stories', SLUG, t)].some((p) => fs.existsSync(p))
    : ['jpg', 'jpeg', 'png', 'webp'].some((x) => names.has(`${t.toLowerCase()}.${x}`)));
  faults.push(...kit.checkSceneFrames(docs, film.SCENES.map((s) => s.id), found));
}
if (!skip.has('probe')) {
  faults.push(...kit.checkProbes(used, (place) => { const d = path.join(OUT, 'places', place); return fs.existsSync(d) ? fs.readdirSync(d) : []; }));
}
if (!skip.has('light')) faults.push(...kit.checkLightSources(docs, [...new Set(Object.values(used))]));

for (const f of faults) console.log(kit.formatFault(f).replaceAll('<slug>', SLUG));
console.log(faults.length ? `${faults.length} fault(s)` : `world ok: ${film.SCENES.length} scene(s) in ${new Set(Object.values(used)).size} place(s)`);
if (faults.length) process.exitCode = 1;
