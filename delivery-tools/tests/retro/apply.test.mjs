// C3/C4 apply: a small change goes through a PR on the plugin checkout; a large one is only written
// down and filed; a checkout under the plugin cache is refused; a change that got worse is undone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { applyChange, revertChange, writeProposal, writeSteer, removeSteer, resolveCheckout, isCachePath, slugFromRemote, parseNumstat, proposalMarkdown, NEEDS_DECISION } from '../../lib/retro/apply.mjs';
import { idFor } from '../../lib/retro/compare.mjs';
import { makePluginRepo, retroEnv, retroRules, fail } from './support.mjs';

const proposalOf = (change, extra = {}) => ({ id: idFor(change), evidence: [{ feature: 'a', phase: 'review', minutesLost: 30 }], change, metric: { name: 'phases.review', baseline: 50, better: 'lower' }, ...extra });
const tunable = { kind: 'tunable', key: 'review.maxBatchItems', from: 20, to: 25 };
const tunablesOf = (plugin, ref = 'HEAD') => JSON.parse(plugin.git('show', `${ref}:delivery-tools/tunables.json`)).tunables;

async function setup(o = {}) {
  const plugin = makePluginRepo();
  const env = await retroEnv({ plugin, ...o });
  const checkout = resolveCheckout(env.ctx, await env.ctx.profile());
  return { plugin, env, checkout, cleanup: () => { plugin.cleanup(); env.repo.cleanup(); } };
}

test('a small tunable goes through a branch, the suite, a pushed commit, a PR and a squash merge', async () => {
  const s = await setup();
  try {
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'applied');
    assert.equal(out.pr, 1);
    assert.deepEqual(out.diff.files, ['tunables.json']);
    const branch = `retro/widgets-${idFor(tunable)}`;
    assert.equal(tunablesOf(s.plugin, `origin/${branch}`)['review.maxBatchItems'].value, 25, 'the pushed branch holds the change');
    assert.equal(s.plugin.git('rev-list', '--count', `origin/main..origin/${branch}`), '1');
    assert.match(s.plugin.git('log', '-1', '--format=%s', `origin/${branch}`), /^retro: review\.maxBatchItems: 20 to 25$/);
    const pr = await s.env.pluginGh.prGet(1);
    assert.equal(pr.headRefName, branch);
    assert.equal(pr.baseRefName, 'main');
    assert.equal(pr.isDraft, false);
    const texts = s.env.runner.texts();
    const suite = texts.findIndex((t) => t.startsWith('node --test'));
    const push = texts.findIndex((t) => t.startsWith('git push'));
    const merge = texts.findIndex((t) => t.startsWith('gh pr merge 1 --squash --delete-branch'));
    assert.ok(suite >= 0 && push > suite && merge > push, 'tests first, then push, then merge');
    assert.equal(s.env.runner.calls[suite].cwd, s.plugin.pluginDir, 'the suite runs in the plugin directory');
    assert.equal(s.plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'the checkout is left on the branch it was on');
    assert.equal(s.plugin.git('status', '--porcelain'), '');
    assert.equal(s.plugin.git('branch', '--list', branch), '', 'the work branch is gone locally');
    assert.equal(tunablesOf(s.plugin)['review.maxBatchItems'].value, 20, 'main itself is untouched until the PR merges');
  } finally { s.cleanup(); }
});

