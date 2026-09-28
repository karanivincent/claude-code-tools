// C3/C4: apply a small change, or undo one, through a pull request on the plugin's own repository;
// write a large one down as a proposal and file a needs-decision issue. Owner: slice A2.
//
// What this file may touch, and nothing else:
//   - a plugin checkout named by DELIVERY_PLUGIN_REPO or the profile's retro.pluginRepo, on a branch
//     it makes, through git and gh (never a path under ~/.claude/plugins/cache/)
//   - the run's docs/delivery/<feature>/steers.md and proposals/
// It starts only git, gh and the plugin's own test command. It never seeds, dials or opens a
// database, and it never schedules anything.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { classify, normalisePath } from './size.mjs';
import { createGh } from '../core/gh.mjs';

export const SUITE_COMMAND = "node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'";
export const SUITE_TIMEOUT_MS = 20 * 60_000;
export const NEEDS_DECISION = 'needs-decision';

/** Whether a path is (or is under) the plugin cache Claude Code keeps, which is never written. */
export function isCachePath(p) {
  const cache = /(^|[\\/])\.claude[\\/]plugins[\\/]cache([\\/]|$)/;
  const abs = resolve(String(p));
  let real = abs;
  try { real = realpathSync(abs); } catch { /* not there yet: the plain path is all there is */ }
  const home = join(homedir(), '.claude', 'plugins', 'cache');
  return [abs, real].some((x) => cache.test(x) || x === home || x.startsWith(`${home}/`));
}

/**
 * The plugin checkout the retro may change: { repo, dir, slug } or { reason } saying why not.
 * `repo` is the git root; `dir` is the plugin directory inside it (delivery-tools/, or the root itself).
 */
export function resolveCheckout(ctx, profile) {
  const raw = ctx.env?.DELIVERY_PLUGIN_REPO || profile?.retro?.pluginRepo || '';
  if (!raw) return { reason: 'no plugin checkout is set (DELIVERY_PLUGIN_REPO or the profile\'s retro.pluginRepo)' };
  const repo = resolve(ctx.repoRoot, raw);
  if (isCachePath(repo)) return { reason: `${raw} is under ~/.claude/plugins/cache; the retro never writes there` };
  if (!existsSync(join(repo, '.git'))) return { reason: `${raw} is not a git checkout` };
  const dir = existsSync(join(repo, 'delivery-tools', 'tunables.json')) ? join(repo, 'delivery-tools') : existsSync(join(repo, 'tunables.json')) ? repo : null;
  if (!dir) return { reason: `${raw} does not hold the delivery-tools plugin` };
  if (isCachePath(dir)) return { reason: `${dir} is under ~/.claude/plugins/cache; the retro never writes there` };
  return { repo, dir, slug: ctx.env?.DELIVERY_PLUGIN_GH || profile?.retro?.pluginRepoSlug || null };
}

/** The GitHub for the plugin repo: an injected one (tests), else one bound to its slug, else none. */
export function pluginGh(ctx, opts, slug) {
  if (opts?.gh) return opts.gh;
  return slug ? createGh(ctx.runner, { repo: slug, cwd: ctx.repoRoot }) : null;
}

