import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUCKETS,
  cherrySaysMerged,
  parseWorktrees,
  COLD,
  COLD_DAYS,
  LIVE_WINDOW_MINUTES,
  ago,
  board,
  classifyBranch,
  facts,
  formatBoard,
  formatBrief,
  parseInFlightArgs,
  reviewState,
} from './in-flight-lib.mjs';

const NOW = new Date('2026-08-27T12:00:00Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000).toISOString();
const daysAgo = (n) => minutesAgo(n * 24 * 60);

const branch = (over = {}) => ({
  name: 'feature/x',
  subject: 'a commit',
  ahead: 3,
  merged: false,
  pushed: true,
  worktree: '/tmp/wt',
  protected: false,
  dirty: false,
  drops: [],
  pr: null,
  touchedAt: minutesAgo(10),
  ...over,
});

describe('classifyBranch', () => {
  it('calls a branch touched inside the live window live', () => {
    assert.equal(classifyBranch(branch({ touchedAt: minutesAgo(5) }), { now: NOW }), 'live');
  });

  it('calls a branch touched outside the live window stalled', () => {
    assert.equal(
      classifyBranch(branch({ touchedAt: minutesAgo(LIVE_WINDOW_MINUTES + 1) }), { now: NOW }),
      'stalled',
    );
  });

  it('calls a branch untouched beyond the cold threshold cold', () => {
    assert.equal(classifyBranch(branch({ touchedAt: daysAgo(COLD_DAYS + 1) }), { now: NOW }), COLD);
  });

  it('puts an open PR in review however recently it was touched', () => {
    const withPr = branch({ touchedAt: minutesAgo(1), pr: { number: 7, checks: 'failing' } });
    assert.equal(classifyBranch(withPr, { now: NOW }), 'review');
  });

  it('puts an open PR in review however long it has sat', () => {
    const stale = branch({ touchedAt: daysAgo(60), pr: { number: 7, checks: 'passing' } });
    assert.equal(classifyBranch(stale, { now: NOW }), 'review');
  });

  it('offers a merged branch with a worktree for reclaiming', () => {
    assert.equal(classifyBranch(branch({ merged: true }), { now: NOW }), 'landed');
  });

  it('never offers the checkout you are standing in, merged or not', () => {
    assert.equal(classifyBranch(branch({ merged: true, protected: true }), { now: NOW }), null);
  });

  it('drops a merged branch that has no worktree left', () => {
    assert.equal(classifyBranch(branch({ merged: true, worktree: null }), { now: NOW }), null);
  });

  it('drops a branch with nothing unmerged and no PR', () => {
    assert.equal(classifyBranch(branch({ ahead: 0 }), { now: NOW }), null);
  });

  it('honours the caller calling a branch cold without measuring it', () => {
    // The real script never drives the date rule for cold branches: it sets
    // `cold` and leaves `ahead` unmeasured, which is this path.
    const unmeasured = branch({ cold: true, ahead: null, worktree: null, touchedAt: daysAgo(90) });
    assert.equal(classifyBranch(unmeasured, { now: NOW }), COLD);
  });

  it('keeps a branch whose commit count could not be measured', () => {
    // null is "nobody asked", not "nothing there". A git failure must not
    // silently remove work from the board.
    assert.equal(classifyBranch(branch({ ahead: null }), { now: NOW }), 'live');
    assert.equal(
      classifyBranch(branch({ ahead: null, touchedAt: daysAgo(1) }), { now: NOW }),
      'stalled',
    );
  });

  it('falls back to stalled rather than guessing when the date is unreadable', () => {
    assert.equal(classifyBranch(branch({ touchedAt: 'not a date' }), { now: NOW }), 'stalled');
    assert.equal(classifyBranch(branch({ touchedAt: null }), { now: NOW }), 'stalled');
  });
});

describe('reviewState', () => {
  it('reports the most actionable blocker first', () => {
    assert.equal(reviewState({ isDraft: true, checks: 'failing' }), 'draft');
    assert.equal(reviewState({ checks: 'failing', reviewDecision: 'CHANGES_REQUESTED' }), 'CI failing');
    assert.equal(reviewState({ checks: 'pending', reviewDecision: 'CHANGES_REQUESTED' }), 'changes requested');
    assert.equal(reviewState({ checks: 'pending' }), 'CI running');
    assert.equal(reviewState({ checks: 'passing' }), 'ready to merge');
  });

  it('will not call a conflicting PR ready to merge', () => {
    assert.equal(reviewState({ checks: 'passing', conflicting: true }), 'conflicts with the base');
  });

  it('says only "open" when the checks cannot be read', () => {
    assert.equal(reviewState({ checks: null }), 'open');
  });

  it('has nothing to say about a branch with no PR', () => {
    assert.equal(reviewState(null), null);
  });
});

describe('facts', () => {
  it('leads with the PR and flags work that exists only on this laptop', () => {
    const line = facts(branch({ pushed: false, pr: { number: 12, checks: 'failing' } }), NOW);
    assert.match(line, /^#12 CI failing, 3 commits, local-only/);
  });

  it('suppresses the commit count once the work has landed', () => {
    // git rev-list still counts the pre-squash commits; printing them beside a
    // landed branch reads as unfinished work that is not there.
    const line = facts(branch({ merged: true, ahead: 4, pushed: false }), NOW);
    assert.doesNotMatch(line, /commit/);
    assert.doesNotMatch(line, /local-only/);
  });

  it('counts undrained drops, which a worktree removal would destroy', () => {
    const line = facts(branch({ drops: ['.claude/loose-ends/a.json'] }), NOW);
    assert.match(line, /1 undrained drop\b/);
  });

  it('pluralises drops', () => {
    const line = facts(branch({ drops: ['a', 'b'] }), NOW);
    assert.match(line, /2 undrained drops/);
  });
});

describe('ago', () => {
  it('reads as minutes, hours, then days', () => {
    assert.equal(ago(minutesAgo(8), NOW), '8m');
    assert.equal(ago(minutesAgo(200), NOW), '3h');
    assert.equal(ago(daysAgo(5), NOW), '5d');
  });

  it('does not pretend to know an unreadable date', () => {
    assert.equal(ago(null, NOW), '?');
    assert.equal(ago('nonsense', NOW), '?');
  });
});

describe('board', () => {
  const branches = [
    branch({ name: 'a', touchedAt: minutesAgo(2) }),
    branch({ name: 'b', touchedAt: minutesAgo(30) }),
    branch({ name: 'c', touchedAt: daysAgo(3) }),
    branch({ name: 'd', touchedAt: daysAgo(90) }),
    branch({ name: 'e', ahead: 0, merged: true }),
  ];

  it('groups every branch and sorts each bucket most recent first', () => {
    const grouped = board(branches, { now: NOW });
    assert.deepEqual(grouped.live.map((b) => b.name), ['a', 'b']);
    assert.deepEqual(grouped.stalled.map((b) => b.name), ['c']);
    assert.deepEqual(grouped[COLD].map((b) => b.name), ['d']);
    assert.deepEqual(grouped.landed.map((b) => b.name), ['e']);
  });

  it('stamps each row with the bucket it landed in', () => {
    assert.equal(board(branches, { now: NOW }).live[0].bucket, 'live');
  });

  it('sorts by instant, not by the text of the timestamp', () => {
    // git writes the committer's offset; touchedAt() writes Z. These two are the
    // same moment, and a string comparison ranks the +03:00 spelling first
    // because "16" sorts after "13".
    const offset = branch({ name: 'offset', touchedAt: '2026-08-27T14:30:00+03:00' }); // 11:30Z
    const zulu = branch({ name: 'zulu', touchedAt: '2026-08-27T11:45:00.000Z' }); // 15 min later
    assert.deepEqual(board([offset, zulu], { now: NOW }).live.map((b) => b.name), ['zulu', 'offset']);
  });
});

describe('formatBoard', () => {
  it('names the cold branches only as a count', () => {
    const grouped = board([branch({ name: 'ancient', touchedAt: daysAgo(90) })], { now: NOW });
    const text = formatBoard(grouped, { now: NOW });
    assert.match(text, /## Cold \(1\)/);
    assert.doesNotMatch(text, /ancient/);
  });

  it('says so plainly when nothing is in flight', () => {
    const text = formatBoard(board([], { now: NOW }), { now: NOW });
    assert.match(text, /Nothing in flight/);
  });

  it('does not claim everything landed while counting cold branches', () => {
    const grouped = board([branch({ name: 'ancient', touchedAt: daysAgo(90) })], { now: NOW });
    const text = formatBoard(grouped, { now: NOW });
    assert.doesNotMatch(text, /Every branch is either merged or empty/);
    assert.match(text, /Nothing recent in flight/);
  });

  it('keeps empty buckets out of the headline count', () => {
    const text = formatBoard(board([branch({ name: 'one' })], { now: NOW }), { now: NOW });
    assert.match(text, /^1 live$/m);
    assert.doesNotMatch(text, /0 review/);
  });

  it('carries the stale-checkout warning when there is one', () => {
    const text = formatBoard(board([], { now: NOW }), { now: NOW, stale: 'main is 19 behind' });
    assert.match(text, /main is 19 behind/);
  });
});

describe('formatBrief', () => {
  it('says nothing at all when nothing is in flight', () => {
    // Silence is the point: a line every session start saying "all clear" is
    // wallpaper within a week, and then the line that matters scrolls past.
    assert.equal(formatBrief(board([], { now: NOW }), { now: NOW }), '');
  });

  it('caps the detail and counts what it left out', () => {
    const many = Array.from({ length: 9 }, (_, i) => branch({ name: `b${i}`, touchedAt: daysAgo(2) }));
    const text = formatBrief(board(many, { now: NOW }), { now: NOW, maxRows: 3 });
    assert.equal(text.split('\n').filter((l) => l.startsWith('  stalled')).length, 3);
    assert.match(text, /… and 6 more/);
  });

  it('does not count landed worktrees as work left out', () => {
    const rows = [branch({ name: 'live-one' }), branch({ name: 'done', merged: true })];
    const text = formatBrief(board(rows, { now: NOW }), { now: NOW, maxRows: 5 });
    assert.doesNotMatch(text, /more/);
  });

  it('ignores cold branches entirely', () => {
    const rows = [branch({ name: 'hot' }), branch({ name: 'ancient', touchedAt: daysAgo(90) })];
    const text = formatBrief(board(rows, { now: NOW }), { now: NOW });
    assert.doesNotMatch(text, /ancient/);
    assert.doesNotMatch(text, /more/);
  });
});

describe('parseWorktrees', () => {
  const porcelain = [
    'worktree /repo',
    'HEAD aaaa',
    'branch refs/heads/main',
    '',
    'worktree /repo/.claude/worktrees/wt',
    'HEAD bbbb',
    'detached',
    '',
    'worktree /gone',
    'HEAD cccc',
    'branch refs/heads/feature/x',
    'prunable gitdir file points to non-existent location',
    '',
  ].join('\n');

  it('puts the main checkout first, as git documents', () => {
    assert.equal(parseWorktrees(porcelain)[0].path, '/repo');
  });

  it('shortens branch names and leaves a detached head null', () => {
    const [main, detached] = parseWorktrees(porcelain);
    assert.equal(main.branch, 'main');
    assert.equal(detached.branch, null);
    assert.equal(detached.detached, true);
  });

  it('carries the prunable flag with or without a reason', () => {
    assert.equal(parseWorktrees(porcelain)[2].prunable, true);
  });

  it('has nothing to say about empty input', () => {
    assert.deepEqual(parseWorktrees(''), []);
    assert.deepEqual(parseWorktrees(null), []);
  });
});

describe('cherrySaysMerged', () => {
  it('is merged only when every commit is already upstream', () => {
    assert.equal(cherrySaysMerged('- aaaa\n- bbbb'), true);
    assert.equal(cherrySaysMerged('- aaaa\n+ bbbb'), false);
  });

  it('treats empty output as no evidence, so work stays visible', () => {
    assert.equal(cherrySaysMerged(''), false);
    assert.equal(cherrySaysMerged(null), false);
  });
});

describe('parseInFlightArgs', () => {
  it('leaves the base unset so the caller can work it out from the repository', () => {
    assert.deepEqual(parseInFlightArgs([]), { json: false, brief: false, base: null });
  });

  it('takes --json, --brief and --base', () => {
    const opts = parseInFlightArgs(['--json', '--brief', '--base', 'origin/main']);
    assert.deepEqual(opts, { json: true, brief: true, base: 'origin/main' });
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    assert.throws(() => parseInFlightArgs(['--apply']), /unknown argument/);
  });

  it('refuses --base with nothing after it', () => {
    assert.throws(() => parseInFlightArgs(['--base']), /needs a ref/);
    assert.throws(() => parseInFlightArgs(['--base', '--json']), /needs a ref/);
  });
});

describe('the bucket list', () => {
  it('orders buckets by what a reader should deal with first', () => {
    assert.deepEqual(BUCKETS, ['live', 'review', 'stalled', 'landed']);
  });
});
