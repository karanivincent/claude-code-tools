#!/usr/bin/env node
// Start a new toon film from the templates:
//   node new-film.mjs <project-root> <slug> <CompositionId> [--scenes s01,s02,...] [--look] [--force]
//   node new-film.mjs <project-root> <slug> <CompositionId> --whole-film [--force]
//
// The scene loop (default). The film is split into 5-10 s scenes, each its own small composition that renders in about
// 15 s, built in four passes (world and light, people and acting, motion and staging, sound), every round judged blind
// against the best so far. It writes:
//   src/stories/<slug>/                plan.ts (the frame plan), Film.tsx, compositions.tsx, stage.tsx, cast.ts, joins.ts,
//                                      motion.ts, poses.tsx            <- templates/film-scenes/
//   src/stories/<slug>/places/         index.ts, marks.ts, shore.ts (a stand-in place), parts/ (the blend's parts and
//                                      the splash)                     <- templates/film-scenes/places, templates/scene/parts
//   src/stories/<slug>/scenes/<scene>/ story.ts, Scene.tsx, PoseSheet.tsx, one folder per scene <- templates/scene/
//   src/stories/<slug>/scenes/index.ts the scene list (rewritten on every run from plan.ts's order)
//   src/stories/<slug>/tools/          stills-sheet, render, cam-speed, path-check <- templates/scene/tools/
//   stories/<slug>/joins.json          one join card for each cut between two scenes
// Run it again with more --scenes to add scenes: existing files are kept (--force overwrites), each new scene is added
// to plan.ts's SCENES and gets a join card from the scene before it.
//
// --whole-film keeps the earlier method: templates/film/ into src/stories/<slug>/ (Film.tsx, Stage.tsx, place.ts, ...),
// the gate's measuring scripts into its tools/, with the gate and critic cycles over the whole film.
//
// Both: templates/sound/story-sound.mjs to scripts/<slug>-sound.mjs; the paperwork (stories/<slug>/meaning.md, parts.md,
// checklist.md, findings.md, src/stories/<slug>/approvals.json as {}); the look stack (templates/look/ without the
// practice cast.ts) into src/look/ when the project has none (--look updates an older one: every option the scene loop
// added is off by default, so existing stories render the same); then the toon-kit (sync-kit.mjs).
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
  for (const s of order) for (const f of ['story.ts', 'Scene.tsx', 'PoseSheet.tsx']) put(T('scene', f), path.join(story, 'scenes', s, f), s);
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
const stale = hadLook ? lookFiles.filter((f) => !fs.existsSync(path.join(lookDir, f)) || fs.readFileSync(path.join(lookDir, f), 'utf8') !== fs.readFileSync(T('look', f), 'utf8')) : [];
if (!hadLook) for (const f of lookFiles) put(T('look', f), path.join(lookDir, f));
else if (updateLook) for (const f of stale) put(T('look', f), path.join(lookDir, f), '', true);
// the paperwork; the review page writes approvals.json when the owner clicks, never an agent
write(`stories/${slug}/meaning.md`, `# ${slug}: meaning sheet\n\n<!-- One row a line of the script: what it means, the verb it shows, and what the viewer must see on its word\n(each becomes a STORY.mustSee entry). The gate needs this file filled in. -->\n\n| Line | What it means | The verb | Must see, on which word |\n|---|---|---|---|\n`);
write(`stories/${slug}/parts.md`, `# ${slug}: parts plan\n\n<!-- One section a place (its name as in places/index.ts), the blend's bands in each (decision 1): the owner
approves it on the review page before the place is built. The gate wants a "## <place>" section for every place and no
TODO left. -->\n\n## <fill: place name>\n\n- Far band (one picture): TODO\n- Middle band (code 3D, painted textures at 2048): TODO\n- Ground (code 3D, painted textures at 2048): TODO\n- Props (code 3D; a Higgsfield model only when the owner asks): TODO\n- Detail layer (small real things that move: flies, smoke, cloth, birds, an animal; not dots): TODO\n- The story's state this place shows (a drought, night, a crowd): TODO\n`);
write(`stories/${slug}/checklist.md`, 'Built from toon-video/references/rules.md at start\n');
write(`stories/${slug}/findings.md`, `# ${slug}: findings per critic round\n\n<!-- One section a critic report from round 2 on, and one for every render report: "## <cycle>-<round>" (## 1-2,\n## 1-render). In each: the predicted gain against the result, then each finding as fault, what allowed it, the change, and its\nlevel (impossible, easy, rule with a picture, check; S5-11, S5-27). A kind that comes back moves up a level (S5-28).\nThe gate refuses a report without its section (S5-38). -->\n`);
write(`src/stories/${slug}/approvals.json`, '{}\n');
console.log(`wrote ${wrote.length}: ${wrote.join(', ')}`);
if (kept.length) console.log(`kept (exist already; --force to overwrite): ${kept.join(', ')}`);
if (hadLook && stale.length && !updateLook) console.log(`src/look differs from the skill's in ${stale.join(', ')}: the scene templates use its new options (free poses, talk, place lights).\n  Run again with --look to update it (every new option is off by default, so existing stories render the same).`);

execFileSync(process.execPath, [path.join(here, 'sync-kit.mjs'), root], { stdio: 'inherit' });

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
  console.log(`\nRegister the film once in src/Root.tsx (one folder: ${comp}, ${comp}-<scene>, ${comp}-<scene>-poses):
  import { ${comp}Compositions } from './stories/${slug}/compositions';
  <${comp}Compositions />
The film's one mix goes to public/${slug}/mix.wav (scripts/${slug}-sound.mjs); a place's far picture to public/${slug}/far.jpg.
Each scene, from the project root (toon-world/templates/scene/README.md has the loop):
  node src/stories/${slug}/tools/stills-sheet.mjs poses ${s0}       the pose sheet
  node src/stories/${slug}/tools/stills-sheet.mjs ${s0} --n 8       a stills sheet (half scale)
  node src/stories/${slug}/tools/cam-speed.mjs ${s0}                the camera's speed per frame
  node src/stories/${slug}/tools/path-check.mjs ${s0}               the action's path against the other figures
  node src/stories/${slug}/tools/render.mjs ${s0} --scale 0.5       a render (concurrency 3)`);
}
console.log(`\nPackages (exact pins): npm i -E @react-three/postprocessing@3.0.4 postprocessing@6.39.5   (TypeScript 5, never 7)`);
if (missing.length) console.log(`  NOT in this project's package.json yet (${missing.map(([n, v]) => `${n}@${v}${deps[n] ? `, has ${deps[n]}` : ''}`).join('; ')}): without them nothing renders. Run the line above in ${root}.`);
if (ts && !ts.startsWith('5')) console.log(`  TypeScript is ${ts}: Remotion's bundler needs TypeScript 5 (npm i -E -D typescript@5.9.3).`);
