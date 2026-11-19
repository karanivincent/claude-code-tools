#!/usr/bin/env node
// __SLUG__: the acting audit (toon-video S3-134: an action or expression change on every beat of the words, nobody still
// for more than about 1 s), read from each scene's story.ts in node, no render. Two checks over samples every 3rd frame:
//   - everyone still: a stretch over --max seconds where nobody on screen shows a new pose (toon-kit actingStills);
//   - each person: anyone at least --min of the frame tall who keeps one pose for more than --max seconds, even while
//     someone else acts (toon-kit personStills).
// Why (19 November 2026): the Hannibal film had 15 seconds where nothing moved but the camera (the reference Short: 4 in
// 59 s), people holding one pose 3 to 4 s while another talked. actingStills existed and nothing ran it. This audit, run
// on that film, took its failing scenes from 7 to none and its quiet seconds from 15 to 4.
//   node src/stories/__SLUG__/tools/acting-audit.mjs [<scene> ...] [--max 1.0] [--min 0.12] [--every 3] [--gate]
// No scene: every scene. Without --gate: a report per scene and its faults on stdout. With --gate (the scene loop's bar
// step runs `acting-audit.mjs <scene> --gate`): only the fault lines on stdout, the report on stderr. One fault line
// names the scene, the person and the seconds (scene seconds, which are the scene clip's; the film's in brackets).
// Exit 0 pass, 1 a fault, 2 when the story's files or the toon-kit cannot be read.
// A pose is: the face shown (expr, or exprTo during an ease), the gaze (look, lookY), headTilt, tilt, the talking mouth
// (open or shut), held things and the prop, the mode, the crouch; then a hand or a foot moved over 60 design units, the
// hips (drop) over 40, the card over 0.3 m along the ground, a lean over 0.08, or a walk under way (mode march or stroll
// with its phase moving) since the run's first sample. The blink is left out, and so is secondary motion (hairSwing,
// flutter): a sway or a blink alone is not acting.
// A person's height on screen is their soles to 1.8 m above them (times sizes.ts sizeOf and the scene's sy) through the
// scene camera, as shots-check.mjs measures it; with no sizes.ts every size is 1.
import fs from 'node:fs';
import path from 'node:path';
import { args, loadFilm, loadScene, loadKit, loadTs, projectPx, STORY_DIR } from './lib.mjs';

const { pos, o } = args();
const MAX = Number(o.max ?? 1.0), MIN = Number(o.min ?? 0.12), EVERY = Math.max(1, Number(o.every ?? 3)), GATE = !!o.gate;
const report = (s) => (GATE ? console.error(s) : console.log(s));
const unreadable = (why) => { console.error(`acting audit: cannot read the story: ${why}`); process.exit(2); };

let film, kit, sizeOf;
try { film = await loadFilm(); } catch (e) { unreadable(`plan.ts (${e.message.split('\n')[0]})`); }
kit = await loadKit('acting');
if (!kit) unreadable('src/toon-kit/acting.ts is missing or does not load; run toon-world scripts/sync-kit.mjs');
if (!kit.personStills || !kit.numberPoses || !kit.actingStills) unreadable('src/toon-kit/acting.ts has no personStills or numberPoses (an older kit); run toon-world scripts/sync-kit.mjs');
const sizesFile = path.join(STORY_DIR, 'sizes.ts');
if (fs.existsSync(sizesFile)) { try { ({ sizeOf } = await loadTs(sizesFile)); } catch (e) { unreadable(`sizes.ts (${e.message.split('\n')[0]})`); } }
if (typeof sizeOf !== 'function') sizeOf = () => [1, 1];
const ids = pos.length ? pos : film.SCENES.map((s) => s.id);
const FPS = film.FPS ?? 30, W = film.WIDTH ?? 1080, H = film.HEIGHT ?? 1920, TALL = 1.8;

