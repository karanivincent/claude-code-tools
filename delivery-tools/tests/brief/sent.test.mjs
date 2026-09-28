// delivery brief sent (components-first spec §8.3, 0.9 plan task 7): recordSent's append-and-hash,
// the `delivery brief sent` command's refuse-on-problem, and the design-send skill's frontmatter
// and command references.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordSent } from '../../lib/brief/brief.mjs';
import { sha256File } from '../../lib/core/hash.mjs';
import sentCommand from '../../lib/commands/brief-sent.mjs';
import { resolveCommand } from '../../lib/core/command.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_PATH = join(PLUGIN_ROOT, 'skills', 'design-send', 'SKILL.md');

function write(dir, rel, content) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const okBrief = () => [
  '# Widgets',
  '',
  '## What changes and why',
  '',
  '## Screens',
  '### Screen: List',
  'Desktop: shows every widget in a table',
  'Phone: the same table, one column',
  '',
  '## Components to use',
  '- none yet',
  '',
  '## Behaviours',
  '1. Saving closes the dialog',
  '',
  '## Data',
  'Acme Store, Summit Interiors',
  '',
].join('\n');

// --- recordSent ----------------------------------------------------------------------------

test('recordSent: creates sent.json with one entry, hashed from the file\'s bytes', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    const briefPath = join(t.dir, 'briefs/01-widgets.md');
    await recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/abc', at: '2026-09-28T10:00:00.000Z' });
    const sentPath = join(t.dir, 'briefs/sent.json');
    assert.ok(existsSync(sentPath));
    const record = JSON.parse(readFileSync(sentPath, 'utf8'));
    assert.equal(record.sent.length, 1);
    assert.equal(record.sent[0].file, briefPath);
    assert.equal(record.sent[0].chat, 'https://claude.ai/chat/abc');
    assert.equal(record.sent[0].at, '2026-09-28T10:00:00.000Z');
    assert.equal(record.sent[0].sha256, await sha256File(briefPath));
  } finally { t.cleanup(); }
});

test('recordSent: appends to an existing sent.json, oldest first', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    const briefPath = join(t.dir, 'briefs/01-widgets.md');
    await recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/one', at: '2026-09-28T10:00:00.000Z' });
    await recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/two', at: '2026-09-28T11:00:00.000Z' });
    const record = JSON.parse(readFileSync(join(t.dir, 'briefs/sent.json'), 'utf8'));
    assert.equal(record.sent.length, 2);
    assert.equal(record.sent[0].chat, 'https://claude.ai/chat/one');
    assert.equal(record.sent[1].chat, 'https://claude.ai/chat/two');
  } finally { t.cleanup(); }
});

test('recordSent: defaults "at" to now when not given', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    const briefPath = join(t.dir, 'briefs/01-widgets.md');
    const before = Date.now();
    await recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/abc' });
    const record = JSON.parse(readFileSync(join(t.dir, 'briefs/sent.json'), 'utf8'));
    const at = Date.parse(record.sent[0].at);
    assert.ok(at >= before && at <= Date.now());
  } finally { t.cleanup(); }
});

test('recordSent: two concurrent calls both end up in sent.json (serialised through the lock)', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'briefs/01-widgets.md', okBrief());
    const briefPath = join(t.dir, 'briefs/01-widgets.md');
    await Promise.all([
      recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/one', at: '2026-09-28T10:00:00.000Z' }),
      recordSent(t.dir, { file: briefPath, chat: 'https://claude.ai/chat/two', at: '2026-09-28T11:00:00.000Z' }),
    ]);
    const record = JSON.parse(readFileSync(join(t.dir, 'briefs/sent.json'), 'utf8'));
    assert.deepEqual(record.sent.map((s) => s.chat).sort(), ['https://claude.ai/chat/one', 'https://claude.ai/chat/two']);
  } finally { t.cleanup(); }
});

// --- command: delivery brief sent -----------------------------------------------------------

test('brief sent: records the send and exits 0', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'brief.md', okBrief());
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await sentCommand.run(ctx, [join(t.dir, 'brief.md'), '--chat', 'https://claude.ai/chat/abc']);
    assert.equal(code, 0, stdout.text());
    const sentPath = join(t.dir, 'docs/delivery/widgets/intent/briefs/sent.json');
    assert.ok(existsSync(sentPath));
    const record = JSON.parse(readFileSync(sentPath, 'utf8'));
    assert.equal(record.sent.length, 1);
    assert.equal(record.sent[0].chat, 'https://claude.ai/chat/abc');
    // Fix round (M3): recorded relative to the repo root, never the machine's own absolute path.
    assert.equal(record.sent[0].file, 'brief.md');
    assert.match(stdout.text(), /recorded brief\.md sent to https:\/\/claude\.ai\/chat\/abc/);
  } finally { t.cleanup(); }
});

