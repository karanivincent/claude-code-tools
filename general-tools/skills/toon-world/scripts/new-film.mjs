#!/usr/bin/env node
// Start a new toon film from the templates:
//   node new-film.mjs <project-root> <slug> <CompositionId> [--scenes s01,s02,...] [--look] [--force]
//   node new-film.mjs <project-root> <slug> <CompositionId> --whole-film [--force]
//
// The scene loop (default). The film is split into 5-10 s scenes, each its own small composition that renders in about
// 15 s, built in toon-video's order: the hardest place and one scene in it first, as a spike, to the owner's Look yes;
// then each other place in turn (its set, then its cameras and shot sizes, then fill and light, each locked); then up
// to four scene builders do the people and motion passes, every round judged blind against the best so far (and
// against the scene's beat reference when it has one). It writes:
//   src/stories/<slug>/                plan.ts (the frame plan), Film.tsx (with captions.tsx), compositions.tsx, stage.tsx,
//                                      cast.ts, sizes.ts, CastSheet.tsx, joins.ts, motion.ts, poses.tsx,
//                                      full.json (an empty stand-in until the voice script writes it)
//                                                                      <- templates/film-scenes/
//   src/stories/<slug>/places/         index.ts, marks.ts, shore.ts (a stand-in place), parts/ (the blend's parts and
//                                      the splash)                     <- templates/film-scenes/places, templates/scene/parts
//   src/stories/<slug>/scenes/<scene>/ shots.ts (camera, beats, shot list), story.ts (the people), Scene.tsx,
//                                      PoseSheet.tsx, one folder per scene <- templates/scene/
//   src/stories/<slug>/scenes/index.ts the scene list (rewritten on every run from plan.ts's order)
//   src/stories/<slug>/tools/          stills-sheet, render, board, cam-speed, path-check, shots-check, pose-check,
//                                      join-card, join-times <- templates/scene/tools/
//   src/Root.tsx                       the film's compositions registered, when Root.tsx has the usual shape
//   stories/<slug>/joins.json          one join card for each cut between two scenes
// Run it again with more --scenes to add scenes: existing files are kept (--force overwrites), each new scene is added
// to plan.ts's SCENES and gets a join card from the scene before it.
//
// --whole-film keeps the earlier method: templates/film/ into src/stories/<slug>/ (Film.tsx, Stage.tsx, place.ts, ...),
// the gate's measuring scripts into its tools/, with the gate and critic cycles over the whole film.
//
// Both: templates/sound/story-sound.mjs to scripts/<slug>-sound.mjs; the paperwork (stories/<slug>/meaning.md; parts.md
// with each place's light source, key lamp and probe still and a scene frame per scene; checklist.md, written from
// toon-video's SKILL.md "The order" and every live rule of references/rules.md (S0-8); lessons.md for the scene loop,
// findings.md for --whole-film, whose gate still reads it; src/stories/<slug>/approvals.json as {}); the look stack (templates/look/ without the
// practice cast.ts) into src/look/ when the project has none (--look updates an older one: every option the scene loop
// added is off by default, so existing stories render the same, and it lists the other stories that import src/look so
// one still of each can be compared before and after (S0-21)); then the toon-kit (sync-kit.mjs, warnings for this story
// only).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const T = (...p) => path.join(here, '..', 'templates', ...p);
const argv = process.argv.slice(2), flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--scenes'));
const si = argv.indexOf('--scenes'), sceneArg = si >= 0 ? argv[si + 1] : null;
const [rootArg, slug, comp] = argv.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));
if (!rootArg || !slug || !comp || !/^[a-z0-9-]+$/.test(slug) || !/^[A-Z][A-Za-z0-9]*$/.test(comp)) {
  console.error('usage: node new-film.mjs <project-root> <slug: lower-case-with-dashes> <CompositionId: PascalCase> [--scenes s01,s02] [--look] [--force] [--whole-film]');
  process.exit(1);
}
const root = path.resolve(rootArg), force = flags.has('--force'), whole = flags.has('--whole-film');
const scenesWanted = (sceneArg ?? 's01,s02').split(',').map((s) => s.trim()).filter(Boolean);
if (!whole && !scenesWanted.every((s) => /^[a-z][a-z0-9-]*$/.test(s))) { console.error('scene names: lower-case letters, digits and dashes, starting with a letter (s01, jump, the-fall)'); process.exit(1); }
const fill = (s, scene = '') => s.replaceAll('__SLUG__', slug).replaceAll('__FILM__', comp).replaceAll('__BOARD__', `${comp}Board`).replaceAll('__SCENE__', scene);
const wrote = [], kept = [];
const put = (src, dest, scene = '', over = force) => {
  if (fs.existsSync(dest) && !over) { kept.push(path.relative(root, dest)); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fill(fs.readFileSync(src, 'utf8'), scene));
  if (/\.(mjs|sh)$/.test(dest) && fs.readFileSync(dest, 'utf8').startsWith('#!')) fs.chmodSync(dest, 0o755);
  wrote.push(path.relative(root, dest));
};
const write = (rel, body, over = force) => {
  const dest = path.join(root, rel);
  if (fs.existsSync(dest) && !over) { kept.push(rel); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, body); wrote.push(rel);
};
/** copy a template folder into dest, skipping READMEs and the names in `skip` */
const copyDir = (src, dest, { scene = '', skip = [] } = {}) => {
  const walk = (rel = '') => {
    for (const e of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (skip.includes(r) || e.name === 'README.md') continue;
      if (e.isDirectory()) walk(r); else put(path.join(src, r), path.join(dest, r), scene);
    }
  };
  walk();
};
const story = path.join(root, 'src/stories', slug);

