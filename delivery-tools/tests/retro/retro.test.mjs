// delivery retro end to end (C2 to C5): the small is applied through a PR, the large is only written
// down and filed, an earlier change that got worse is undone, and none of it reaches beyond git, gh
// and the plugin's own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRetro, reportLines } from '../../lib/retro/retro.mjs';
import { readLedger, ledgerPath } from '../../lib/retro/ledger.mjs';
import { idFor } from '../../lib/retro/compare.mjs';
import { updateState, formatEvent } from '../../lib/core/state.mjs';
import retroCommand from '../../lib/commands/retro.mjs';
import { makePluginRepo, retroEnv, seedLedger, slowReview, earlier, retroRules, fail } from './support.mjs';

const at = (min) => new Date(Date.parse('2026-01-15T20:00:00.000Z') + min * 60000).toISOString();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function withPlugin(fn, o = {}) {
  const plugin = makePluginRepo();
  const env = await retroEnv({ plugin, ...o });
  try { await fn(env, plugin); } finally { plugin.cleanup(); env.repo.cleanup(); }
}
const slowRun = async (env) => {
  await seedLedger(env, [earlier('a', 10, { phases: { review: 40 } }), earlier('b', 12, { phases: { review: 60 } })]);
  await slowReview(env, 80);
};
const gitCalls = (env) => env.runner.texts().filter((t) => /^git (checkout|push|commit|revert|fetch)/.test(t));
const OK_CALL = /^(git |gh pr merge |node --test )/;
const FORBIDDEN = /seed|dial|psql|supabase|crontab|launchctl|schedule|cron\b|\bat\b/i;

test('a slow review becomes a small tunable change, applied through a PR and recorded with its metric', async () => {
  await withPlugin(async (env, plugin) => {
    await slowRun(env);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(res.changed.length, 1);
    assert.match(res.changed[0], /review\.maxBatchItems: 20 to 25 \(PR #1\); judged by phases\.review, baseline 50/);
    assert.deepEqual(res.needsYou, []);
    const [entry] = res.record.autoChanges;
    assert.equal(entry.status, 'applied');
    assert.equal(entry.size, 'small');
    assert.equal(entry.pr, 1);
    assert.deepEqual(entry.metric, { name: 'phases.review', baseline: 50, better: 'lower' });
    assert.ok(entry.mergeSha);
    assert.equal(res.record.phases.review, 80);
    const ledger = await readLedger(ledgerPath(env.repo.paths));
    assert.deepEqual(ledger.map((r) => r.feature), ['a', 'b', 'widgets']);
    assert.equal(ledger[2].autoChanges[0].id, entry.id);
    const lines = reportLines(res).join('\n');
    assert.match(lines, /Changed automatically:\n {2}\S+.*PR #1/);
    assert.match(lines, /Reverted:\n {2}none/);
    assert.match(lines, /Needs you:\n {2}nothing/);
    assert.equal(plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  });
});

test('every process the retro starts is git, gh pr merge or the plugin\'s tests: never a seed, a dial, a database or a schedule', async () => {
  await withPlugin(async (env) => {
    await slowRun(env);
    await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh, propose: [{ change: { kind: 'tunable', key: 'review.autoMatchMaxDiff', from: 0.005, to: 0.006 } }, { change: { kind: 'command', name: 'x' } }] });
    const texts = env.runner.texts();
    assert.ok(texts.length > 5);
    for (const t of texts) {
      assert.match(t, OK_CALL, t);
      assert.doesNotMatch(t.replace(/^git .*retro\/[a-z0-9-]+.*$/, 'git'), FORBIDDEN, t);
    }
    assert.ok(env.runner.calls.every((c) => c.cmd === 'git' || c.cmd === 'gh' || c.args?.[1]?.startsWith('node --test ')));
  });
});

test('the retro\'s source imports nothing that seeds, dials or opens a database, and never mentions a scheduler API', () => {
  const files = [...readdirSync(join(ROOT, 'lib', 'retro')).map((f) => join(ROOT, 'lib', 'retro', f)), join(ROOT, 'lib', 'commands', 'retro.mjs')];
  assert.ok(files.length >= 8);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) assert.doesNotMatch(i, /seed|adapters|capture|sidefx|supabase|pg\b/, `${f} imports ${i}`);
    assert.doesNotMatch(text, /setInterval|setTimeout|crontab|launchctl|node-cron/, f);
  }
});