test('a failing suite abandons the branch: nothing pushed, no PR, and the change becomes a proposal', async () => {
  const s = await setup({ rules: retroRules({ suite: fail(1, 'not ok 3 - something broke') }) });
  try {
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.match(out.reason, /tests failed/);
    assert.equal(s.env.pluginGh.db.prs.size, 0);
    assert.ok(!s.env.runner.texts().some((t) => t.startsWith('git push')));
    assert.equal(s.plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    assert.equal(s.plugin.git('status', '--porcelain'), '');
    assert.equal(s.plugin.git('branch', '--list', 'retro/*'), '');
  } finally { s.cleanup(); }
});

test('a PR that will not merge is left open and reported, not claimed as applied', async () => {
  const s = await setup({ rules: retroRules({ merge: fail(1, 'not mergeable') }) });
  try {
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.equal(out.pr, 1);
    assert.match(out.reason, /PR #1 is open but did not merge/);
  } finally { s.cleanup(); }
});

test('the real diff is checked again: a change that grew large is abandoned before the tests run', async () => {
  const s = await setup();
  try {
    const big = { kind: 'warn-check', description: 'warn on long labels', onlyWarns: true, files: { 'lib/checks/long-label.mjs': Array(60).fill('// line').join('\n') } };
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(big), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.equal(out.large, true);
    assert.match(out.reason, /the real change is large.*more than 50/);
    assert.ok(!s.env.runner.texts().some((t) => t.startsWith('node --test')));
    assert.equal(s.env.pluginGh.db.prs.size, 0);
    assert.equal(s.plugin.git('status', '--porcelain'), '');
    assert.equal(s.plugin.git('branch', '--list', 'retro/*'), '');

    const wide = { kind: 'warn-check', description: 'warn', onlyWarns: true, files: { 'agents/new-agent.md': 'x\n' } };
    const out2 = await applyChange(s.env.ctx, { proposal: proposalOf(wide), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.match(out2.reason, /outside the small surface|touches an agent/);
  } finally { s.cleanup(); }
});

test('a brief sentence is appended, and a warn-check with code is written, each in its own PR', async () => {
  const s = await setup();
  try {
    const sentence = { kind: 'brief-sentence', brief: 'reviewer-picture', text: 'Name the state id in every note.' };
    const a = await applyChange(s.env.ctx, { proposal: proposalOf(sentence), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(a.status, 'applied');
    const branch = `origin/retro/widgets-${idFor(sentence)}`;
    assert.match(s.plugin.git('show', `${branch}:delivery-tools/briefs/reviewer-picture.md`), /Compare each state\.\nName the state id in every note\.$/);
    const check = { kind: 'warn-check', description: 'warn on long labels', onlyWarns: true, files: { 'lib/checks/long-label.mjs': '// warns only\nexport const x = 1;\n' } };
    const b = await applyChange(s.env.ctx, { proposal: proposalOf(check), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(b.status, 'applied');
    assert.equal(b.pr, 2);
    const missing = await applyChange(s.env.ctx, { proposal: proposalOf({ ...check, description: 'no code', files: undefined }), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.match(missing.reason, /no code/);
    const noBrief = await applyChange(s.env.ctx, { proposal: proposalOf({ ...sentence, brief: 'nope' }), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.match(noBrief.reason, /does not exist/);
  } finally { s.cleanup(); }
});

test('a tunable whose from is not what the checkout holds is not applied', async () => {
  const s = await setup();
  try {
    const out = await applyChange(s.env.ctx, { proposal: proposalOf({ ...tunable, from: 30, to: 35 }), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.equal(s.plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  } finally { s.cleanup(); }
});

test('a warn-check that would rewrite an existing check is not applied: a new warning only adds files', async () => {
  const s = await setup();
  try {
    const rewrite = { kind: 'warn-check', description: 'warn on long labels', onlyWarns: true, files: { 'tunables.json': '{}\n' } };
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(rewrite), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.match(out.reason, /already exists/);
    assert.equal(s.plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  } finally { s.cleanup(); }
});

test('a checkout with uncommitted changes is left alone', async () => {
  const s = await setup();
  try {
    writeFileSync(join(s.plugin.pluginDir, 'stray.txt'), 'x');
    const out = await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    assert.equal(out.status, 'proposal');
    assert.match(out.reason, /uncommitted/);
    assert.ok(!s.env.runner.texts().some((t) => t.startsWith('git checkout')));
  } finally { s.cleanup(); }
});

test('without a plugin checkout, or without a GitHub for it, the change is a proposal and no git command runs', async () => {
  const s = await setup();
  try {
    const none = resolveCheckout({ env: {}, repoRoot: s.env.repo.worktree }, {});
    assert.match(none.reason, /no plugin checkout/);
    const calls = s.env.runner.calls.length;
    assert.equal((await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: none, gh: s.env.pluginGh, history: [] })).status, 'proposal');
    assert.equal((await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: null, history: [] })).status, 'proposal');
    assert.equal(s.env.runner.calls.length, calls, 'nothing was started');
    assert.match(resolveCheckout({ env: { DELIVERY_PLUGIN_REPO: s.env.repo.worktree }, repoRoot: '/' }, {}).reason, /does not hold the delivery-tools plugin/);
    assert.match(resolveCheckout({ env: { DELIVERY_PLUGIN_REPO: '/nonexistent-dir-x' }, repoRoot: '/' }, {}).reason, /not a git checkout/);
    // the profile key works too
    assert.equal(resolveCheckout({ env: {}, repoRoot: '/' }, { retro: { pluginRepo: s.plugin.dir, pluginRepoSlug: 'example-org/example-plugin' } }).slug, 'example-org/example-plugin');
  } finally { s.cleanup(); }
});

test('a path under ~/.claude/plugins/cache is refused, by name and through a symlink', () => {
  const home = join(homedir(), '.claude', 'plugins', 'cache');
  assert.equal(isCachePath(join(home, 'yond-marketplace', 'delivery-tools')), true);
  assert.equal(isCachePath(home), true);
  assert.equal(isCachePath('/somewhere/.claude/plugins/cache/x/delivery-tools'), true);
  assert.equal(isCachePath('/somewhere/.claude/plugins/cached-not/x'), false);
  assert.equal(isCachePath('/tmp/plugin'), false);
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'delivery-cache-')));
  try {
    const real = join(tmp, '.claude', 'plugins', 'cache', 'p');
    mkdirSync(real, { recursive: true });
    mkdirSync(join(tmp, 'elsewhere'));
    symlinkSync(real, join(tmp, 'elsewhere', 'link'));
    assert.equal(isCachePath(join(tmp, 'elsewhere', 'link')), true, 'a symlink into the cache is the cache');
    const r = resolveCheckout({ env: { DELIVERY_PLUGIN_REPO: join(tmp, 'elsewhere', 'link') }, repoRoot: '/' }, {});
    assert.match(r.reason, /never writes there/);
    const r2 = resolveCheckout({ env: {}, repoRoot: '/' }, { retro: { pluginRepo: real } });
    assert.match(r2.reason, /never writes there/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a cache path makes applyChange and revertChange start nothing', async () => {
  const s = await setup();
  try {
    const cache = resolveCheckout({ env: { DELIVERY_PLUGIN_REPO: join(homedir(), '.claude', 'plugins', 'cache', 'x') }, repoRoot: '/' }, {});
    const calls = s.env.runner.calls.length;
    assert.equal((await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: cache, gh: s.env.pluginGh, history: [] })).status, 'proposal');
    assert.equal((await revertChange(s.env.ctx, { entry: { id: 'x', mergeSha: 'a'.repeat(40), change: tunable, metric: { name: 'm' } }, feature: 'widgets', checkout: cache, gh: s.env.pluginGh })).status, 'failed');
    assert.equal(s.env.runner.calls.length, calls);
  } finally { s.cleanup(); }
});

test('a change that made things worse is reverted through git revert of its merge commit, in a PR', async () => {
  const s = await setup();
  try {
    const applied = await applyChange(s.env.ctx, { proposal: proposalOf(tunable), feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh, history: [] });
    // the stubbed merge did nothing on origin: land the squash the way GitHub would
    const branch = `retro/widgets-${idFor(tunable)}`;
    s.plugin.git('merge', '--squash', `origin/${branch}`);
    s.plugin.git('commit', '-q', '-m', 'squash of the retro PR');
    s.plugin.git('push', '-q', 'origin', 'main');
    const mergeSha = s.plugin.git('rev-parse', 'HEAD');
    assert.equal(tunablesOf(s.plugin)['review.maxBatchItems'].value, 25);
    const entry = { id: idFor(tunable), change: tunable, pr: applied.pr, mergeSha, metric: { name: 'phases.review', baseline: 50, better: 'lower' } };
    const out = await revertChange(s.env.ctx, { entry, feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh });
    assert.equal(out.status, 'reverted');
    assert.equal(out.revertPr, 2);
    assert.equal(tunablesOf(s.plugin, `origin/retro/revert-${entry.id}`)['review.maxBatchItems'].value, 20, 'the revert branch has the old value back');
    assert.equal(s.plugin.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    assert.equal((await s.env.pluginGh.prGet(2)).headRefName, `retro/revert-${entry.id}`);
    assert.ok(s.env.runner.texts().some((t) => t.startsWith('gh pr merge 2 --squash --delete-branch')));
    assert.equal((await revertChange(s.env.ctx, { entry: { ...entry, mergeSha: null }, feature: 'widgets', checkout: s.checkout, gh: s.env.pluginGh })).status, 'failed');
  } finally { s.cleanup(); }
});

test('a large change is written as a proposal file and filed as a needs-decision issue, once', async () => {
  const s = await setup();
  try {
    const change = { kind: 'tunable', key: 'review.autoMatchMaxDiff', from: 0.005, to: 0.006 };
    const p = proposalOf(change);
    const reasons = ['raising review.autoMatchMaxDiff loosens a check'];
    const w = await writeProposal(s.env.ctx, s.env.repo.paths, p, { size: 'large', reasons, gh: s.env.pluginGh });
    assert.equal(w.file, `docs/delivery/widgets/proposals/${p.id}.md`);
    assert.equal(w.issue, 1);
    const md = readFileSync(join(s.env.repo.worktree, w.file), 'utf8');
    for (const part of ['## Evidence', 'a, review: 30 minutes lost', '## Change', '## Recommended default', 'Keep the current setting', '## Why it is large', 'loosens a check', 'phases.review']) assert.ok(md.includes(part), part);
    const issue = await s.env.pluginGh.issueGet(1);
    assert.deepEqual(issue.labels, [NEEDS_DECISION]);
    assert.match(issue.body, new RegExp(`retro-proposal:${p.id}`));
    const again = await writeProposal(s.env.ctx, s.env.repo.paths, p, { size: 'large', reasons, gh: s.env.pluginGh });
    assert.equal(again.issue, 1, 'a re-run finds the open issue');
    assert.equal(s.env.pluginGh.db.issues.size, 1);
    const none = await writeProposal(s.env.ctx, s.env.repo.paths, p, { size: 'large', reasons, gh: null });
    assert.equal(none.issue, null);
    assert.match(none.note, /no needs-decision issue was filed/);
    const broken = { ...s.env.pluginGh, issueList: async () => { throw new Error('gh is down'); } };
    assert.match((await writeProposal(s.env.ctx, s.env.repo.paths, p, { size: 'large', reasons, gh: broken })).note, /could not be filed/);
    const small = await writeProposal(s.env.ctx, s.env.repo.paths, proposalOf(tunable), { size: 'small', reasons: ['no checkout'], gh: s.env.pluginGh });
    assert.equal(small.issue, null, 'a small change that could not be applied gets a file but no issue');
  } finally { s.cleanup(); }
});

test('steers are written straight into the run\'s steers.md, once, and can be taken out', async () => {
  const s = await setup();
  try {
    const file = join(s.env.repo.worktree, 'docs/delivery/widgets/steers.md');
    assert.equal(writeSteer(s.env.repo.paths, 'Shoot the empty state first.'), 'docs/delivery/widgets/steers.md');
    writeSteer(s.env.repo.paths, 'Shoot the empty state first.');
    writeSteer(s.env.repo.paths, 'Name the state id.');
    assert.equal(readFileSync(file, 'utf8'), '- Shoot the empty state first.\n- Name the state id.\n');
    assert.equal(removeSteer(file, 'Shoot the empty state first.'), true);
    assert.equal(removeSteer(file, 'never there'), false);
    assert.equal(removeSteer(join(s.env.repo.worktree, 'nope.md'), 'x'), false);
    assert.equal(readFileSync(file, 'utf8'), '- Name the state id.\n');
    assert.equal(s.env.runner.calls.filter((c) => c.cmd !== 'git').length, 0, 'steers start no process');
  } finally { s.cleanup(); }
});

test('small helpers: remote slugs, numstat, the proposal text', () => {
  assert.equal(slugFromRemote('git@github.com:example-org/example-plugin.git'), 'example-org/example-plugin');
  assert.equal(slugFromRemote('https://github.com/example-org/example-plugin'), 'example-org/example-plugin');
  assert.equal(slugFromRemote('/tmp/origin.git'), null);
  assert.deepEqual(parseNumstat('1\t1\tdelivery-tools/tunables.json\n3\t0\tbriefs/a.md\n'), { lines: 5, files: ['tunables.json', 'briefs/a.md'] });
  assert.ok(parseNumstat('-\t-\timage.png\n').lines > 50, 'a binary file is never small');
  assert.match(proposalMarkdown(proposalOf({ kind: 'other', description: 'look at it' }), { feature: 'widgets', size: 'large', reasons: [] }), /Look into what made it slow/);
});
