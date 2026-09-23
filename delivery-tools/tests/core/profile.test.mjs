// Profile and safety loading and validation (spec 18, P1, P2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadProfile, validateProfile, loadSafety, validateSafety, fillCommand, commandPlaceholders, wrapHeavy, PLACEHOLDERS } from '../../lib/core/profile.mjs';
import { makeProfile, makeSafety } from '../helpers/fixtures.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';

function repoWith(files) {
  const t = makeTempDir();
  for (const [rel, v] of Object.entries(files)) {
    mkdirSync(join(t.dir, rel, '..'), { recursive: true });
    writeFileSync(join(t.dir, rel), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }
  return t;
}

test('placeholders: only the spec set, ${VAR} ignored', () => {
  assert.deepEqual(PLACEHOLDERS, ['port', 'sha', 'pr', 'spec', 'dir', 'cmd', 'epic', 'slug', 'date', 'project', 'n']);
  assert.deepEqual(commandPlaceholders('A=${HOME} run {pr} {sha} {pr}'), ['pr', 'sha']);
});

test('validateProfile flags unknown placeholders and unfilled <values> in commands', () => {
  assert.deepEqual(validateProfile(makeProfile()), []);
  const p = makeProfile();
  p.commands = { ...p.commands, ciWait: 'wait {prNumber}', e2e: 'run <your e2e command>' };
  const issues = validateProfile(p);
  assert.equal(issues.length, 2);
  assert.ok(issues.some((i) => i.path === '/commands/ciWait' && /unknown placeholder \{prNumber\}/.test(i.message)));
  assert.ok(issues.some((i) => i.path === '/commands/e2e' && /unfilled/.test(i.message)));
  assert.ok(validateProfile({ schemaVersion: 1 }).length > 5);
});

test('fillCommand quotes safely and refuses missing or unknown values', () => {
  assert.equal(fillCommand('wait {pr}', { pr: 12 }), 'wait 12');
  assert.equal(fillCommand('run {spec}', { spec: 'a b.ts' }), "run 'a b.ts'");
  assert.equal(fillCommand("heavy -- '{cmd}'", { cmd: "echo 'hi' && x" }), "heavy -- 'echo '\\''hi'\\'' && x'");
  assert.equal(wrapHeavy(makeProfile(), 'npm test'), "node scripts/heavy.mjs -- 'npm test'");
  assert.throws(() => fillCommand('wait {pr}', {}), (e) => e.exit === 2 && /no value for \{pr\}/.test(e.message));
  assert.throws(() => fillCommand('wait {prz}', { prz: 1 }), /unknown placeholder/);
});

test('loadProfile: exit 2 when missing, unparsable or invalid, with one failure per issue', async () => {
  const none = makeTempDir();
  try { await assert.rejects(loadProfile(none.dir), (e) => e.exit === 2 && /delivery init/.test(e.message)); } finally { none.cleanup(); }
  const broken = repoWith({ '.claude/delivery-profile.json': '{ nope' });
  try { await assert.rejects(loadProfile(broken.dir), /not valid JSON/); } finally { broken.cleanup(); }
  const p = makeProfile(); delete p.limits;
  const invalid = repoWith({ '.claude/delivery-profile.json': p });
  try {
    await assert.rejects(loadProfile(invalid.dir), (e) => e.exit === 2 && e.failures.some((f) => /missing required property "limits"/.test(f.message)));
  } finally { invalid.cleanup(); }
  const good = repoWith({ '.claude/delivery-profile.json': makeProfile() });
  try { assert.equal((await loadProfile(good.dir)).repo.slug, 'example-org/example-repo'); } finally { good.cleanup(); }
});

test('loadSafety is read-only, returns exact bytes and hash, and blocks (3) when absent', async () => {
  const profile = makeProfile();
  const missing = makeTempDir();
  try { await assert.rejects(loadSafety(missing.dir, profile), (e) => e.exit === 3 && e.code === 'P2'); } finally { missing.cleanup(); }

  const text = JSON.stringify(makeSafety(), null, 1) + '\n';
  const t = repoWith({ '.claude/delivery-safety.json': text });
  try {
    const before = statSync(join(t.dir, '.claude/delivery-safety.json')).mtimeMs;
    const s = await loadSafety(t.dir, profile);
    assert.equal(s.bytes.toString(), text);
    assert.equal(s.safety.fakeEmailDomain, 'example.invalid');
    assert.throws(() => { s.safety.neverDial.push('1'); }, TypeError, 'the loaded safety value is frozen');
    assert.equal(readFileSync(join(t.dir, '.claude/delivery-safety.json'), 'utf8'), text);
    assert.equal(statSync(join(t.dir, '.claude/delivery-safety.json')).mtimeMs, before);
  } finally { t.cleanup(); }
});

test('validateSafety: regexes compile and the sample matches the fake pattern', () => {
  assert.deepEqual(validateSafety(makeSafety()), []);
  const s = makeSafety({ fakeNumbers: { pattern: '^\\+?999\\d{9}$', sample: '15550100001', probeSql: '' } });
  assert.match(validateSafety(s)[0].message, /does not match/);
  const r = makeSafety({ fixtureUserPattern: '([' });
  assert.match(validateSafety(r)[0].message, /not a valid regular expression/);
});
