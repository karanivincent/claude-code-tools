// Decisions for the in-flight board. Pure functions, no git, no network.
//
// The board answers one question — "what work exists that has not landed, and
// what is it waiting on" — for a person who runs several agent sessions at once
// and cannot hold the answer in their head. in-flight.mjs is the I/O around this
// file.
//
// Every rule that decides what a person sees lives here so it can be tested
// against fixtures rather than against whatever thirty worktrees happen to look
// like this afternoon. Nothing here knows anything about a particular project.

/**
 * How recently a branch's HEAD has to have moved before we call it live.
 *
 * Long enough that a session pausing to think does not vanish off the board,
 * short enough that yesterday's abandoned branch does not masquerade as one.
 */
export const LIVE_WINDOW_MINUTES = 90;

/**
 * Past this, a branch is not hanging — it is abandoned.
 *
 * The distinction is the whole point of the board. This repository has branches
 * from three months ago whose work shipped long since; listing them beside a
 * branch somebody touched this morning is what made the existing tools useless
 * for answering "what is going on". Cold branches are counted, never listed.
 *
 * They also cannot be trusted individually: the squash-merge probe below
 * compares a branch against a base that has moved thousands of commits, so an
 * old branch reads as unmerged whether or not its work shipped. A count is the
 * honest granularity for them; the `branch-cleanup` skill is where they get
 * resolved one at a time.
 */
export const COLD_DAYS = 14;

/** Buckets in the order a reader should work through them. */
export const BUCKETS = ['live', 'review', 'stalled', 'landed'];

/** Counted, never enumerated. See COLD_DAYS. */
export const COLD = 'cold';

const BUCKET_TITLES = {
  live: 'Running now',
  review: 'Waiting on you',
  stalled: 'Left hanging',
  landed: 'Landed — worktree can go (node scripts/worktree-sweep.mjs --apply)',
};

/**
 * What an open PR is actually blocked on, most actionable first.
 *
 * `checks` is GitHub's rollup collapsed to one of 'passing' | 'failing' |
 * 'pending' | null, and null means we could not tell — say so rather than
 * implying green. Green checks are not the same as mergeable, so `conflicting`
 * outranks them: 'ready to merge' is the one label here that tells the reader to
 * stop looking and act.
 */
export function reviewState(pr) {
  if (!pr) return null;
  if (pr.isDraft) return 'draft';
  if (pr.checks === 'failing') return 'CI failing';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes requested';
  if (pr.conflicting) return 'conflicts with the base';
  if (pr.checks === 'pending') return 'CI running';
  if (pr.checks === 'passing') return 'ready to merge';
  return 'open';
}

/**
 * Which bucket a branch belongs in.
 *
 * Order matters and is not alphabetical: merged beats everything (there is
 * nothing to do but reclaim), an open PR beats recency (a PR sitting on red CI
 * is waiting on a person whether or not an agent touched it a minute ago), and
 * recency beats staleness.
 *
 * A branch with no unmerged commits and no PR is not in flight at all. It
 * returns null and never reaches the board — otherwise `staging` and every
 * long-dead branch would drown the four lines that matter.
 *
 * `cold` is the caller's assertion that a branch is too old to be worth
 * measuring; the date rule below is the fallback for everything else.
 *
 * `protected` marks the main checkout and the worktree the caller is standing
 * in. Their work may well have landed, but "safe to reclaim" is false for both,
 * and a board that tells you to delete the directory you are working in is one
 * nobody trusts twice.
 */
