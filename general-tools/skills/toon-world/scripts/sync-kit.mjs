#!/usr/bin/env node
// Bring the toon-kit (generic techniques, no looks) into a project:  node sync-kit.mjs <project-root>
// Writes <project>/src/toon-kit/<file>.ts for every kit file (tests left out) and src/toon-kit/synced.json.
// A project never edits these files: a fix goes into the skill, then every project syncs. If a project copy was
// edited since the last sync, the sync stops and names the file, so a local fix is moved into the skill, not lost.
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