// Fix round (M3): brief check already runs the forbidden-name check on the file's own name; sent
// used to skip it, so a file whose only offence was its name went through unnoticed.
test('brief sent: refuses a forbidden name in the file\'s own name', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'spectrum-corp-brief.md', okBrief());
    const profile = makeProfile({ design: { forbiddenNames: ['Spectrum Corp'] } });
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    const code = await sentCommand.run(ctx, [join(t.dir, 'spectrum-corp-brief.md'), '--chat', 'https://claude.ai/chat/abc']);
    assert.equal(code, 1);
    assert.match(stdout.text(), /Spectrum Corp/);
    assert.equal(existsSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/sent.json')), false);
  } finally { t.cleanup(); }
});

test('brief sent: refuses a brief with a problem (exit 1) and writes nothing', async () => {
  const t = makeTempDir();
  try {
    const bad = okBrief().replace('1. Saving closes the dialog', 'Saving closes the dialog');
    write(t.dir, 'brief.md', bad);
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await sentCommand.run(ctx, [join(t.dir, 'brief.md'), '--chat', 'https://claude.ai/chat/abc']);
    assert.equal(code, 1);
    assert.match(stdout.text(), /not numbered/);
    assert.ok(!existsSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/sent.json')));
  } finally { t.cleanup(); }
});

test('brief sent: refuses a forbidden name from profile.design.forbiddenNames', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'brief.md', okBrief().replace('Acme Store', 'Spectrum Corp'));
    const profile = makeProfile({ design: { forbiddenNames: ['Spectrum Corp'] } });
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile });
    const code = await sentCommand.run(ctx, [join(t.dir, 'brief.md'), '--chat', 'https://claude.ai/chat/abc']);
    assert.equal(code, 1);
    assert.ok(!existsSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/sent.json')));
  } finally { t.cleanup(); }
});

test('brief sent: a missing file is reported cleanly (exit 1, no raw ENOENT), and writes nothing', async () => {
  const t = makeTempDir();
  try {
    const { ctx, stdout } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    const code = await sentCommand.run(ctx, [join(t.dir, 'missing.md'), '--chat', 'https://claude.ai/chat/abc']);
    assert.equal(code, 1);
    assert.match(stdout.text(), /missing\.md does not exist/);
    assert.ok(!existsSync(join(t.dir, 'docs/delivery/widgets/intent/briefs/sent.json')));
  } finally { t.cleanup(); }
});

test('brief sent: --chat is required (exit 2)', async () => {
  const t = makeTempDir();
  try {
    write(t.dir, 'brief.md', okBrief());
    const { ctx } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile: makeProfile() });
    await assert.rejects(sentCommand.run(ctx, [join(t.dir, 'brief.md')]), (err) => err.exit === 2);
  } finally { t.cleanup(); }
});

test('brief sent resolves as a two-word command', async () => {
  const { module, rest } = await resolveCommand(['brief', 'sent', 'file.md', '--chat', 'https://x']);
  assert.equal(module.name, 'brief sent');
  assert.deepEqual(rest, ['file.md', '--chat', 'https://x']);
});

// --- skills/design-send/SKILL.md -------------------------------------------------------------

test('design-send SKILL.md exists with frontmatter name: design-send', () => {
  assert.ok(existsSync(SKILL_PATH), `${SKILL_PATH} does not exist`);
  const text = readFileSync(SKILL_PATH, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  assert.ok(m, 'SKILL.md has no frontmatter block');
  assert.match(m[1], /^name:\s*design-send\s*$/m);
});

test('every `delivery <command>` named in design-send/SKILL.md resolves with resolveCommand', async () => {
  const text = readFileSync(SKILL_PATH, 'utf8');
  const mentions = new Set();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const dm = /^delivery\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/.exec(m[1]);
    if (dm) mentions.add(dm[2] ? `${dm[1]} ${dm[2]}` : dm[1]);
  }
  assert.ok(mentions.size > 0, 'SKILL.md names no `delivery <command>`');
  for (const mention of mentions) {
    await assert.doesNotReject(resolveCommand(mention.split(' ')), `"delivery ${mention}" does not resolve`);
  }
});
