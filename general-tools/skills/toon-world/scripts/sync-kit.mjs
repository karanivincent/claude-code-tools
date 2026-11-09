#!/usr/bin/env node
// Bring the toon-kit (generic techniques, no looks) into a project:  node sync-kit.mjs <project-root>
// Writes <project>/src/toon-kit/<file>.ts for every kit file (tests left out) and src/toon-kit/synced.json.
// A project never edits these files: a fix goes into the skill, then every project syncs. If a project copy was
// edited since the last sync, the sync stops and names the file, so a local fix is moved into the skill, not lost.
// It also warns when a file under src/ defines its own `path`, `K` or `curve`: a fix to the kit's never reaches it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname);
const kitDir = path.join(here, '..', 'kit');
const plugin = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'));
const [, , root, flag] = process.argv;
if (!root) { console.error('usage: node sync-kit.mjs <project-root> [--force]'); process.exit(1); }
const dest = path.join(path.resolve(root), 'src', 'toon-kit');
const ledgerPath = path.join(dest, 'synced.json');
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { files: {} };

const header = name => `// SYNCED from the toon-world skill's kit (general-tools ${plugin.version}). Do not edit here.\n` +
  `// Fix it in the skill (toon-world/kit/${name}) and run toon-world/scripts/sync-kit.mjs again.\n`;

const edited = [];
for (const [name, h] of Object.entries(ledger.files)) {
  const p = path.join(dest, name);
  if (fs.existsSync(p) && sha(fs.readFileSync(p, 'utf8')) !== h) edited.push(name);
}
if (edited.length && flag !== '--force') {
  console.error(`edited in this project since the last sync: ${edited.join(', ')}`);
  console.error('Move the change into the skill\'s kit first (or pass --force to throw it away).');
  process.exit(2);
}

fs.mkdirSync(dest, { recursive: true });
const files = {};
for (const name of fs.readdirSync(kitDir).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort()) {
  const body = header(name) + fs.readFileSync(path.join(kitDir, name), 'utf8');
  fs.writeFileSync(path.join(dest, name), body);
  files[name] = sha(body);
}
fs.writeFileSync(ledgerPath, JSON.stringify({ version: plugin.version, files }, null, 1) + '\n');
console.log(`toon-kit ${plugin.version} -> ${path.relative(process.cwd(), dest) || dest}: ${Object.keys(files).join(', ')}`);

// A story that keeps its own copy of the kit's path blocks (written before the kit had them) never sees a kit fix:
// Gibeon's `kit.ts` defined its own K, curve and path, so the 1.55.0 path fix changed nothing there (the camera dump
// before and after the sync was byte-identical). Name every such copy, so the story imports the kit's instead.
const OWN = /^\s*(?:export\s+)?(?:(?:async\s+)?function\s+(path|curve|K)\s*[(<]|(?:const|let|var)\s+(path|curve|K)\s*=)/gm;
const copies = [];
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules' && p !== dest) walk(p); continue; }
    if (!/\.(ts|tsx|js|mjs)$/.test(e.name) || /\.test\./.test(e.name)) continue;
    const names = [...fs.readFileSync(p, 'utf8').matchAll(OWN)].map(m => m[1] ?? m[2]);
    if (names.length) copies.push(`${path.relative(path.resolve(root), p)} (${[...new Set(names)].join(', ')})`);
  }
};
const src = path.join(path.resolve(root), 'src');
if (fs.existsSync(src)) walk(src);
if (copies.length) {
  console.warn(`warning: these files define their own copy of the kit's path blocks, so kit fixes to them do not reach the code that uses these:`);
  for (const c of copies) console.warn(`  ${c}`);
  console.warn(`Import path, K and curve from src/toon-kit/camera instead (a story that still needs the old behaviour says so in a comment).`);
}
