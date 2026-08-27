#!/usr/bin/env node
// One board answering "what work is in flight, and what is it waiting on".
//
//   node in-flight.mjs                        # the board
//   node in-flight.mjs --brief                # counts and a few rows
//   node in-flight.mjs --json                 # machine-readable
//   node in-flight.mjs --base origin/develop  # override the integration branch
//
// Several agent sessions can run in one repository at once, each in its own
// worktree, and the state they leave behind is spread across git, GitHub and the
// filesystem: a branch with unpushed commits, a PR sitting on red CI, a worktree
// whose work merged days ago. No single command shows all of it, so answering
// "what is going on right now" means opening three tools and nobody does.
//
// Project-agnostic: everything it needs it reads from the repository it is run
// in. Belongs to the `in-flight` skill in the general-tools plugin.
//
// Read-only in the sense that matters: it never writes a ref, never removes a
// worktree and never posts to GitHub. It does write, once per probed branch, an
// unreferenced loose object — see isMerged below, and note that unlike
// worktree-sweep.mjs this runs at every session start rather than nightly.
// Reclaiming worktrees is somebody else's job and stays there — this never
// removes anything.
//
// Decisions live in in-flight-lib.mjs and are unit-tested; this file is the git
// and gh I/O around them.

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLD_DAYS,
  ago,
  board,
  cherrySaysMerged,
  formatBoard,
  formatBrief,
  parseInFlightArgs,
  parseWorktrees,
} from './in-flight-lib.mjs';

/** argv, never a shell string — branch names are attacker-shaped input. */
function git(args, { cwd, allowFailure = true } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFailure) return null;
    throw err;
  }
}

/**
 * The same call, off the main thread.
 *
 * Every per-branch fact is one git process, a git process is twenty-five
 * milliseconds whatever it is asked, and the per-branch work runs into the
 * hundreds of calls. Run sequentially that is most of a minute of pure spawn
 * latency; run eight at a time it is a couple of seconds. Nothing here writes a
 * ref, so the calls are safe to overlap.
 */
function gitAsync(args, { cwd } = {}) {
  return new Promise((done) => {
    execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout) => done(err ? null : stdout.trim()));
  });
}

/** Runs `worker` over `items`, `limit` at a time, preserving input order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await worker(items[i], i);
  });
  await Promise.all(runners);
  return results;
}

const resolve = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

// Claude Code's drop directories: agents write JSON files here for a Stop hook
// to drain, the files are untracked, and `git worktree remove` destroys them
// silently. A repository that does not use them simply has no such directories.
const DROP_DIRS = ['.claude/loose-ends', '.claude/decisions', '.claude/infra-log'];
const DROP_KEEP = new Set(['.gitignore', 'README.md']);

/** Repo-relative paths of the undrained drop files in one worktree. */
function undrainedDrops(worktreePath) {
  const found = [];
  for (const dir of DROP_DIRS) {
    const abs = join(worktreePath, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (DROP_KEEP.has(name)) continue;
      if (statSync(join(abs, name)).isDirectory()) continue;
      found.push(`${dir}/${name}`);
    }
  }
  return found;
}

/**
 * The branch work integrates into, when nobody said.
 *
 * Not `origin/HEAD` first. That points at the *release* branch, and in a repo
 * that releases through a separate integration branch — `develop`, `staging` —
 * measuring against the release branch reports everything merged this fortnight
 * as still in flight. So an integration branch, where one exists, wins; only
 * then does the repository's own default apply.
 *
 * `--base` overrides all of it, and is the right answer whenever this guesses
 * wrong for a particular repository.
 */