export function classifyBranch(branch, { now, liveWindowMinutes = LIVE_WINDOW_MINUTES, coldDays = COLD_DAYS } = {}) {
  if (branch.merged) return branch.worktree && !branch.protected ? 'landed' : null;
  if (branch.pr) return 'review';
  // The caller may declare a branch cold without measuring it. Deciding by date
  // costs one field it already has; measuring costs four git processes, and at
  // two hundred branches that is the difference between a board and a coffee
  // break. Nothing below the cold line is listed individually anyway.
  if (branch.cold) return COLD;
  // Zero, not falsy. `ahead: null` means nobody measured — git failed, or the
  // caller chose not to — and unmeasured work has to stay on the board. Only a
  // real zero is evidence there is nothing here.
  if (branch.ahead === 0) return null;

  const touchedAt = branch.touchedAt ? new Date(branch.touchedAt).getTime() : NaN;
  if (!Number.isFinite(touchedAt)) return 'stalled';

  const idleMinutes = (now.getTime() - touchedAt) / 60_000;
  if (idleMinutes < liveWindowMinutes) return 'live';
  if (idleMinutes > coldDays * 24 * 60) return COLD;
  return 'stalled';
}

/**
 * A timestamp as a number, or 0 when it cannot be read.
 *
 * Never compare these as strings. git's `committerdate:iso-strict` carries the
 * committer's UTC offset while `Date.toISOString()` is always Z, so the two
 * spellings of one instant sort against each other by their hour digits — which
 * is exactly the mix a bucket holds when one branch is clean and another dirty.
 */
const instant = (iso) => {
  const at = Date.parse(iso ?? '');
  return Number.isFinite(at) ? at : 0;
};

/** Rows grouped into buckets, each bucket sorted most-recently-touched first. */
export function board(branches, ctx) {
  const grouped = Object.fromEntries([...BUCKETS, COLD].map((b) => [b, []]));
  for (const branch of branches) {
    const bucket = classifyBranch(branch, ctx);
    if (bucket) grouped[bucket].push({ ...branch, bucket });
  }
  for (const bucket of [...BUCKETS, COLD]) {
    grouped[bucket].sort((a, b) => instant(b.touchedAt) - instant(a.touchedAt));
  }
  return grouped;
}

