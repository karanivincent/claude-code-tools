#!/usr/bin/env node
// Start a new toon film from the templates:  node new-film.mjs <project-root> <slug> <CompositionId> [--force]
// Copies templates/film/ into src/stories/<slug>/ (Film.tsx, Stage.tsx, place.ts, overlays.tsx, detail.ts, story.ts,
// shots.ts, places/, tools/) and templates/sound/story-sound.mjs to scripts/<slug>-sound.mjs, filling in the slug,
// the film's composition id and the board's (<CompositionId>Board). Then syncs the toon-kit (sync-kit.mjs), which the
// templates import from src/toon-kit/. Files that already exist are left alone unless --force.
// It also writes the story's paperwork the gate reads (stories/<slug>/meaning.md, parts.md, checklist.md and
// src/stories/<slug>/approvals.json as {}), copies the look stack (templates/look/ without the practice cast.ts) to
// src/look/ when the project has none, and the measuring scripts the gate runs (levels.mjs, measure_sharp.py,
// measure_look.py) into the story's tools/. The story still brings its full.json (the voice script writes it).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const [, , rootArg, slug, comp, flag] = process.argv;
if (!rootArg || !slug || !comp || !/^[a-z0-9-]+$/.test(slug) || !/^[A-Z][A-Za-z0-9]*$/.test(comp)) {
  console.error('usage: node new-film.mjs <project-root> <slug: lower-case-with-dashes> <CompositionId: PascalCase> [--force]');
  process.exit(1);
}
const root = path.resolve(rootArg), force = flag === '--force';
const fill = s => s.replaceAll('__SLUG__', slug).replaceAll('__FILM__', comp).replaceAll('__BOARD__', `${comp}Board`);
const wrote = [], kept = [];
const put = (src, dest) => {
  if (fs.existsSync(dest) && !force) { kept.push(path.relative(root, dest)); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fill(fs.readFileSync(src, 'utf8')));
  wrote.push(path.relative(root, dest));
};
const walk = (dir, rel = '') => {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(dir, r);
    else if (e.name !== 'README.md') put(path.join(dir, r), path.join(root, 'src/stories', slug, r));
  }
};
walk(path.join(here, '..', 'templates', 'film'));
put(path.join(here, '..', 'templates', 'sound', 'story-sound.mjs'), path.join(root, 'scripts', `${slug}-sound.mjs`));
// the scripts the gate runs, beside the story's tools
const tools = path.join(root, 'src/stories', slug, 'tools');
put(path.join(here, '..', '..', 'toon-video', 'scripts', 'levels.mjs'), path.join(tools, 'levels.mjs'));
for (const f of ['measure_sharp.py', 'measure_look.py']) put(path.join(here, f), path.join(tools, f));
// the look stack, once per project (the practice cast.ts stays behind: it imports a practice set)
if (!fs.existsSync(path.join(root, 'src/look'))) for (const f of fs.readdirSync(path.join(here, '..', 'templates', 'look')))
  if (f !== 'cast.ts') put(path.join(here, '..', 'templates', 'look', f), path.join(root, 'src/look', f));
// the paperwork the gate reads; the review page writes approvals.json when the owner clicks, never an agent
const write = (rel, body) => {
  const dest = path.join(root, rel);
  if (fs.existsSync(dest) && !force) { kept.push(rel); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, body); wrote.push(rel);
};
write(`stories/${slug}/meaning.md`, `# ${slug}: meaning sheet\n\n<!-- One row a line of the script: what it means, the verb it shows, and what the viewer must see on its word\n(each becomes a STORY.mustSee entry). The gate needs this file filled in. -->\n\n| Line | What it means | The verb | Must see, on which word |\n|---|---|---|---|\n`);
write(`stories/${slug}/parts.md`, `# ${slug}: parts plan\n\n<!-- One section a place (its name as in places/index.ts), the blend's bands in each (decision 1): the owner
approves it on the review page before the place is built. The gate wants a "## <place>" section for every place and no
TODO left. -->\n\n## <fill: place name>\n\n- Far band (one picture): TODO\n- Middle band (code 3D, painted textures at 2048): TODO\n- Ground (code 3D, painted textures at 2048): TODO\n- Props (code 3D; a Higgsfield model only when the owner asks): TODO\n- Detail layer (small real things that move: flies, smoke, cloth, birds, an animal; not dots): TODO\n- The story's state this place shows (a drought, night, a crowd): TODO\n`);
write(`stories/${slug}/checklist.md`, 'Built from toon-video/references/rules.md at start\n');
write(`src/stories/${slug}/approvals.json`, '{}\n');
console.log(`wrote ${wrote.length}: ${wrote.join(', ')}`);
if (kept.length) console.log(`kept (exist already; --force to overwrite): ${kept.join(', ')}`);

execFileSync(process.execPath, [path.join(here, 'sync-kit.mjs'), root], { stdio: 'inherit' });

const need = [[`src/stories/${slug}/full.json`, 'the voice timeline (the story\'s voice script)']]
  .filter(([p]) => !fs.existsSync(path.join(root, p)));
if (need.length) { console.log('still needed:'); for (const [p, what] of need) console.log(`  ${p}: ${what}`); }
const V = comp.toUpperCase();
console.log(`\nRegister both in src/Root.tsx:
  import { DURATION as ${V}_DURATION } from './stories/${slug}/shots';
  <Composition id="${comp}" lazyComponent={() => import('./stories/${slug}/Film')} durationInFrames={Math.ceil(${V}_DURATION * 30)} fps={30} width={1080} height={1920} defaultProps={{} as never} />
  <Composition id="${comp}Board" lazyComponent={() => import('./stories/${slug}/Stage')} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{ place: 'example', shot: 'wide' } as never} />
Packages (exact pins): npm i -E @react-three/postprocessing@3.0.4 postprocessing@6.39.5 (TypeScript 5, never 7).
Before the first critic round and before any render over 8 s: node src/stories/${slug}/tools/gate.mjs critic|render`);
