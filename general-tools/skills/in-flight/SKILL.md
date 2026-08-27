---
name: in-flight
description: >
  Show what work is currently in flight across every branch and worktree of a repository, and
  what each piece is waiting on. Sorts into live (a session is on it now), review (open PR, with
  its blocker), stalled (unmerged commits, no PR) and landed (merged, worktree still on disk).
  Triggers: "/in-flight", "what's in flight", "what am I working on", "what's in progress",
  "what did I leave hanging", "what's still open", "where did we get to", "what are my sessions
  doing", "which branches have unmerged work", "anything waiting on me", "catch me up on this
  repo". Read-only — it never merges, pushes, deletes a branch or removes a worktree.
argument-hint: "[--brief] [--json] [--base <ref>]"
---

# In Flight

When several Claude Code sessions run against one repository, the state they leave behind is
spread across three places that never agree with each other:

- **git** — a branch with commits that were never pushed
- **GitHub** — a PR sitting on red CI, or green and waiting for a merge nobody performed
- **the filesystem** — a worktree whose work merged days ago, still holding undrained drop files

Answering "what is going on right now" means opening all three, so in practice nobody does, and
work goes missing — not lost, just invisible. This skill collapses the three into one board.

**Announce at start:** "I'm using the in-flight skill to see what's still open in this repo."

## When to use

- The user has lost track of parallel sessions and asks what is in progress
- Picking up a repository after time away, before starting anything new
- Before starting work, to check whether a branch for it already exists
- After a run of merges, to see which worktrees can be reclaimed

## When NOT to use

- To decide whether a specific PR is mergeable — read the PR
- To clean anything up. This reports; `yond-git:branch-cleanup` prunes branches and a
  worktree sweep reclaims directories. Never chain into either without being asked.
- In a repository with a handful of branches, where `git branch -vv` already answers it

## Running it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/in-flight/scripts/in-flight.mjs"
```

Run it from inside the repository (any worktree of it). If `CLAUDE_PLUGIN_ROOT` is unset,
resolve the path relative to this SKILL.md.

| Flag | Effect |
|---|---|
| *(none)* | The full board |
| `--brief` | Counts plus at most five rows. Prints **nothing** when nothing is in flight. |
| `--json` | Every field, including the cold branches the board only counts, plus `notes` |
| `--base <ref>` | The branch work integrates into. Auto-detected otherwise. |

Exit 2 means the base ref does not resolve — pass a real one rather than retrying.

## Reading the board

Four buckets, ordered by what to deal with first.

| Bucket | Means | What to do |
|---|---|---|
| `live` | Touched inside the last 90 minutes | Nothing — a session is on it |
| `review` | Has an open PR | Whatever the PR is blocked on: red CI, conflicts, changes requested, or a merge |
| `stalled` | Unmerged commits, no PR, quiet for over 90 minutes | Decide: finish it, push it, or drop it |
| `landed` | Merged, worktree still on disk | Reclaim the directory |

Anything untouched for over a fortnight is counted as `cold` and never listed — that line is
what makes the board readable rather than three months of dead branches.

Two flags on a row are worth calling out by name when you report:

- **`local-only`** — the commits exist on one machine and nowhere else. It is the only state on
  this board that a lost laptop destroys.
- **`N undrained drops`** — filed loose ends or decision records that a worktree removal would
  delete silently. Never suggest reclaiming a worktree that has them.

## How to report it

Do not paste the board and stop. Read it, then say in two or three sentences: what is running
right now, what is waiting on the user and why, and what has been sitting longest. Name branches
and PR numbers. Lead with anything `local-only` or carrying undrained drops.

If a `notes` line appears — a stale fetch, a main checkout behind the base, `gh` unavailable —
repeat it, because every classification above it is only as good as the data it warns about.

## Three things about the mechanism

- **Merge detection survives squash merges.** `git rev-list --count <base>..<branch>` reports the
  pre-squash commits, so every squash-merged branch reads as abandoned work. The script
  synthesises the commit a squash would have produced and asks `git cherry` whether that patch is
  already upstream. Do not "simplify" this to a commit count.
- **The base branch is guessed, and the guess can be wrong.** `origin/develop` and
  `origin/staging` win over the repository's default branch, because a repo with an integration
  branch integrates there and measuring against the release branch would report a fortnight of
  merged work as still in flight. Pass `--base` when the guess is wrong for a project.
- **It reads local refs only.** Nothing here fetches — a hook that reaches the network is a hook
  that hangs. A branch merged five minutes ago reads as `stalled` until `git fetch`, and the
  board says so itself when `FETCH_HEAD` is over two hours old.

## Making it automatic

A board somebody has to remember to run is half a solution. In a project that wants it at every
session start, add a `SessionStart` hook that runs the script with `--brief`, discards stderr,
and never exits non-zero. `--brief` prints nothing when nothing is in flight, so the quiet case
stays quiet — a line every session saying "all clear" is wallpaper within a week.

## Tests

```bash
node --test "${CLAUDE_PLUGIN_ROOT}/skills/in-flight/scripts/in-flight-lib.test.mjs"
```

Every rule that decides what a reader sees lives in `scripts/in-flight-lib.mjs` and is covered
there. `scripts/in-flight.mjs` is the git and `gh` I/O around it, deliberately thin.