/** "owner/name" from an origin URL of the usual GitHub shapes, else null. */
export function slugFromRemote(url) {
  const m = String(url ?? '').trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

const oneLine = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

/** A short human line for a change. */
export function describeChange(change) {
  switch (change.kind) {
    case 'tunable': return `${change.key}: ${change.from} to ${change.to}`;
    case 'steer': return `steer: ${oneLine(change.text)}`;
    case 'brief-sentence': return `sentence for briefs/${change.brief}.md: ${oneLine(change.text)}`;
    case 'warn-check': return `new warning: ${oneLine(change.description)}`;
    default: return oneLine(change.description ?? change.text ?? change.kind);
  }
}

// ---- Steers: written straight into the run's steers.md, no PR ----

/** Append one steer line to docs/delivery/<feature>/steers.md (once). Returns the repo-relative file. */
export function writeSteer(paths, text) {
  const file = join(paths.deliveryDir, 'steers.md');
  const line = `- ${oneLine(text)}`;
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!old.split('\n').includes(line)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${old}${old && !old.endsWith('\n') ? '\n' : ''}${line}\n`);
  }
  return relative(paths.repoRoot, file);
}

/** Take one steer line back out of a steers.md (an absolute path). */
export function removeSteer(file, text) {
  if (!existsSync(file)) return false;
  const line = `- ${oneLine(text)}`;
  const lines = readFileSync(file, 'utf8').split('\n');
  if (!lines.includes(line)) return false;
  writeFileSync(file, lines.filter((l) => l !== line).join('\n'));
  return true;
}

// ---- Large changes, and small ones that could not be applied: a proposal file and an issue ----

function defaultFor(change, reasons) {
  if (change.kind === 'other' || !change.kind) return 'Look into what made it slow and decide the fix; the retro has no change to offer.';
  if (reasons.some((r) => /loosen/.test(r))) return 'Keep the current setting. The change loosens a check, and the retro never loosens one on its own.';
  return 'Apply it after a read-through. Nothing is applied until you say yes.';
}

/** The proposal's markdown. Pure. */
export function proposalMarkdown(proposal, { feature, size, reasons }) {
  const ev = proposal.evidence.length ? proposal.evidence.map((e) => `- ${e.feature}, ${e.phase}: ${e.minutesLost} minutes lost`) : ['- (none recorded)'];
  const m = proposal.metric;
  return [
    `# Proposal ${proposal.id}`,
    '',
    `From the retro of \`${feature}\`. Size: ${size}.`,
    '',
    '## Evidence',
    ...ev,
    '',
    '## Change',
    describeChange(proposal.change),
    '',
    '```json',
    JSON.stringify(proposal.change, null, 2),
    '```',
    '',
    '## Recommended default',
    defaultFor(proposal.change, reasons),
    '',
    `## Why it is ${size === 'large' ? 'large' : 'not applied'}`,
    ...(reasons.length ? reasons.map((r) => `- ${r}`) : ['- (no reason recorded)']),
    '',
    '## Judged by',
    `${m.name} (${m.better} is better); baseline ${m.baseline ?? 'unknown'}.`,
    '',
  ].join('\n');
}

/**
 * Write the proposal file; for a large change also file a needs-decision issue in the plugin repo.
 * A failure to file is a note, never an error.
 * @returns {Promise<{ file: string, issue: number|null, note: string|null }>}
 */
export async function writeProposal(ctx, paths, proposal, { size, reasons, gh, file: fileIssue = size === 'large' }) {
  const rel = join(relative(paths.repoRoot, paths.deliveryDir), 'proposals', `${proposal.id}.md`);
  const abs = join(paths.repoRoot, rel);
  const md = proposalMarkdown(proposal, { feature: paths.feature, size, reasons });
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, md);
  if (!fileIssue) return { file: rel, issue: null, note: null };
  if (!gh) return { file: rel, issue: null, note: 'no GitHub repo for the plugin is known, so no needs-decision issue was filed' };
  const marker = `<!-- delivery:retro-proposal:${proposal.id} -->`;
  try {
    const open = await gh.issueList({ state: 'open', labels: [NEEDS_DECISION] });
    const found = open.find((i) => String(i.body ?? '').includes(marker));
    if (found) return { file: rel, issue: found.number, note: null };
    await gh.labelEnsure(NEEDS_DECISION, { color: 'd93f0b', description: 'Waiting for a decision from the founder' });
    const issue = await gh.issueCreate({ title: `Retro proposal: ${describeChange(proposal.change).slice(0, 90)}`, body: `${md}\n${marker}\n`, labels: [NEEDS_DECISION] });
    return { file: rel, issue: issue.number, note: null };
  } catch (err) {
    return { file: rel, issue: null, note: `the needs-decision issue could not be filed (${oneLine(err.message).slice(0, 120)})` };
  }
}

// ---- Git on the plugin checkout ----