if (whole) {
  // ---------------- the earlier method: the whole film in one composition ----------------
  copyDir(T('film'), story);
  const tools = path.join(story, 'tools');
  put(path.join(here, '..', '..', 'toon-video', 'scripts', 'levels.mjs'), path.join(tools, 'levels.mjs'));
  for (const f of ['measure_sharp.py', 'measure_look.py']) put(path.join(here, f), path.join(tools, f));
} else {
  // ---------------- the scene loop ----------------
  copyDir(T('film-scenes'), story, { skip: ['joins.json'] });
  copyDir(T('scene', 'parts'), path.join(story, 'places', 'parts'));
  copyDir(T('scene', 'tools'), path.join(story, 'tools'));
  // plan.ts: add each new scene to SCENES (150 frames = 5 s; change it there)
  const filmTs = path.join(story, 'plan.ts');
  let film = fs.readFileSync(filmTs, 'utf8');
  const have = [...film.matchAll(/\{ id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
  const add = scenesWanted.filter((s) => !have.includes(s));
  if (add.length) {
    if (!film.includes('  // </scenes>')) { console.error(`${path.relative(root, filmTs)} has lost its "// </scenes>" marker: add ${add.join(', ')} to SCENES by hand`); process.exit(1); }
    film = film.replace('  // </scenes>', add.map((s) => `  { id: '${s}', frames: 150 },\n`).join('') + '  // </scenes>');
    fs.writeFileSync(filmTs, film); wrote.push(`${path.relative(root, filmTs)} (+${add.join(', ')})`);
  }
  const order = [...film.matchAll(/\{ id: '([a-z0-9-]+)'/g)].map((m) => m[1]);
  for (const s of order) for (const f of ['shots.ts', 'story.ts', 'Scene.tsx', 'PoseSheet.tsx']) put(T('scene', f), path.join(story, 'scenes', s, f), s);
  // the voice timeline the captions read: an empty stand-in until the voice script writes the real one
  if (!fs.existsSync(path.join(story, 'full.json'))) write(`src/stories/${slug}/full.json`, '{ "fps": 30, "duration": 0, "lines": [] }\n');
  // the scene list, in film order (generated: run new-film again after changing the order in plan.ts)
  const v = (s) => s.replace(/[^a-z0-9]/g, '_');
  write(`src/stories/${slug}/scenes/index.ts`, `// ${slug}: the scenes in film order. WRITTEN BY new-film.mjs from plan.ts's SCENES: run it again to add a scene.\n`
    + `import type React from 'react';\n`
    + order.map((s) => `import { Scene as Scene_${v(s)} } from './${s}/Scene';\nimport { PoseSheet as Poses_${v(s)}, poseCount as poses_${v(s)} } from './${s}/PoseSheet';`).join('\n')
    + `\n\nexport const SCENE_LIST: { id: string; Scene: React.FC<{ inFilm?: boolean }>; PoseSheet: React.FC; poseCount: number }[] = [\n`
    + order.map((s) => `  { id: '${s}', Scene: Scene_${v(s)}, PoseSheet: Poses_${v(s)}, poseCount: poses_${v(s)} },`).join('\n') + '\n];\n', true);
  // the join cards: one per cut between consecutive scenes (a stand-in card; the motion pass sets the real one)
  const joinsRel = `stories/${slug}/joins.json`, joinsPath = path.join(root, joinsRel);
  const J = fs.existsSync(joinsPath) && !force ? JSON.parse(fs.readFileSync(joinsPath, 'utf8')) : { joins: [] };
  const card = (after, before) => ({
    after, before,
    camera: { pos: [1.9, 2.7, 3.4], look: [-0.7, 3.05, -0.3], fov: 40, roll: 0 },
    people: { hero: { at: [-0.5, 2.2, 0], expr: 'dare' }, friend: { at: [-1.0, 2.2, -2.6], expr: 'nervous' } },
  });
  let added = 0;
  for (let i = 1; i < order.length; i++) if (!J.joins.some((j) => j.after === order[i - 1] && j.before === order[i])) { J.joins.push(card(order[i - 1], order[i])); added++; }
  J.joins.sort((a, b) => order.indexOf(a.before) - order.indexOf(b.before));
  if (added || !fs.existsSync(joinsPath)) { fs.mkdirSync(path.dirname(joinsPath), { recursive: true }); fs.writeFileSync(joinsPath, JSON.stringify(J, null, 2) + '\n'); wrote.push(`${joinsRel} (+${added} card${added === 1 ? '' : 's'})`); }
}

// ---------------- both methods ----------------
put(T('sound', 'story-sound.mjs'), path.join(root, 'scripts', `${slug}-sound.mjs`));
// the look stack, once per project (the practice cast.ts stays behind: it imports a practice set); --look updates it
const lookDir = path.join(root, 'src/look'), lookFiles = fs.readdirSync(T('look')).filter((f) => f !== 'cast.ts');
const hadLook = fs.existsSync(lookDir), updateLook = flags.has('--look');
// other stories that import the shared look stack: --look changes their drawing code too (S0-21)
const importers = (() => {
  const out = [], src = path.join(root, 'src'), own = path.join(src, 'stories', slug);
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'look', 'toon-kit'].includes(e.name) && !e.name.startsWith('.') && p !== own) walk(p); continue; }
    if (/\.(ts|tsx)$/.test(e.name) && /from ['"][./]*\/look\/(toon|grade|lights|cardshade|ink|lensblur|shade)['"]/.test(fs.readFileSync(p, 'utf8'))) out.push(path.relative(root, p));
  } };
  walk(src); return out;
})();
const stale = hadLook ? lookFiles.filter((f) => !fs.existsSync(path.join(lookDir, f)) || fs.readFileSync(path.join(lookDir, f), 'utf8') !== fs.readFileSync(T('look', f), 'utf8')) : [];
if (!hadLook) for (const f of lookFiles) put(T('look', f), path.join(lookDir, f));
else if (updateLook) {
  for (const f of stale) put(T('look', f), path.join(lookDir, f), '', true);
  if (stale.length && importers.length) {
    const stories = [...new Set(importers.map((p) => p.split(path.sep).slice(0, 3).join('/')))];
    console.log(`src/look updated (${stale.join(', ')}). Other code imports it: ${stories.slice(0, 12).join(', ')}${stories.length > 12 ? ` and ${stories.length - 12} more` : ''}.\n  Every new option is off by default (X-8); render one still of one of them before and after to be sure (S0-21).`);
  }
}
// the paperwork; the review page writes approvals.json when the owner clicks, never an agent
write(`stories/${slug}/meaning.md`, `# ${slug}: meaning sheet\n\n<!-- One row a line of the script: what it means, the verb it shows, and what the viewer must see on its word\n(each becomes a STORY.mustSee entry). The gate needs this file filled in. -->\n\n| Line | What it means | The verb | Must see, on which word |\n|---|---|---|---|\n`);
write(`stories/${slug}/parts.md`, `# ${slug}: parts plan

<!-- One section a place, named as in places/index.ts. The owner approves each by its parts-<place> button before it is
built, and again when it changes (S2-30). Look in toon-world/library/index.md first (S2-32). The gate refuses a TODO or
<fill ...> left in this file. -->

## <fill: place name>

- Library: <fill: entries copied from toon-world/library/index.md, or "none fits (checked)"> (S2-32)
- Reference stills: <fill: the stills from references.md this place copies, and what each is for> (S2-34)
- State: TODO (the story's state here: a drought, night, a crowd; S2-13)
- Sky: TODO (S3-232)
- Far band, or a lit far wall indoors: TODO (S3-229)
- Middle (code 3D, painted textures at 2048): TODO
- Ground (code 3D, a painted tile; floor that leads the eye in): TODO
- Detail layer (small real things that move: flies, smoke, cloth, birds, an animal; not dots): TODO (S3-9)
- Behind the hero, per shot (something that fits the story moves): TODO (S3-169)
- Behind a gate, door or wall the story names: TODO (S2-14)
- Things to sit on and to hold, and who uses them: TODO (S3-233)
- Hero props (code 3D; a Higgsfield model only when the owner asks): TODO (S2-11)
- People: TODO
- Effects: TODO
- Light source (a sun, window, lamp or fire in the place) and the side it shines from: TODO (S3-191)
- Key lamp (in front of the hero and to one side, placed at stage 4c for the locked cameras): TODO (S3-197, S3-209)
- Probe still: out/${slug}/places/<place>/probe.jpg, from the widest camera, beside the scene frame, before the place
  is built out (S3-231)
- Flat 2D exception: none (S2-9)

## Scene frames

<!-- One row a scene (S2-37): a frame of its own kind and light level, a night camp against a night camp. The reviewer's
likeness number 1 to 10 is scored against it. None in the catalog: ask the owner; a scene is not scored without one. -->

| Scene | Place | Light (day, dusk, night, lamp-lit room) | Scene frame (catalog path or file) | What it sets the bar for |
|---|---|---|---|---|
| <fill: s01> | <fill> | <fill> | <fill> | <fill> |
`);
// checklist.md: the order from toon-video's SKILL.md, then every live rule of the register by stage, copied word for
// word so a handover ticks the rule itself, never a retelling of it (S0-8, X-7)
const TV = path.join(here, '..', '..', 'toon-video');
const checklist = (() => {
  const head = `# ${slug}: checklist\n\nWritten by new-film.mjs on ${new Date().toISOString().slice(0, 10)} from toon-video's SKILL.md ("The order") and\nreferences/rules.md (S0-8). Tick each line as it is done; copy lines word for word, never retell them (X-7).\n`;
  const parts = [head], miss = [];
  try {
    const sk = fs.readFileSync(path.join(TV, 'SKILL.md'), 'utf8');
    const m = sk.match(/```\n(## <story>: the order\n[\s\S]*?)```/);
    if (m) parts.push('\n' + m[1].replaceAll('<story>', slug).replaceAll('<slug>', slug)); else miss.push('the order block in SKILL.md');
  } catch { miss.push(path.join(TV, 'SKILL.md')); }
  try {
    const rules = fs.readFileSync(path.join(TV, 'references', 'rules.md'), 'utf8').split('\n');
    const out = []; let h2 = null, h3 = null, shown2 = null, shown3 = null, n = 0;
    for (const l of rules) {
      if (/^## /.test(l)) { h2 = /^## (S\d|X) /.test(l) ? l.slice(3) : null; h3 = null; continue; }
      if (/^### /.test(l)) { h3 = l.slice(4); continue; }
      if (!h2 || !/^- \*\*(S\d+|X)-\d+\*\*/.test(l)) continue; // struck rules start "- ~~" and are left out
      if (shown2 !== h2) { out.push(`\n### ${h2}\n`); shown2 = h2; shown3 = null; }
      if (h3 && shown3 !== h3) { out.push(`\n#### ${h3}\n`); shown3 = h3; }
      out.push(l.replace(/^- /, '- [ ] ')); n++;
    }
    if (n) parts.push(`\n## The rules, by stage (${n} live rules)\n` + out.join('\n')); else miss.push('rules in rules.md');
  } catch { miss.push(path.join(TV, 'references', 'rules.md')); }
  if (miss.length) console.log(`checklist.md: could not read ${miss.join(', ')}; the checklist is incomplete (S0-8).`);
  return parts.join('\n') + '\n';
})();
write(`stories/${slug}/checklist.md`, checklist);
if (whole) write(`stories/${slug}/findings.md`, `# ${slug}: findings per critic round\n\n<!-- The whole-film method only: its gate reads this file. One section a critic report from round 2 on, and one for every\nrender report: "## <cycle>-<round>" (## 1-2, ## 1-render). In each: the predicted gain against the result, then each\nfinding as fault, what allowed it, the change, and its level (impossible, easy, rule with a picture, check; S5-27). -->\n`);
else write(`stories/${slug}/lessons.md`, `# ${slug}: lessons\n\n<!-- One line per owner note (its id in src/stories/${slug}/notes.json) and per judge's or reviewer's finding, closed as\n"<id>: story-only" or "<id>: <rule id>" (S6-15). A finding true of any video becomes a rule through add_rule.mjs, by\nPR to the skills repo the same day (X-12). -->\n`);
write(`src/stories/${slug}/approvals.json`, '{}\n');
console.log(`wrote ${wrote.length}: ${wrote.join(', ')}`);
if (kept.length) console.log(`kept (exist already; --force to overwrite): ${kept.join(', ')}`);

execFileSync(process.execPath, [path.join(here, 'sync-kit.mjs'), root, '--only', `src/stories/${slug}`], { stdio: 'inherit' });

// ---------------- register the film in src/Root.tsx (the scene loop) ----------------
let registered = false;
if (!whole) {
  const rootTsx = path.join(root, 'src', 'Root.tsx');
  if (fs.existsSync(rootTsx)) {
    let r = fs.readFileSync(rootTsx, 'utf8');
    const imp = `import { ${comp}Compositions } from './stories/${slug}/compositions';`, tag = `<${comp}Compositions />`;
    if (r.includes(tag)) registered = true;
    else {
      const lastImport = [...r.matchAll(/^import .*;$/gm)].at(-1), close = r.lastIndexOf('</>');
      if (lastImport && close > 0) {
        const at = lastImport.index + lastImport[0].length;
        r = r.slice(0, at) + (r.includes(imp) ? '' : '\n' + imp) + r.slice(at);
        const c2 = r.lastIndexOf('</>'), indent = (r.slice(0, c2).match(/\n([ \t]*)$/)?.[1] ?? '    ');
        r = r.slice(0, c2) + `  ${tag}\n${indent}` + r.slice(c2);
        fs.writeFileSync(rootTsx, r); registered = true; wrote.push('src/Root.tsx (+' + tag + ')');
        console.log(`registered ${tag} in src/Root.tsx`);
      }
    }
  }
}

// ---------------- what the project still needs ----------------
const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { return {}; } })();
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const PINS = { '@react-three/postprocessing': '3.0.4', postprocessing: '6.39.5' };
const missing = Object.entries(PINS).filter(([n, v]) => String(deps[n] ?? '').replace(/^[~^]/, '') !== v);
const ts = String(deps.typescript ?? '').replace(/^[~^]/, '');
const V = comp.toUpperCase();
if (whole) {
  const need = [[`src/stories/${slug}/full.json`, 'the voice timeline (the story\'s voice script)']].filter(([p]) => !fs.existsSync(path.join(root, p)));
  if (need.length) { console.log('still needed:'); for (const [p, what] of need) console.log(`  ${p}: ${what}`); }
  console.log(`\nRegister both in src/Root.tsx:
  import { DURATION as ${V}_DURATION } from './stories/${slug}/shots';
  <Composition id="${comp}" lazyComponent={() => import('./stories/${slug}/Film')} durationInFrames={Math.ceil(${V}_DURATION * 30)} fps={30} width={1080} height={1920} defaultProps={{} as never} />
  <Composition id="${comp}Board" lazyComponent={() => import('./stories/${slug}/Stage')} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{ place: 'example', shot: 'wide' } as never} />
Before the first critic round and before any render over 8 s: node src/stories/${slug}/tools/gate.mjs critic|render`);
} else {
  const s0 = scenesWanted[0];
  if (!registered) console.log(`\nRegister the film once in src/Root.tsx (one folder: ${comp}, ${comp}-<scene>, ${comp}-<scene>-poses, ${comp}-cast):
  import { ${comp}Compositions } from './stories/${slug}/compositions';
  <${comp}Compositions />`);
  console.log(`\nThe film's one mix goes to public/${slug}/full/mix.wav (scripts/${slug}-sound.mjs); a place's far picture to public/${slug}/far.jpg.
Each scene, from the project root (toon-world/templates/scene/README.md has the loop):
  node src/stories/${slug}/tools/stills-sheet.mjs poses ${s0}       the pose sheet
  node src/stories/${slug}/tools/stills-sheet.mjs ${s0} --n 8       a stills sheet (half scale)
  node src/stories/${slug}/tools/cam-speed.mjs ${s0}                the camera's speed per frame
  node src/stories/${slug}/tools/shots-check.mjs                  shot sizes, the far picture and the cut budget (stage 4b)
  node src/stories/${slug}/tools/path-check.mjs ${s0}               the action's path against the other figures and blockers
  node src/stories/${slug}/tools/pose-check.mjs ${s0}               face swaps and hand jumps in one frame
  node src/stories/${slug}/tools/render.mjs ${s0} --scale 0.5       a render (concurrency 3)`);
}
console.log(`\nPackages (exact pins): npm i -E @react-three/postprocessing@3.0.4 postprocessing@6.39.5   (TypeScript 5, never 7)`);
if (missing.length) console.log(`  NOT in this project's package.json yet (${missing.map(([n, v]) => `${n}@${v}${deps[n] ? `, has ${deps[n]}` : ''}`).join('; ')}): without them nothing renders. Run the line above in ${root}.`);
if (ts && !ts.startsWith('5')) console.log(`  TypeScript is ${ts}: Remotion's bundler needs TypeScript 5 (npm i -E -D typescript@5.9.3).`);
// last, so it is not lost above the kit's lines (the cliff film missed it and the templates failed tsc with ~140 errors)
if (hadLook && stale.length && !updateLook) console.log(`\nSTILL TO DO: src/look is older than the templates (${stale.join(', ')}); the scene templates need its new options
  (free poses, talk, place lights, face in-betweens, held things) and will not compile without them. Run again with --look
  (every new option is off by default, so existing stories render the same: X-8).`);