const q = (v, n) => Math.round((v ?? 0) / n);
const pt = (p) => (Array.isArray(p) ? [p[0], p[1]] : null);
/** what a person shows this frame (the template's PersonAt: who, at, opts as look/toon.ts FrontOpts, lean, sy) */
const poseOf = (p) => {
  const x = p.opts ?? {}, mode = x.mode ?? 'march';
  return {
    face: [x.exprTo ?? x.expr ?? 'neutral', q(x.look, 1), q(x.lookY, 4), q(x.headTilt, 3), q(x.tilt, 3), (x.talk ?? 0) > 0.05 ? 1 : 0,
      JSON.stringify(x.holds ?? null), JSON.stringify(x.prop ?? null), mode, q(x.crouch, 0.1)].join('|'),
    hands: [...(x.armsAt ?? [null, null]).map((a) => pt(a?.[1])), pt(x.hand), pt(x.handL)],
    feet: (x.legsAt ?? [null, null]).map((l) => pt(l?.[1])),
    drop: x.drop ?? 0, lean: (p.lean ?? 0) + (x.lean ?? 0), at: p.at,
    walk: mode === 'march' || mode === 'stroll', phase: x.phase ?? 0,
  };
};
const far = (a, b, d) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) > d : !!a !== !!b);
/** a new pose since `a`, the sample that opened the run */
const changed = (A, B) => {
  const a = A.pose, b = B.pose;
  return a.face !== b.face || (b.walk && b.phase !== a.phase) || Math.abs(b.drop - a.drop) > 40 || Math.abs(b.lean - a.lean) > 0.08
    || b.hands.some((h, i) => far(a.hands[i], h, 60)) || b.feet.some((h, i) => far(a.feet[i], h, 60))
    || Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2]) > 0.3;
};
const cutFrame = (c) => (typeof c === 'number' ? c : c?.f ?? Infinity);
const sec = (t) => t.toFixed(1);

const faults = [], failed = [];
for (const id of ids) {
  let S, t0;
  try { S = await loadScene(id); t0 = film.sceneFrom(id) / FPS; } catch (e) { unreadable(`scene ${id} (${e.message.split('\n')[0]})`); }
  if (typeof S.people !== 'function' || typeof S.camAt !== 'function' || !S.FRAMES) unreadable(`scene ${id}: story.ts exports no people(f), camAt(f) or FRAMES`);
  const samples = [];
  for (let f = 0; f < S.FRAMES; f += EVERY) {
    const cam = S.camAt(f), shot = (S.CUTS ?? []).filter((c) => cutFrame(c) <= f).length, people = [];
    for (const p of S.people(f)) {
      if (p.hidden || !p.at) continue;
      const h = TALL * (sizeOf(p.who)?.[1] ?? 1) * (p.sy ?? 1);
      const feet = projectPx(cam, p.at, W, H), head = projectPx(cam, [p.at[0], p.at[1] + h, p.at[2]], W, H);
      if (!feet || !head) continue;
      const hx = head.x / W, hy = head.y / H, fy = feet.y / H;
      if (!(hx > -0.05 && hx < 1.05 && fy > 0 && hy < 1)) continue;   // off screen
      people.push({ key: p.who, sig: '', height: (feet.y - head.y) / H, head: [hx, hy], feet: [feet.x / W, fy], pose: poseOf(p) });
    }
    samples.push({ t: +(f / FPS).toFixed(3), shot: `${id}:${shot}`, people });
  }
  const each = kit.personStills(samples, { maxStill: MAX, minHeight: MIN, changed });
  const all = kit.actingStills(kit.numberPoses(samples, changed), { maxStill: MAX });
  const big = [...new Set(samples.flatMap((s) => s.people.filter((p) => p.height >= MIN).map((p) => p.key)))];
  const lines = [];
  for (const i of all) {
    const who = [...new Set(samples.filter((s) => s.t >= i.from && s.t <= i.to).flatMap((s) => s.people.map((p) => p.key)))];
    lines.push({ t: i.from, s: `${id}: everyone still (${who.join(', ') || 'nobody'}) ${sec(i.from)}-${sec(i.to)} s (${sec(i.to - i.from)} s; film ${sec(t0 + i.from)}-${sec(t0 + i.to)} s): nobody on screen changes pose` });
  }
  for (const i of each) lines.push({ t: i.from, s: `${id}: ${i.who} keeps one pose ${sec(i.from)}-${sec(i.to)} s (${sec(i.to - i.from)} s; film ${sec(t0 + i.from)}-${sec(t0 + i.to)} s)` });
  lines.sort((a, b) => a.t - b.t);
  report(`${id} (film ${sec(t0)}-${sec(t0 + S.FRAMES / FPS)} s): ${lines.length ? `${lines.length} fault(s)` : 'ok'}; at ${Math.round(MIN * 100)}% of the frame or more: ${big.join(', ') || 'nobody'}`);
  for (const l of lines) { faults.push(l.s); if (!GATE) console.log(`  ${l.s}`); }
  if (lines.length) failed.push(id);
}
if (GATE) for (const l of faults) console.log(l);
report(failed.length ? `acting audit: FAIL in ${failed.join(', ')} (nobody still over ${MAX} s; S3-134)` : 'acting audit: pass');
process.exit(failed.length ? 1 : 0);