test('a second retro of the same run changes nothing more: one PR, one line', async () => {
  await withPlugin(async (env) => {
    await slowRun(env);
    await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    const again = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(again.changed, []);
    assert.equal(env.pluginGh.db.prs.size, 1);
    assert.equal((await readLedger(ledgerPath(env.repo.paths))).length, 3);
    assert.equal(again.record.autoChanges.length, 1, 'the earlier change stays in the run\'s line');
  });
});

test('without a plugin checkout the small change is a proposal file, reported, with no issue and no git', async () => {
  const env = await retroEnv({});
  try {
    await slowRun(env);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.changed, []);
    assert.equal(res.needsYou.length, 1);
    assert.match(res.needsYou[0], /no plugin checkout is set/);
    const [entry] = res.record.autoChanges;
    assert.equal(entry.status, 'proposed');
    assert.equal(entry.size, 'small');
    assert.ok(existsSync(join(env.repo.worktree, entry.file)));
    assert.equal(env.pluginGh.db.issues.size, 0);
    assert.equal(env.runner.calls.filter((c) => c.cmd !== 'git' || /checkout|push/.test(c.args.join(' '))).length, 0);
    // a re-run keeps it under "Needs you"
    const again = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(again.needsYou.length, 1);
  } finally { env.repo.cleanup(); }
});

test('a plugin checkout under the plugin cache is refused: nothing is written there, the change is a proposal', async () => {
  const cache = join(homedir(), '.claude', 'plugins', 'cache', 'example-marketplace', 'delivery-tools');
  const env = await retroEnv({ env: { DELIVERY_PLUGIN_REPO: cache } });
  try {
    await slowRun(env);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.match(res.needsYou[0], /never writes there/);
    assert.equal(env.runner.calls.length, 0, 'no process was started');
    assert.equal(existsSync(cache), false);
  } finally { env.repo.cleanup(); }
});

test('a large change is never applied: a proposal file, a needs-decision issue, a line under "Needs you"', async () => {
  await withPlugin(async (env, plugin) => {
    await seedLedger(env, [earlier('a', 10), earlier('b', 12)]);
    await updateState(env.repo.paths, (s) => s, { at: at(300), event: formatEvent({ command: 'wave start', exit: 0 }) });
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(res.record.phases.build, 300);
    assert.deepEqual(res.changed, []);
    assert.equal(res.needsYou.length, 1);
    const [entry] = res.record.autoChanges;
    assert.equal(entry.size, 'large');
    assert.equal(entry.status, 'proposed');
    assert.equal(entry.issue, 1);
    assert.match(res.needsYou[0], new RegExp(`proposals/${entry.id}\\.md, issue #1`));
    assert.match(readFileSync(join(env.repo.worktree, entry.file), 'utf8'), /build phase took 300 minutes/);
    const issue = await env.pluginGh.issueGet(1);
    assert.deepEqual(issue.labels, ['needs-decision']);
    assert.equal(env.pluginGh.db.prs.size, 0);
    assert.deepEqual(gitCalls(env), [], 'no branch, no commit, no push');
    assert.equal(plugin.git('branch', '-a', '--list', '*retro*'), '');
  });
});

