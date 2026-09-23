// docs/ARCHITECTURE.md is the contract: every file has an owner, every cross-slice function it
// lists exists in the file it names, every command module is well-formed, every gate exports gate().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listTree } from '../../lib/core/hash.mjs';
import { COMMAND_ORDER, loadAllCommands, fileForCommand } from '../../lib/core/command.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARCH = readFileSync(join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
const OWNERS = ['F', 'A1', 'A2', 'B1', 'B2', 'C', '—'];

function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function section(title) {
  const start = ARCH.indexOf(`## ${title}`);
  assert.ok(start >= 0, `ARCHITECTURE.md has no "## ${title}" section`);
  const end = ARCH.indexOf('\n## ', start + 3);
  return ARCH.slice(start, end < 0 ? undefined : end);
}

const ownershipRows = [...section('Ownership').matchAll(/^\| `([^`]+)` \| ([^|]+?) \|$/gm)].map((m) => ({ glob: m[1], owner: m[2].trim(), re: globToRe(m[1]) }));

/** @param {string} rel */
export function ownerOf(rel) {
  return ownershipRows.find((r) => r.re.test(rel))?.owner ?? null;
}

test('the ownership table parses and uses only known owners', () => {
  assert.ok(ownershipRows.length > 50);
  for (const r of ownershipRows) assert.ok(OWNERS.includes(r.owner), `${r.glob}: unknown owner ${r.owner}`);
});

test('every file in the plugin has an owner', async () => {
  const files = await listTree(ROOT, { ignore: (rel) => rel.startsWith('.delivery/') });
  const orphans = files.filter((f) => !ownerOf(f));
  assert.deepEqual(orphans, [], `files with no owner in docs/ARCHITECTURE.md: ${orphans.join(', ')}`);
});

const crossRows = [...section('Cross-slice functions').matchAll(/^\| `([A-Za-z_][A-Za-z0-9_]*)` \| `([^`]+)` \| (A1|A2|B1|B2|C) \|/gm)]
  .map((m) => ({ name: m[1], file: m[2], owner: m[3] }));

test('every cross-slice function listed exists as an export of its file, owned as stated', async () => {
  assert.ok(crossRows.length >= 35, `parsed ${crossRows.length} rows`);
  for (const row of crossRows) {
    assert.equal(ownerOf(row.file), row.owner, `${row.file} is owned by ${ownerOf(row.file)}, the table says ${row.owner}`);
    const mod = await import(pathToFileURL(join(ROOT, row.file)).href);
    assert.ok(row.name in mod, `${row.file} does not export ${row.name}`);
    if (/^[a-z]/.test(row.name)) assert.equal(typeof mod[row.name], 'function', `${row.name} is not a function`);
  }
});

test('every command module is well-formed, named for its file, and in COMMAND_ORDER', async () => {
  const all = await loadAllCommands();
  assert.deepEqual(all.map((c) => c.module.name).sort(), [...COMMAND_ORDER].sort(), 'lib/commands/ and COMMAND_ORDER disagree');
  for (const { file, module } of all) {
    assert.equal(file, fileForCommand(module.name));
    assert.equal(typeof module.run, 'function', file);
    assert.match(module.usage, new RegExp(`^usage: delivery ${module.name}`), `${file}: usage must start with "usage: delivery ${module.name}"`);
    assert.ok(ownerOf(`lib/commands/${file}`), `${file} has no owner`);
  }
});

test('every phase gate exports gate(ctx)', async () => {
  for (let n = 0; n <= 7; n++) {
    const mod = await import(pathToFileURL(join(ROOT, 'lib', 'gates', `phase-${n}.mjs`)).href);
    assert.equal(typeof mod.gate, 'function', `phase-${n}`);
    assert.equal(mod.gate.length, 1, `phase-${n}: gate(ctx)`);
    assert.equal(ownerOf(`lib/gates/phase-${n}.mjs`), 'A1');
  }
});

test('nothing project-specific in shipped code or docs', async () => {
  const files = (await listTree(ROOT)).filter((f) => /\.(mjs|json|md|ts|tsx|sh|html)$/.test(f));
  // Built at run time so this file does not contain the name it looks for.
  const banned = [new RegExp('ksatilet'.split('').reverse().join(''), 'i'), /\b254\d{9}\b/];
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const re of banned) assert.doesNotMatch(text, re, `${f} contains ${re}`);
  }
});
