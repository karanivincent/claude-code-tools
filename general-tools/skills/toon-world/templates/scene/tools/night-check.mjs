#!/usr/bin/env node
// __SLUG__: every declared night scene measured on its own render, one scene at a time, through toon-video's
// bar-check.py gate (`--gate --night`): the median change per frame 8 or under (S3-173), never still for 0.7 s (bar
// check 4), and at night a mean of 75 to 95 and the darkest 5% at 25 or more (S3-205), the brightest 5% at 190 or under
// (S3-220). A night scene is one whose place (or its place light) says `night: true`, or one named with --night.
// Why (audit A, finding 9, 18 November 2026): bar-check.py printed the night numbers and always exited 0, and no stage
// ran it on a film, so a night at mean 120 passed every check; a whole film measured at once hides one bright night
// scene among dark ones, so each scene is measured alone.
//   node src/stories/__SLUG__/tools/night-check.mjs [--night s05,s06] [--clips out/__SLUG__] [--bar <bar-check.py>]
// The clips are the scene renders (tools/render.mjs <scene> writes out/__SLUG__/<scene>.mp4). A night scene with no
// clip is a fault (not measured). bar-check.py is found from --bar, $TOON_BAR_CHECK, or the newest general-tools in
// ~/.claude/plugins/cache. Prints one line per fault (the scene, then the gate's line); exit 1 on a fault, 2 when it
// cannot run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { args, loadFilm, loadScene, loadTs, loadKit, STORY_DIR, OUT } from './lib.mjs';

const { o } = args();
const kit = await loadKit('world');
if (!kit) { console.error('night-check: src/toon-kit/world.ts is missing: sync the kit (toon-world/scripts/sync-kit.mjs)'); process.exit(2); }
function findBar() {
  for (const p of [o.bar, process.env.TOON_BAR_CHECK]) if (p && fs.existsSync(p)) return p;
  const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache'), hits = [];
  const walk = (d, depth) => {
    if (depth > 7 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name !== 'node_modules') walk(p, depth + 1);
      else if (e.name === 'bar-check.py' && p.includes(`toon-video${path.sep}scripts`)) hits.push(p);
    }
  };
  walk(cache, 0);
  return hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
}
const film = await loadFilm();
const used = {};
for (const s of film.SCENES) used[s.id] = (await loadScene(s.id)).PLACE;
const places = await loadTs(path.join(STORY_DIR, 'places', 'index.ts')).then((m) => m.PLACES).catch((e) => {
  if (o.night) return {};
  console.error(`night-check: cannot load places/index.ts in node (${e.message}); name the night scenes with --night`); process.exit(2);
});
const named = String(o.night ?? '').split(',').filter(Boolean);
const night = kit.nightScenes(places, used, named);
if (!night.length) { console.log('night: no scene is declared night (a place with night: true, or --night s05)'); process.exit(0); }
const bar = findBar();
if (!bar) { console.error('night-check: bar-check.py not found: pass --bar <toon-video>/scripts/bar-check.py or set TOON_BAR_CHECK'); process.exit(2); }
const clips = path.resolve(o.clips ?? OUT), lines = [];
for (const s of night) {
  const clip = path.join(clips, `${s}.mp4`);
  if (!fs.existsSync(clip)) { lines.push(`FAULT ${s} (${used[s]}): night scene not measured: no clip at ${path.relative(process.cwd(), clip)} (tools/render.mjs ${s})`); continue; }
  const r = spawnSync('python3', ['-I', bar, clip, '--gate', '--night'], { encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) { console.error(`night-check: bar-check.py could not read ${clip}: ${r.stderr.trim().split('\n').at(-1)}`); process.exit(2); }
  // a bar-check.py from before the gate ignores --gate, prints its report on stdout and exits 0: never read that as a pass
  if (!/^gate: /m.test(r.stderr)) { console.error(`night-check: ${bar} has no --gate (an older general-tools): update the plugin or pass --bar`); process.exit(2); }
  const fails = r.stdout.split('\n').filter((l) => l.trim());
  for (const l of fails) lines.push(`FAULT ${s} (${used[s]}): ${l.replace(`${clip}: FAIL `, '')}`);
  if (!fails.length) console.log(`ok    ${s} (${used[s]}): ${r.stderr.split('\n').find((l) => /brightness:/.test(l))?.trim() ?? 'night gate passed'}`);
}
for (const l of lines) console.log(l);
console.log(lines.length ? `${lines.length} fault(s) in ${night.length} night scene(s)` : `night ok: ${night.join(', ')}`);
if (lines.length) process.exitCode = 1;