test('proposals handed in are sorted by size: anything loosening, seed-safety, a new command or agent is large and never applied', async () => {
  await withPlugin(async (env, plugin) => {
    const big = [
      { change: { kind: 'tunable', key: 'review.autoMatchMaxDiff', from: 0.005, to: 0.006 } },
      { change: { kind: 'tunable', key: 'review.pixelTolerance', from: 16, to: 18 } },
      { change: { kind: 'steer', text: 'Edit delivery-safety.json to allow the table.' } },
      { change: { kind: 'brief-sentence', brief: 'builder', text: 'Skip the copy check on dialogs.' } },
      { change: { kind: 'warn-check', description: 'not a warning', onlyWarns: false, files: { 'lib/checks/x.mjs': 'x' } } },
      { change: { kind: 'command', name: 'newthing' } },
      { change: { kind: 'agent', name: 'newagent' } },
      { change: { kind: 'tunable', key: 'not.a.tunable', from: 1, to: 2 } },
      { change: { kind: 'whatever' } },
    ];
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh, propose: big });
    assert.deepEqual(res.changed, []);
    assert.equal(res.needsYou.length, big.length);
    assert.equal(res.record.autoChanges.length, big.length);
    assert.ok(res.record.autoChanges.every((e) => e.size === 'large' && e.status === 'proposed' && e.issue));
    assert.equal(env.pluginGh.db.issues.size, big.length);
    assert.equal(env.pluginGh.db.prs.size, 0);
    assert.deepEqual(gitCalls(env), []);
    assert.ok(!existsSync(join(env.repo.worktree, 'docs/delivery/widgets/steers.md')), 'a large steer is not written either');
    assert.equal(plugin.git('status', '--porcelain'), '');
  });
});

test('a proposal already in the ledger is left as it is, with a note', async () => {
  await withPlugin(async (env) => {
    const p = { change: { kind: 'command', name: 'x' } };
    await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh, propose: p });
    const again = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh, propose: p });
    assert.match(again.notes[0], /already in the ledger/);
    assert.equal(env.pluginGh.db.issues.size, 1);
    assert.match(reportLines(again).join('\n'), /Notes:/);
  });
});

test('a repeated improvement becomes a steer in the run\'s steers.md, applied without a PR', async () => {
  const env = await retroEnv({});
  try {
    await seedLedger(env, [earlier('a', 10, { improvements: ['Shoot the empty state first (2 rounds lost)'] })]);
    mkdirSync(env.repo.paths.deliveryDir, { recursive: true });
    writeFileSync(join(env.repo.paths.deliveryDir, 'workflow-improvements.md'), '- Shoot the empty state first (3 rounds lost)\n');
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(res.changed.length, 1);
    assert.match(res.changed[0], /steer added to docs\/delivery\/widgets\/steers\.md/);
    assert.equal(readFileSync(join(env.repo.worktree, 'docs/delivery/widgets/steers.md'), 'utf8'), '- Shoot the empty state first (3 rounds lost)\n');
    assert.equal(res.record.autoChanges[0].file, 'docs/delivery/widgets/steers.md');
    assert.equal(env.runner.calls.length, 0);
    assert.equal(env.pluginGh.db.prs.size, 0);
  } finally { env.repo.cleanup(); }
});

test('--dry-run applies, writes and files nothing, and says what would happen', async () => {
  await withPlugin(async (env) => {
    await slowRun(env);
    const before = readFileSync(ledgerPath(env.repo.paths), 'utf8');
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh, dryRun: true });
    assert.match(res.needsYou[0], /\(dry run\).*small, would be applied/);
    assert.equal(readFileSync(ledgerPath(env.repo.paths), 'utf8'), before);
    assert.equal(env.runner.calls.length, 0);
    assert.equal(env.pluginGh.db.writes.length, 0);
  });
});