function pickBase(mainPath, verify) {
  for (const candidate of ['origin/develop', 'origin/staging']) {
    if (verify(candidate)) return candidate;
  }
  const head = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd: mainPath });
  if (head) {
    const short = head.replace(/^refs\/remotes\//, '');
    if (verify(short)) return short;
  }
  for (const candidate of ['origin/main', 'origin/master']) {
    if (verify(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether the branch's changes are already in `base`.
 *
 * This repo squash-merges, so `merge-base --is-ancestor` answers no for every
 * branch that has actually landed. The fallback synthesises the single commit a
 * squash would have produced and asks `git cherry` whether that patch is
 * upstream — the same technique as worktree-sweep.mjs, and the reason this board
 * does not report a merged branch as eleven hanging commits.
 *
 * `git commit-tree` writes one loose object per call. It is unreferenced, so
 * git's own gc collects it, and it is the only thing this script writes.
 *
 * Every failure path returns false: not-merged is the answer that keeps work
 * visible, and a board that hides real work is worse than one that repeats
 * itself. The plain-ancestry case is answered in bulk by the caller's one
 * `git branch --merged`, so it is not repeated here; the base ref is verified
 * once by the caller rather than on every branch. The same technique appears in
 * the `branch-cleanup` and worktree-sweep tools for the same reason.
 */
async function isMerged(mainPath, base, head) {
  if (!head) return false;

  const [mergeBase, tree] = await Promise.all([
    gitAsync(['merge-base', base, head], { cwd: mainPath }),
    gitAsync(['rev-parse', `${head}^{tree}`], { cwd: mainPath }),
  ]);
  if (!mergeBase || !tree) return false;

  const synthetic = await gitAsync(['commit-tree', tree, '-p', mergeBase, '-m', 'in-flight probe'], { cwd: mainPath });
  if (!synthetic) return false;

  return cherrySaysMerged(await gitAsync(['cherry', base, synthetic], { cwd: mainPath }));
}

/** GitHub's check rollup collapsed to one word, or null when it cannot be read. */
function rollup(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const states = checks.map((c) => c.conclusion || c.state || c.status || '');
  if (states.some((s) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(s))) return 'failing';
  if (states.some((s) => ['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING'].includes(s))) return 'pending';
  if (states.every((s) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(s))) return 'passing';
  return null;
}

/**
 * Open PRs keyed by head branch.
 *
 * gh is optional on purpose. Without it the board still reports every branch and
 * every worktree from git alone; it just cannot say what is in review. A missing
 * tool must degrade the answer, never withhold it.
 */
function openPullRequests() {
  const raw = (() => {
    try {
      return execFileSync(
        'gh',
        ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,headRefName,isDraft,reviewDecision,mergeable,statusCheckRollup'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 },
      );
    } catch {
      return null;
    }
  })();
  if (!raw) return { byBranch: null };

  try {
    const byBranch = {};
    for (const pr of JSON.parse(raw)) {
      byBranch[pr.headRefName] = {
        number: pr.number,
        isDraft: pr.isDraft,
        reviewDecision: pr.reviewDecision,
        // Green checks are not the same as mergeable. "Ready to merge" is the one
        // label here that tells the reader to stop looking and act, so a PR that
        // conflicts with the base must not wear it.
        conflicting: pr.mergeable === 'CONFLICTING',
        checks: rollup(pr.statusCheckRollup),
      };
    }
    return { byBranch };
  } catch {
    return { byBranch: null };
  }
}

/**
 * When this branch was last worked on.
 *
 * The HEAD commit date is the floor, not the answer: a session forty minutes
 * into a change has committed nothing yet, and calling that branch abandoned is
 * the one mistake this board cannot afford. So a dirty worktree also contributes
 * the newest mtime among its modified files.
 */
function touchedAt(headCommittedAt, worktreePath, changedPaths) {
  let newest = headCommittedAt ? new Date(headCommittedAt).getTime() : 0;
  for (const rel of changedPaths) {
    try {
      newest = Math.max(newest, statSync(join(worktreePath, rel)).mtimeMs);
    } catch {
      // Deleted, renamed, or unreadable. The commit date still stands.
    }
  }
  return newest > 0 ? new Date(newest).toISOString() : headCommittedAt;
}

async function main() {
  let opts;
  try {
    opts = parseInFlightArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`in-flight: ${err.message}\n`);
    process.exit(2);
  }

  const worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain'], { allowFailure: false }) ?? '').map((w) => ({
    ...w,
    path: resolve(w.path),
  }));
  if (!worktrees.length) {
    process.stdout.write('in-flight: git listed no worktrees\n');
    return;
  }
  // git lists the main checkout first; that ordering is documented.
  const mainPath = worktrees[0].path;

  // Resolved and verified once, here, rather than per branch. Without the check
  // a typo in --base makes every measurement below fail to a plausible-looking
  // zero and the board reports an almost-empty repository with exit 0 — the most
  // confident wrong answer this script is capable of.
  const verify = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: mainPath }) !== null;
  if (opts.base) {
    if (!verify(opts.base)) {
      process.stderr.write(`in-flight: no such ref: ${opts.base}\n`);
      process.exit(2);
    }
  } else {
    opts.base = pickBase(mainPath, verify);
    if (!opts.base) {
      process.stderr.write('in-flight: could not find an integration branch — pass --base <ref>\n');
      process.exit(2);
    }
  }

  // The worktree the caller is standing in, and the main checkout, are never
  // offered as reclaimable. Nothing here removes them; the point is only that a
  // board telling you to delete the directory you are working in is not trusted
  // twice.
  const selfPath = resolve(git(['rev-parse', '--show-toplevel']) ?? process.cwd());

  const worktreeByBranch = {};
  for (const w of worktrees) if (w.branch) worktreeByBranch[w.branch] = w;

  const { byBranch: prs } = openPullRequests();

  // Three batched reads instead of four hundred per-branch ones. This repository
  // carries two hundred local branches, and a git process is twenty-five
  // milliseconds whatever it is asked; the difference is a board that answers in
  // under a second and one that takes most of a minute.
  const remoteHeads = Object.fromEntries(
    (git(['for-each-ref', '--format=%(refname:strip=3)%09%(objectname)', 'refs/remotes/origin'], { cwd: mainPath }) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')),
  );
  const ancestorOfBase = new Set(
    (git(['branch', '--merged', opts.base, '--format=%(refname:short)'], { cwd: mainPath }) ?? '')
      .split('\n')
      .filter(Boolean),
  );

  const refs = (git(['for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)%09%(subject)', 'refs/heads'], { cwd: mainPath }) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, head, committedAt, ...subject] = line.split('\t');
      return { name, head, committedAt, subject: subject.join('\t') };
    });

  const coldBefore = Date.now() - COLD_DAYS * 24 * 60 * 60_000;

  const branches = await mapLimit(refs, 8, async (ref) => {
    const worktree = worktreeByBranch[ref.name];

    // A branch with no worktree that nobody has committed to in a fortnight is
    // only ever going to be counted, so it is never measured: no ahead count and
    // no squash-merge probe. The probe alone is four git processes, which across
    // this repository's branches took forty seconds — not something that belongs
    // in a session-start hook. Ancestry-merged branches are already excluded
    // above by one batched `git branch --merged`, so what remains in the cold
    // count is genuinely unresolved.
    const cold = !worktree && new Date(ref.committedAt).getTime() < coldBefore;
    const live = worktree && existsSync(worktree.path) ? worktree.path : null;

    const [merged, aheadRaw, status] = await Promise.all([
      ancestorOfBase.has(ref.name) ? true : cold ? false : isMerged(mainPath, opts.base, ref.head),
      cold ? null : gitAsync(['rev-list', '--count', `${opts.base}..${ref.head}`], { cwd: mainPath }),
      live ? gitAsync(['status', '--porcelain', '--untracked-files=no'], { cwd: live }) : '',
    ]);

    // null means "not measured" — cold by choice, or git could not answer. Both
    // must stay distinguishable from a real zero, which is what removes a branch
    // from the board entirely.
    const ahead = cold || aheadRaw === null ? null : Number(aheadRaw) || 0;
    const remote = remoteHeads[ref.name] ?? null;
    const changed = (status ?? '').split('\n').filter(Boolean).map((l) => l.slice(3).trim());
    const dirty = changed.length > 0;

    return {
      name: ref.name,
      subject: ref.subject,
      ahead,
      cold,
      merged,
      pushed: Boolean(remote) && remote === ref.head,
      worktree: worktree ? worktree.path : null,
      protected: Boolean(worktree && (worktree.path === mainPath || worktree.path === selfPath)),
      dirty,
      drops: live ? undrainedDrops(live) : [],
      pr: prs ? (prs[ref.name] ?? null) : null,
      touchedAt: live ? touchedAt(ref.committedAt, live, changed) : ref.committedAt,
    };
  });

  const now = new Date();
  const grouped = board(branches, { now });

  // Everything above is measured against the local copy of the base ref, so a
  // stale fetch turns branches that landed an hour ago into invented hanging
  // work — the board's worst failure mode, and the one nobody would think to
  // suspect. Say how old the copy is rather than fetching: this runs at session
  // start, and a hook that reaches the network is a hook that hangs.
  const notes = [];
  const fetchHead = join(git(['rev-parse', '--git-common-dir'], { cwd: mainPath }) ?? '.git', 'FETCH_HEAD');
  try {
    const fetchedAt = new Date(statSync(fetchHead).mtimeMs);
    if (now.getTime() - fetchedAt.getTime() > 120 * 60_000) {
      notes.push(`${opts.base} last fetched ${ago(fetchedAt.toISOString(), now)} ago — git -C ${mainPath} fetch`);
    }
  } catch {
    // Never fetched here, or an unreadable git dir. Nothing to claim either way.
  }

  // The main checkout being behind is worth one line, because it is the reason a
  // script added last week is missing there and every path a person types from
  // memory is a version old.
  const behind = Number(git(['rev-list', '--count', `HEAD..${opts.base}`], { cwd: mainPath }) ?? '0') || 0;
  if (behind > 0) notes.push(`${mainPath} is ${behind} commit${behind === 1 ? '' : 's'} behind ${opts.base} — git -C ${mainPath} pull`);
  if (prs === null) notes.push('gh unavailable — review state not shown');
  const stale = notes.length ? notes.join('\n  ') : null;

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ base: opts.base, generatedAt: now.toISOString(), notes, grouped }, null, 2)}\n`,
    );
    return;
  }
  const command = 'in-flight';
  const text = opts.brief
    ? formatBrief(grouped, { now, stale, command })
    : formatBoard(grouped, { now, base: opts.base, stale, command });
  if (text) process.stdout.write(`${text}\n`);
}

// The board is read-only, so there is nothing to unwind on failure — but an
// unhandled rejection prints a stack trace into a session's context, and this
// runs at session start.
await main().catch((err) => {
  process.stderr.write(`in-flight: ${err.message}\n`);
  process.exit(1);
});
