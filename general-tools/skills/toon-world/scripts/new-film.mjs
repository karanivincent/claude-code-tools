#!/usr/bin/env node
// Start a new toon film from the templates:  node new-film.mjs <project-root> <slug> <CompositionId> [--force]
// Copies templates/film/ into src/stories/<slug>/ (Film.tsx, Stage.tsx, place.ts, overlays.tsx, detail.ts, story.ts,
// shots.ts, places/, tools/) and templates/sound/story-sound.mjs to scripts/<slug>-sound.mjs, filling in the slug,
// the film's composition id and the board's (<CompositionId>Board). Then syncs the toon-kit (sync-kit.mjs), which the
// templates import from src/toon-kit/. Files that already exist are left alone unless --force.
// The story still brings its own cast.ts and toon.ts (from templates/look/ or the project's reference story), its
// full.json (the voice script writes it), and the look stack at src/look/.
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
console.log(`wrote ${wrote.length}: ${wrote.join(', ')}`);
if (kept.length) console.log(`kept (exist already; --force to overwrite): ${kept.join(', ')}`);

execFileSync(process.execPath, [path.join(here, 'sync-kit.mjs'), root], { stdio: 'inherit' });

const need = [['src/look', 'the look stack (toon-world templates/look/)'], [`src/stories/${slug}/cast.ts`, 'the cast: exports Person, Cast, SCALE (templates/look/cast.ts or the reference story)'],
  [`src/stories/${slug}/toon.ts`, 'the card drawing (templates/look/toon.ts)'], [`src/stories/${slug}/full.json`, 'the voice timeline (the story\'s voice script)']]
  .filter(([p]) => !fs.existsSync(path.join(root, p)));
if (need.length) { console.log('still needed:'); for (const [p, what] of need) console.log(`  ${p}: ${what}`); }
const V = comp.toUpperCase();
console.log(`\nRegister both in src/Root.tsx:
  import { DURATION as ${V}_DURATION } from './stories/${slug}/shots';
  <Composition id="${comp}" lazyComponent={() => import('./stories/${slug}/Film')} durationInFrames={Math.ceil(${V}_DURATION * 30)} fps={30} width={1080} height={1920} defaultProps={{} as never} />
  <Composition id="${comp}Board" lazyComponent={() => import('./stories/${slug}/Stage')} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{ place: 'example', shot: 'wide' } as never} />`);