test('the command reads --propose from a file and prints the three sections', async () => {
  await withPlugin(async (env) => {
    writeFileSync(join(env.repo.worktree, 'p.json'), JSON.stringify({ change: { kind: 'agent', name: 'x' } }));
    env.ctx.pluginGh = env.pluginGh;
    // the command has no injected gh: with no slug it files no issue, and says so
    assert.equal(await retroCommand.run(env.ctx, ['--propose', 'p.json']), 0);
    const text = env.stdout.text();
    assert.match(text, /Changed automatically:\n {2}none/);
    assert.match(text, /Needs you:\n {2}agent-\S+: /);
    assert.match(text, /no needs-decision issue was filed|issue #/);
  });
});

// ---- C4: check every earlier change, undo the ones that did not help ----

const change = { kind: 'tunable', key: 'review.maxBatchItems', from: 20, to: 25 };
const applied = (mergeSha, o = {}) => ({ id: idFor(change), at: '2026-01-10T13:00:00.000Z', kind: 'tunable', change, size: 'small', status: 'applied', metric: { name: 'phases.review', baseline: 50, better: 'lower' }, pr: 7, mergeSha, measured: [], ...o });
const review = (n) => ({ phases: { review: n } });

/** The plugin's main has the change merged, as it would after the PR. */
function mergeChange(plugin) {
  const f = join(plugin.pluginDir, 'tunables.json');
  const text = readFileSync(f, 'utf8');
  const next = text.replace(/("review\.maxBatchItems": \{ "value": )20/, '$125');
  if (next !== text) {
    writeFileSync(f, next);
    plugin.git('commit', '-q', '-am', 'the retro PR, squashed');
    plugin.git('push', '-q', 'origin', 'main');
  }
  return plugin.git('rev-parse', 'HEAD');
}
const ledgerOf = async (env) => Object.fromEntries((await readLedger(ledgerPath(env.repo.paths))).map((r) => [r.feature, r]));

test('C4: worse than the baseline in two consecutive later runs is reverted through a PR, and reported', async () => {
  await withPlugin(async (env, plugin) => {
    const sha = mergeChange(plugin);
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [applied(sha)] }), earlier('b', 11, review(70)), earlier('c', 12, review(75))]);
    await slowReview(env, 80);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(res.reverted.length, 1);
    assert.match(res.reverted[0], /reverted in PR #1; phases\.review was worse than 50 in the last two runs \(75, 80\)/);
    assert.match(reportLines(res).join('\n'), /Reverted:\n {2}\S+: reverted in PR #1/);
    const a = (await ledgerOf(env)).a.autoChanges[0];
    assert.equal(a.status, 'reverted');
    assert.equal(a.revertPr, 1);
    const pr = await env.pluginGh.prGet(1);
    assert.match(pr.headRefName, /^retro\/revert-/);
    assert.equal(JSON.parse(plugin.git('show', `origin/${pr.headRefName}:delivery-tools/tunables.json`)).tunables['review.maxBatchItems'].value, 20);
    // a reverted change is not judged again, and is not proposed again
    const again = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(again.reverted, []);
    assert.equal(env.pluginGh.db.prs.size, 1);
  });
});

test('C4: worse in one run only is mixed; better or equal is kept; no later run leaves it as applied', async () => {
  await withPlugin(async (env) => {
    await seedLedger(env, [
      earlier('a', 10, { ...review(50), autoChanges: [applied('c'.repeat(40))] }),
      earlier('b', 11, review(70)),
      earlier('c', 12, review(30)),
    ]);
    await slowReview(env, 30);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.reverted, []);
    assert.match(res.checked[0], /: mixed \(phases\.review 70, 30, 30 after baseline 50\)/);
    assert.equal((await ledgerOf(env)).a.autoChanges[0].status, 'mixed');
    assert.equal(env.pluginGh.db.prs.size, 0);
  });
  await withPlugin(async (env) => {
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [applied('c'.repeat(40))] }), earlier('b', 11, review(45))]);
    await slowReview(env, 30);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.match(res.checked[0], /: kept/);
    assert.equal((await ledgerOf(env)).a.autoChanges[0].status, 'kept');
  });
  await withPlugin(async (env) => {
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [applied('c'.repeat(40))] })]);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.checked, [], 'the only later run is this one, with no review phase: nothing to say yet');
    assert.equal((await ledgerOf(env)).a.autoChanges[0].status, 'applied');
  });
});