/** "8m", "3h", "2d" — a duration a person reads at a glance, not a timestamp. */
export function ago(iso, now) {
  if (!iso) return '?';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '?';
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * The short facts about a branch, in the order a person needs them.
 *
 * "local-only" comes before everything else it shares a line with on purpose:
 * unpushed work is the only state on this board that a dead laptop destroys.
 */
export function facts(branch, now) {
  const out = [];
  if (branch.pr) out.push(`#${branch.pr.number} ${reviewState(branch.pr)}`);
  // Commit counts are suppressed once the work has landed. `git rev-list` still
  // counts the pre-squash commits, and printing "1 commit" beside a branch whose
  // patch is already in staging reads as unfinished work that is not there.
  if (branch.ahead && !branch.merged) out.push(`${branch.ahead} commit${branch.ahead === 1 ? '' : 's'}`);
  if (branch.ahead && !branch.merged && !branch.pushed) out.push('local-only');
  if (branch.dirty) out.push('uncommitted changes');
  if (branch.drops?.length) out.push(`${branch.drops.length} undrained drop${branch.drops.length === 1 ? '' : 's'}`);
  out.push(`${ago(branch.touchedAt, now)} ago`);
  return out.join(', ');
}

function row(branch, now) {
  const lines = [`  ${branch.name}`, `      ${facts(branch, now)}`];
  if (branch.subject) lines.push(`      ${branch.subject}`);
  return lines.join('\n');
}

/** The full board: every bucket, every branch, one paragraph each. */
export function formatBoard(grouped, { now, base = 'origin/HEAD', stale = null, command = 'in-flight' } = {}) {
  const out = [`# In flight, against ${base}`, ''];
  // Non-empty buckets only, as in the brief. The zeros are the noise the cold
  // collapse exists to keep off this page.
  const counts = BUCKETS.filter((b) => grouped[b].length).map((b) => `${grouped[b].length} ${b}`);
  out.push(counts.length ? counts.join(' · ') : 'nothing outstanding', '');

  for (const bucket of BUCKETS) {
    const rows = grouped[bucket];
    if (!rows.length) continue;
    out.push(`## ${BUCKET_TITLES[bucket]} (${rows.length})`, '');
    out.push(...rows.map((r) => row(r, now)));
    out.push('');
  }

  if (BUCKETS.every((b) => grouped[b].length === 0)) {
    // Cold branches are unresolved, not absent, so claiming everything has
    // landed would contradict the count printed directly underneath.
    out.push(
      grouped[COLD]?.length
        ? 'Nothing recent in flight — only the cold branches below.'
        : 'Nothing in flight. Every branch is either merged or empty.',
      '',
    );
  }

  if (grouped[COLD]?.length) {
    out.push(
      `## Cold (${grouped[COLD].length})`,
      '',
      `  Untouched for over ${COLD_DAYS} days. Counted, not listed — they are old enough`,
      '  that the squash-merge probe cannot tell shipped from abandoned.',
      `  ${command} --json   # names them`,
      '  yond-git:branch-cleanup   # resolves them one at a time',
      '',
    );
  }

  if (stale) out.push(stale, '');
  return out.join('\n').trimEnd();
}

/**
 * The session-start version: counts, then at most a few lines of detail.
 *
 * Returns '' when nothing is in flight. A line at every session start saying
 * "nothing is in flight" is wallpaper within a week, and then the line that
 * matters scrolls past unread — the same reasoning as every other quiet check
 * in .claude/hooks/session-open-issues.sh.
 */
export function formatBrief(grouped, { now, maxRows = 5, stale = null, command = 'in-flight' } = {}) {
  const total = BUCKETS.reduce((n, b) => n + grouped[b].length, 0);
  if (total === 0) return '';

  const counts = BUCKETS.filter((b) => grouped[b].length).map((b) => `${grouped[b].length} ${b}`);
  const out = [`[in flight] ${counts.join(' · ')}`];

  // Live and review first: those are the two a person can act on this minute.
  const shown = [...grouped.live, ...grouped.review, ...grouped.stalled].slice(0, maxRows);
  for (const branch of shown) {
    out.push(`  ${branch.bucket.padEnd(7)} ${branch.name} — ${facts(branch, now)}`);
  }
  const hidden = total - shown.length - grouped.landed.length;
  if (hidden > 0) out.push(`  … and ${hidden} more`);
  if (stale) out.push(`  ${stale}`);
  out.push(`  ${command}   # the whole board`);
  return out.join('\n');
}

/**
 * `base: null` means "work it out from the repository" — see pickBase in
 * in-flight.mjs. A hardcoded default would be wrong in most repositories: the
 * branch work integrates into is `main` in some, `develop` or `staging` in
 * others, and guessing wrong reports every landed branch as still in flight.
 */
export function parseInFlightArgs(argv) {
  const opts = { json: false, brief: false, base: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--brief') opts.brief = true;
    else if (arg === '--base') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--base needs a ref');
      opts.base = value;
      i += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/**
 * `git worktree list --porcelain` into records.
 *
 * The first record is always the main checkout; git documents that ordering and
 * the board relies on it. `branch` is the short name, or null when the worktree
 * has a detached HEAD.
 */
export function parseWorktrees(porcelain) {
  const records = [];
  let current = null;

  const flush = () => {
    if (current) records.push(current);
    current = null;
  };

  for (const raw of (porcelain ?? '').split('\n')) {
    const line = raw.trimEnd();
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('worktree ')) {
      flush();
      current = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, prunable: false };
      continue;
    }
    if (!current) continue;

    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (line === 'detached') current.detached = true;
    else if (line === 'prunable' || line.startsWith('prunable ')) current.prunable = true;
  }
  flush();

  return records;
}

/**
 * Whether `git cherry` says every commit it was given is already upstream.
 *
 * `-` means the patch exists in the base, `+` means it does not. Empty output is
 * not evidence of anything, so it answers false — the answer that keeps work on
 * the board rather than hiding it.
 */
export function cherrySaysMerged(output) {
  const lines = (output ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((l) => l.startsWith('-'));
}
