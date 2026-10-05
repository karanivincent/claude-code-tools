// Intake fixes from the picture-mode runs: --page for an export with two pages (kept by later
// exports), intake pointed at its own snapshot, and the new worktree bootstrapped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeZip } from '../../lib/core/zip.mjs';
import { listTree } from '../../lib/core/hash.mjs';
import { runIntake, isWithin, bootstrapWorktree, BOOTSTRAP_PORT } from '../../lib/lifecycle/intake.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { fail } from '../helpers/runner-stub.mjs';
import { makeRunRepo, ctxFor } from './support.mjs';

/** A real Claude Design export with two pages no file imports, and one component. */
function twoPageZip(path, home = '<x-dc><div>Home</div></x-dc>') {
  writeFileSync(path, writeZip([
    { name: 'Project/Home.dc.html', data: home },
    { name: 'Project/Settings.dc.html', data: '<x-dc><dc-import name="Picker"></dc-import></x-dc>' },
    { name: 'Project/Picker.dc.html', data: '<x-dc><div>Pick</div></x-dc>' },
    { name: 'Project/support.js', data: 'window.demo = 1;' },
  ]));
}

test('intake --page: two pages are refused by name; --page picks one, records it, and a later export keeps it', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    twoPageZip(zip);
    const { ctx, gh } = await ctxFor(repo.primary, { feature: null });
    await assert.rejects(runIntake(ctx, { source: zip, sentence: 'Build the home page.' }),
      (e) => e.exit === 2 && /Home\.dc\.html, Settings\.dc\.html/.test(e.message) && /--page/.test(e.message));

    const res = await runIntake(ctx, { source: zip, sentence: 'Build the home page.', page: 'Home' });
    assert.equal(res.feature, 'home');
    const readme = readFileSync(join(res.worktree, 'docs/design/home/README.md'), 'utf8');
    assert.match(readme, /^Page: `Home\.dc\.html`/m);

    // A new export of the same project, from inside the run's worktree, without --page again.
    twoPageZip(zip, '<x-dc><div>Home, round 2</div></x-dc>');
    const inside = await ctxFor(res.worktree, { feature: null, gh });
    const again = await runIntake(inside.ctx, { source: zip });
    assert.equal(again.feature, 'home');
    assert.ok(again.lines.some((l) => /replaced the snapshot/.test(l)), again.lines.join('\n'));
    assert.match(readFileSync(join(res.worktree, 'docs/design/home/README.md'), 'utf8'), /^Page: `Home\.dc\.html`/m);
  } finally { repo.cleanup(); }
});

/** The fake adapter of intake.test.mjs: one *.dc.html at the top, anything else copied. */
const fakeAdapter = {
  name: 'claude-design',
  async detect(dir) {
    const files = await listTree(dir);
    const html = files.filter((f) => /^[^/]+\.dc\.html$/.test(f));
    return html.length === 1 ? { ok: true, project: 'Widgets', exportedAt: '2026-01-14' } : { ok: false, reason: `expected one *.dc.html, found ${html.length}` };
  },
  async snapshotLayout(dir) {
    const files = await listTree(dir);
    return { copy: files.filter((f) => !f.startsWith('uploads/') && !f.endsWith('.js')), zip: files.filter((f) => f.endsWith('.js')) };
  },
};
const deps = { getDesignAdapter: async () => fakeAdapter };

test('intake pointed at its own snapshot keeps it: the source is copied aside before the snapshot is replaced', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    writeFileSync(zip, writeZip([
      { name: 'Widgets/widgets.dc.html', data: '<main>Widgets</main>' },
      { name: 'Widgets/shots/01.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]));
    const { ctx } = await ctxFor(repo.primary, { feature: null, deps });
    const res = await runIntake(ctx, { source: zip, sentence: 'Redesign the widgets page.' });
    const snap = join(res.worktree, 'docs/design/widgets');
    assert.ok(await isWithin(snap, snap));
    assert.ok(await isWithin(join(snap, 'shots'), snap));
    assert.ok(!(await isWithin(repo.root, snap)));

    const again = await runIntake(ctx, { source: snap });
    assert.ok(again.lines.some((l) => /replaced the snapshot/.test(l)), again.lines.join('\n'));
    assert.equal(readFileSync(join(snap, 'widgets.dc.html'), 'utf8'), '<main>Widgets</main>');
    assert.ok(existsSync(join(snap, 'shots/01.png')));
    assert.ok(existsSync(join(snap, 'README.md')));
  } finally { repo.cleanup(); }
});

test('a worktree intake creates is bootstrapped with commands.bootstrap through the heavy wrapper; a failure is a line, not a stop', async () => {
  const repo = await makeRunRepo({ run: false });
  try {
    const zip = join(repo.root, 'export.zip');
    writeFileSync(zip, writeZip([{ name: 'Widgets/widgets.dc.html', data: '<main>Widgets</main>' }]));
    const env = await ctxFor(repo.primary, { feature: null, deps });
    const res = await runIntake(env.ctx, { source: zip, sentence: 'Redesign the widgets page.' });
    const boot = env.runner.calls.filter((c) => c.shell && /bootstrap/.test(c.args[1]));
    assert.equal(boot.length, 1, 'bootstrapped once, when the worktree was made');
    assert.equal(boot[0].args[1], `node scripts/heavy.mjs -- 'node scripts/bootstrap.mjs --dir ${res.worktree} --port ${BOOTSTRAP_PORT}'`);
    assert.equal(boot[0].cwd, res.worktree);
    assert.ok(res.lines.some((l) => /^bootstrapped the worktree: node scripts\/bootstrap\.mjs/.test(l)), res.lines.join('\n'));

    await runIntake(env.ctx, { source: zip });
    assert.equal(env.runner.calls.filter((c) => c.shell && /bootstrap/.test(c.args[1])).length, 1, 'an existing worktree is not bootstrapped again');

    const failing = await ctxFor(repo.primary, { feature: null, deps, rules: [{ match: /bootstrap/, result: fail(1, 'lockfile out of date') }] });
    const line = await bootstrapWorktree(failing.ctx, { profile: makeProfile(), worktree: res.worktree });
    assert.match(line, /^bootstrap failed \(exit 1\): lockfile out of date; run `node scripts\/bootstrap\.mjs --dir \{dir\} --port \{port\}` in /);
    const none = await bootstrapWorktree(failing.ctx, { profile: makeProfile({ commands: { ...makeProfile().commands, bootstrap: '' } }), worktree: res.worktree });
    assert.match(none, /no bootstrap command/);
  } finally { repo.cleanup(); }
});