test('C4: the run that made a change never counts as a later run for it', async () => {
  await withPlugin(async (env, plugin) => {
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [applied(mergeChange(plugin))] }), earlier('b', 11, review(40))]);
    await slowReview(env, 80);
    // a's own line is rewritten with a later endedAt, as a re-run of a's retro would do
    await seedLedger(env, [earlier('a', 14, { ...review(90), autoChanges: [applied(mergeChange(plugin))] })]);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.reverted, [], 'with a\'s own 90 counted the last two would be worse; without it they are not');
    assert.match(res.checked[0], /: mixed \(phases\.review 40, 80 after baseline 50\)/);
  });
});

test('C4: a worse change that cannot be reverted (no checkout) goes under "Needs you", not silently dropped', async () => {
  const env = await retroEnv({});
  try {
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [applied('c'.repeat(40))] }), earlier('b', 11, review(70)), earlier('c', 12, review(75))]);
    await slowReview(env, 80);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.reverted, []);
    assert.match(res.needsYou.join('\n'), /it was not reverted \(no plugin checkout is set.*revert PR #7 by hand/);
    assert.equal((await ledgerOf(env)).a.autoChanges[0].status, 'applied');
  } finally { env.repo.cleanup(); }
});

test('C4: a steer that got worse is taken back out of its steers.md', async () => {
  const env = await retroEnv({});
  try {
    const steer = { kind: 'steer', text: 'Shoot the empty state first.' };
    const f = join(env.repo.paths.deliveryDir, 'steers.md');
    mkdirSync(env.repo.paths.deliveryDir, { recursive: true });
    writeFileSync(f, '- Shoot the empty state first.\n- Keep me.\n');
    const entry = { id: idFor(steer), at: '2026-01-10T13:00:00.000Z', kind: 'steer', change: steer, size: 'small', status: 'applied', metric: { name: 'phases.review', baseline: 50, better: 'lower' }, file: 'docs/delivery/widgets/steers.md', measured: [] };
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [entry] }), earlier('b', 11, review(70)), earlier('c', 12, review(75))]);
    await slowReview(env, 80);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.match(res.reverted[0], /steer taken out of docs\/delivery\/widgets\/steers\.md/);
    assert.equal(readFileSync(f, 'utf8'), '- Keep me.\n');
    assert.equal((await ledgerOf(env)).a.autoChanges[0].status, 'reverted');
  } finally { env.repo.cleanup(); }
});

test('C4: a "higher is better" metric is judged the other way round', async () => {
  const env = await retroEnv({});
  try {
    const e = applied('c'.repeat(40), { metric: { name: 'phases.review', baseline: 50, better: 'higher' } });
    await seedLedger(env, [earlier('a', 10, { ...review(50), autoChanges: [e] }), earlier('b', 11, review(70))]);
    await slowReview(env, 90);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.match(res.checked[0], /: kept/);
  } finally { env.repo.cleanup(); }
});

test('a failing plugin suite leaves the small change as a proposal: nothing merged, and it is reported', async () => {
  await withPlugin(async (env) => {
    await slowRun(env);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.equal(res.changed.length, 1);
  }, { rules: retroRules() });
  await withPlugin(async (env) => {
    await slowRun(env);
    const res = await runRetro(env.ctx, env.repo.paths, { gh: env.pluginGh });
    assert.deepEqual(res.changed, []);
    assert.match(res.needsYou[0], /tests failed/);
    assert.equal(res.record.autoChanges[0].status, 'proposed');
    assert.equal(env.pluginGh.db.prs.size, 0);
  }, { rules: retroRules({ suite: fail(1, 'not ok') }) });
});