function gitRunner(ctx, cwd) {
  return async (...args) => {
    const r = await ctx.runner.run('git', args, { cwd });
    if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${oneLine(r.stderr || r.stdout).slice(0, 200)}`);
    return String(r.stdout).trim();
  };
}

/** Lines and files of the staged diff. */
export function parseNumstat(text) {
  let lines = 0;
  const files = [];
  for (const row of String(text).split('\n').filter(Boolean)) {
    const [a, d, ...f] = row.split('\t');
    files.push(normalisePath(f.join('\t')));
    lines += (Number(a) || 0) + (Number(d) || 0);
    if (a === '-' || d === '-') lines += 1000; // a binary file is never small
  }
  return { lines, files };
}

/** Write the change's edit into the plugin directory; returns nothing, throws when it cannot. */
export function editPlugin(dir, change) {
  const inside = (rel) => {
    const abs = resolve(dir, rel);
    if (isAbsolute(rel) || relative(dir, abs).startsWith('..')) throw new Error(`${rel} is outside the plugin`);
    return abs;
  };
  if (change.kind === 'tunable') {
    const file = inside('tunables.json');
    const text = readFileSync(file, 'utf8');
    const re = new RegExp(`("${change.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*\\{\\s*"value"\\s*:\\s*)([-0-9.eE+]+)`);
    const m = text.match(re);
    if (!m) throw new Error(`${change.key} is not in tunables.json`);
    if (Number(m[2]) !== change.from) throw new Error(`${change.key} is ${m[2]} in the checkout, not ${change.from}`);
    writeFileSync(file, text.replace(re, `$1${Number(change.to.toPrecision(12))}`));
  } else if (change.kind === 'brief-sentence') {
    const file = inside(`briefs/${change.brief}.md`);
    if (!existsSync(file)) throw new Error(`briefs/${change.brief}.md does not exist`);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, `${text}${text.endsWith('\n') ? '' : '\n'}${oneLine(change.text)}\n`);
  } else if (change.kind === 'warn-check') {
    const files = change.files && typeof change.files === 'object' ? Object.entries(change.files) : [];
    if (!files.length) throw new Error('the change carries no code for the new check');
    for (const [rel, content] of files) {
      const abs = inside(rel);
      // A new check only adds files. Rewriting an existing check could loosen it, which is large.
      if (existsSync(abs)) throw new Error(`${rel} already exists: a new warning may only add files`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, String(content));
    }
  } else {
    throw new Error(`the retro cannot apply a ${change.kind}`);
  }
}

/** Return to the branch we started on and drop the work branch; never throws. */
async function leave(ctx, repo, orig, branch) {
  await ctx.runner.run('git', ['checkout', '-f', orig], { cwd: repo });
  await ctx.runner.run('git', ['branch', '-D', branch], { cwd: repo });
}

/** Commit, push, open the PR, merge it once the suite has passed. Shared by apply and revert. */
async function shipBranch(ctx, { repo, dir, git, branch, title, body, gh, slug }) {
  const suite = await ctx.runner.sh(SUITE_COMMAND, { cwd: dir, timeoutMs: SUITE_TIMEOUT_MS });
  if (suite.code !== 0) return { ok: false, reason: `the plugin's tests failed (${oneLine(suite.stderr || suite.stdout).slice(-160)})` };
  await git('commit', '-q', '-m', title);
  await git('push', '-q', '-u', 'origin', branch);
  const pr = await gh.prCreate({ title, body, base: 'main', head: branch, draft: false });
  const merge = await ctx.runner.run('gh', ['pr', 'merge', String(pr.number), '--squash', '--delete-branch', ...(slug ? ['--repo', slug] : [])], { cwd: repo });
  if (merge.code !== 0) return { ok: false, pr: pr.number, reason: `PR #${pr.number} is open but did not merge (${oneLine(merge.stderr || merge.stdout).slice(0, 120)})` };
  let mergeSha = null;
  try {
    const view = await gh.prGet(pr.number);
    mergeSha = typeof view?.mergeCommit === 'string' ? view.mergeCommit : view?.mergeCommit?.oid ?? null;
  } catch { /* fall through to the fetched base */ }
  if (!mergeSha) {
    await ctx.runner.run('git', ['fetch', '-q', 'origin', 'main'], { cwd: repo });
    mergeSha = (await ctx.runner.run('git', ['rev-parse', 'origin/main'], { cwd: repo })).stdout.trim() || null;
  }
  return { ok: true, pr: pr.number, mergeSha };
}

/** The plugin repo's GitHub name: given, else read from a github.com origin. */
export async function checkoutSlug(ctx, co) {
  return slugFor(ctx, co, gitRunner(ctx, co.repo));
}

async function slugFor(ctx, co, git) {
  if (co.slug) return co.slug;
  try { return slugFromRemote(await git('remote', 'get-url', 'origin')); } catch { return null; }
}

/**
 * Apply one small change to the plugin checkout through a PR. Returns
 * { status: 'applied', pr, mergeSha, diff } or { status: 'proposal', reason } (nothing changed).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ proposal: object, feature: string, checkout: object, gh: object|null, history: object[], tunables?: object }} o
 */
export async function applyChange(ctx, { proposal, feature, checkout, gh, history, tunables }) {
  const { repo, dir } = checkout;
  if (checkout.reason) return { status: 'proposal', reason: checkout.reason };
  if (!gh) return { status: 'proposal', reason: 'no GitHub repo for the plugin is known (DELIVERY_PLUGIN_GH, the profile\'s retro.pluginRepoSlug, or a github.com origin)' };
  const git = gitRunner(ctx, repo);
  const branch = `retro/${feature}-${proposal.id}`;
  let orig;
  try {
    if (await git('status', '--porcelain')) return { status: 'proposal', reason: 'the plugin checkout has uncommitted changes' };
    orig = await git('rev-parse', '--abbrev-ref', 'HEAD');
    if (orig === 'HEAD') orig = await git('rev-parse', 'HEAD');
    await git('fetch', '-q', 'origin', 'main');
    await git('checkout', '-q', '-b', branch, 'origin/main');
  } catch (err) { return { status: 'proposal', reason: err.message }; }
  try {
    editPlugin(dir, proposal.change);
    await git('add', '-A');
    const diff = parseNumstat(await git('diff', '--cached', '--numstat'));
    const again = classify(proposal.change, diff, { history, tunables });
    if (again.size === 'large') { await leave(ctx, repo, orig, branch); return { status: 'proposal', reason: `the real change is large: ${again.reasons.join('; ')}`, large: true }; }
    const slug = await slugFor(ctx, checkout, git);
    const title = `retro: ${describeChange(proposal.change)}`.slice(0, 120);
    const body = `Made by delivery retro after \`${feature}\`. Judged by ${proposal.metric.name} (${proposal.metric.better} is better), baseline ${proposal.metric.baseline ?? 'unknown'}.\n\n${proposal.evidence.map((e) => `- ${e.feature}, ${e.phase}: ${e.minutesLost} minutes lost`).join('\n')}\n`;
    const shipped = await shipBranch(ctx, { repo, dir, git, branch, title, body, gh, slug });
    await leave(ctx, repo, orig, branch);
    if (!shipped.ok) return { status: 'proposal', reason: shipped.reason, pr: shipped.pr ?? null };
    return { status: 'applied', pr: shipped.pr, mergeSha: shipped.mergeSha, diff };
  } catch (err) {
    await leave(ctx, repo, orig, branch);
    return { status: 'proposal', reason: oneLine(err.message).slice(0, 200) };
  }
}

/**
 * Undo an applied change: git revert of its merge commit on a fresh branch, through the same PR path.
 * @returns {Promise<{ status: 'reverted', revertPr: number } | { status: 'failed', reason: string }>}
 */
export async function revertChange(ctx, { entry, feature, checkout, gh }) {
  if (checkout.reason) return { status: 'failed', reason: checkout.reason };
  if (!gh) return { status: 'failed', reason: 'no GitHub repo for the plugin is known' };
  if (!entry.mergeSha) return { status: 'failed', reason: `${entry.id} has no merge commit on record` };
  const { repo, dir } = checkout;
  const git = gitRunner(ctx, repo);
  const branch = `retro/revert-${entry.id}`.slice(0, 100);
  let orig;
  try {
    if (await git('status', '--porcelain')) return { status: 'failed', reason: 'the plugin checkout has uncommitted changes' };
    orig = await git('rev-parse', '--abbrev-ref', 'HEAD');
    if (orig === 'HEAD') orig = await git('rev-parse', 'HEAD');
    await git('fetch', '-q', 'origin', 'main');
    await git('checkout', '-q', '-b', branch, 'origin/main');
  } catch (err) { return { status: 'failed', reason: err.message }; }
  try {
    const parents = (await git('rev-list', '--parents', '-n', '1', entry.mergeSha)).split(' ').length - 1;
    await git('revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), '--no-commit', entry.mergeSha);
    const slug = await slugFor(ctx, checkout, git);
    const title = `retro: revert ${describeChange(entry.change)}`.slice(0, 120);
    const body = `Made by delivery retro after \`${feature}\`. ${entry.id} (${entry.pr ? `PR #${entry.pr}` : 'no PR'}) made ${entry.metric.name} worse in two runs in a row, so it is undone.\n`;
    const shipped = await shipBranch(ctx, { repo, dir, git, branch, title, body, gh, slug });
    await leave(ctx, repo, orig, branch);
    if (!shipped.ok) return { status: 'failed', reason: shipped.reason };
    return { status: 'reverted', revertPr: shipped.pr };
  } catch (err) {
    await leave(ctx, repo, orig, branch);
    return { status: 'failed', reason: oneLine(err.message).slice(0, 200) };
  }
}
