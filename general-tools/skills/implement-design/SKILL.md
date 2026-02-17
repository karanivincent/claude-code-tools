---
name: implement-design
description: >
  Orchestrate parallel implementation of a design document using Claude Code
  agent teams. Reads a design doc, analyzes complexity to determine optimal
  team structure (single-agent or multi-agent), spawns implementer agents in
  isolated worktrees with a dedicated reviewer. Reviewers communicate directly
  with implementers for fix loops — the lead only handles merges and
  coordination. Supports --auto for fully autonomous mode or checkpoint-based
  mode with user approval gates. Use when asked to "implement this design",
  "execute this plan with agents", "build features from design doc", or
  "run agent team on design".
disable-model-invocation: true
argument-hint: <design-doc-path> [--auto]
---

# Implement Design

Orchestrate end-to-end implementation of a design document: analyze design, determine optimal team structure, spawn parallel implementers in isolated worktrees, pipeline reviews with direct agent-to-agent communication, and merge PRs sequentially.

**Announce at start:** "I'm using the implement-design skill to orchestrate implementation of this design document."

## Phase 1: Analyze Design Doc

Parse `$ARGUMENTS` for the design doc path and `--auto` flag.

```
Arguments: $ARGUMENTS
Design doc path: first argument (required)
Auto mode: --auto flag present (optional, default: false)
```

**If no design doc path provided:** Ask the user for the path.

### Steps

1. **Read the design doc** in full
2. **Extract work streams** — look for sections like "Work Streams", "Streams", "Tasks", "Implementation Plan", or numbered phases that can run independently
3. **For each stream, extract:**
   - Stream name (short identifier, kebab-case for branch names)
   - Scope summary (1-2 sentences)
   - Full task list (copy the text verbatim — agents need the complete spec)
   - Dependencies on other streams (if any)
   - File paths likely touched (scan spec for filenames, directories, components)
4. **Determine merge order** — streams with no dependencies merge first; if the design doc specifies order, follow it
5. **Identify prerequisites** — anything that must happen before any stream starts (shared migrations, package installs, etc.)

### Present Breakdown

Show the user:

```
## Design: [title from doc]

### Prerequisites (before any stream)
- [list or "None"]

### Work Streams

| # | Stream | Branch | Scope | Dependencies | Est. Files |
|---|--------|--------|-------|--------------|------------|
| 1 | [name] | feature/[name] | [summary] | None | [count] |
| 2 | [name] | feature/[name] | [summary] | Stream 1 (if any) | [count] |

### Merge Order
1. Stream X (no dependencies)
2. Stream Y (after X merged)
```

**Checkpoint** (unless `--auto`): Ask user to confirm the breakdown using AskUserQuestion. Options: "Looks good, proceed" / "I want to adjust".

## Phase 1.5: Propose Team Structure

Analyze the work streams from Phase 1 to determine optimal team composition. **Ignore any team size suggestions in the design doc** — analyze from scratch.

### Analysis Rules

Apply these rules in order:

1. **Single-agent path:** If 1 stream OR total tasks across all streams ≤ 3 → recommend **single agent**
2. **High overlap consolidation:** If streams share >70% of file paths → consolidate into fewer agents (group overlapping streams onto one agent)
3. **Linear dependency chain:** If dependency chain is fully linear (A→B→C) → max 2 agents
4. **Independent streams:** If streams are fully independent → 1 agent per stream (cap at 5)
5. **Load balancing:** Group small streams (≤ 2 tasks) onto one agent; keep large streams (5+ tasks) isolated. One agent CAN handle multiple streams sequentially (PR for stream A, then start stream B)
6. **Reviewer count:** 1 reviewer for ≤ 3 PRs total, 2 reviewers for 4+ PRs

### Present Team Structure

Show the user:

```
## Proposed Team Structure

**Path:** [Single-agent / Multi-agent]
**Reasoning:** [1-2 sentences explaining why]

### Agents

| Agent | Type | Assigned Streams | Worktree |
|-------|------|-----------------|----------|
| impl-1 | implementer | [stream-a], [stream-b] | ../telitask-impl-1 |
| impl-2 | implementer | [stream-c] | ../telitask-impl-2 |
| reviewer-1 | reviewer | Reviews all PRs | (uses impl worktrees) |

### Merge Order
1. [stream-a] PR (impl-1) → reviewer-1
2. [stream-b] PR (impl-1, after stream-a merges) → reviewer-1
3. [stream-c] PR (impl-2) → reviewer-1

### PR Count: [N] | Reviewer(s): [1 or 2]
```

**Checkpoint** (unless `--auto`): Ask user to confirm team structure using AskUserQuestion. Options: "Looks good, proceed" / "I want to adjust".

## Phase 2: Setup Agent Team & Tasks

### Handle Prerequisites

If prerequisites exist (shared migrations, package installs, etc.):
1. Execute them on `staging` before spawning agents
2. Commit and push so worktrees pick them up

### Single-Agent Path

If Phase 1.5 recommended single-agent:

1. **Create worktree** (always — user may be working in main directory):
   ```bash
   git worktree add ../telitask-[stream-name] -b feature/[stream-name] staging
   ```
2. **Plan and execute** directly using `superpowers:writing-plans` → `superpowers:executing-plans`
3. **Run CI:** `pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage`
4. **Create PR** using `frontend-tools:github-pr-creator` — include Setup & Testing section (see agent-prompts.md)
5. **Self-review** with `frontend-tools:review-pr`
6. **Fix any issues** from self-review
7. **Generate handover document** (see Phase 5)
8. **Clean up worktree** and report to user

**Skip to Phase 5 after completion** — no team, no reviewer agent needed.

### Multi-Agent Path

#### Create Team

```
TeamCreate:
  team_name: [design-doc-name] (e.g., "admin-phase2")
  description: "Implementing [design title]"
```

#### Create Tasks

For each stream, create **three** tasks:

**Implementation task:**
```
TaskCreate:
  subject: "Implement [stream name]"
  description: "[Full stream spec text from design doc]"
  activeForm: "Implementing [stream name]"
```

**Review task** (blocked by corresponding implementation task):
```
TaskCreate:
  subject: "Review [stream name]"
  description: "Review PR for [stream name], post comments, coordinate fixes with implementer"
  activeForm: "Reviewing [stream name]"
  → TaskUpdate: addBlockedBy: [implementation task ID]
```

**Merge task** (blocked by review task AND previous stream's merge task):
```
TaskCreate:
  subject: "Merge [stream name]"
  description: "Merge [stream name] PR to staging after review approval"
  activeForm: "Merging [stream name]"
  → TaskUpdate: addBlockedBy: [review task ID]
  → TaskUpdate: addBlockedBy: [previous stream's merge task ID] (if not first in merge order)
```

#### Spawn Agents

**Implementer agents** — one per agent assignment from Phase 1.5, all spawned in parallel:

```
Task tool:
  subagent_type: general-purpose
  name: impl-[agent-number or stream-name]
  team_name: [team-name]
  mode: bypassPermissions
  prompt: [Use implementer template from references/agent-prompts.md]
```

Populate each implementer prompt with:
- Stream name(s) and full spec text (pasted inline — don't make agents read the design doc)
- Worktree path and branch name
- Prerequisite context (what was already done)
- CI command: `pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage`
- PR target: `staging`
- **Reviewer name** (so implementer knows who will review their work)

**Reviewer agent(s)** — 1 for ≤ 3 PRs, 2 for 4+ PRs:

```
Task tool:
  subagent_type: general-purpose
  name: reviewer[-N]
  team_name: [team-name]
  mode: bypassPermissions
  prompt: [Use reviewer template from references/agent-prompts.md]
```

If 2 reviewers: split by merge-order position (reviewer-1 gets positions 1, 3, 5; reviewer-2 gets 2, 4, 6).

**Checkpoint** (unless `--auto`): Show spawned agents and task list.

## Phase 3: Implementation (Parallel)

Each implementer works independently in its own worktree. The lead (you) monitors progress.

**What each implementer does** (defined in their spawn prompt):
1. Create worktree: `git worktree add ../telitask-[stream-name] -b feature/[stream-name] staging`
2. Install dependencies: `pnpm install`
3. Use `superpowers:writing-plans` to create implementation plan
4. Use `superpowers:executing-plans` to execute the plan
5. Run full CI: `pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage`
6. Create PR targeting `staging` using `frontend-tools:github-pr-creator` — **must include Setup & Testing section**
7. Mark implementation task as completed
8. Notify lead with PR number
9. **Enter standby** — remain alive, waiting for review feedback from reviewer

**Implementers do NOT shut down after creating the PR.** They remain alive to fix review issues.

**Lead responsibilities during this phase:**
- Monitor agent messages as they come in
- Answer any questions agents raise
- Track which streams have completed
- Handle blockers (provide context, unblock dependencies)
- **Assign reviews to reviewer as soon as each PR is ready** (don't wait for all)

## Phase 4: Pipelined Review & Merge

Reviews start as soon as the first PR is ready — **do not wait for all implementations to complete**.

### Review Assignment

When an implementer notifies that their PR is ready, the lead immediately assigns it to a reviewer:

```
SendMessage:
  type: message
  recipient: reviewer[-N]
  content: |
    Review PR #[PR_NUMBER] for [stream name].
    Implementer: impl-[name] (send feedback directly to them)
    Worktree: ../telitask-[stream-name]
    Branch: feature/[stream-name]

    Review using /review-pr [PR#] --auto-post
    If APPROVED: notify me (the lead) — "PR #X approved, ready to merge"
    If CHANGES_REQUESTED: notify the implementer directly with the list of issues
  summary: "Review PR #[number] for [stream]"
```

### Communication Flow Per PR

1. **Lead → Reviewer:** "Review PR #X for [stream] (implementer: impl-Y)"
2. **Reviewer reviews**, posts comments to GitHub
3. **If APPROVED:** Reviewer → Lead: "PR #X approved, ready to merge"
4. **If CHANGES_REQUESTED:** Reviewer → Implementer: "Fix issues on PR #X: [list]"
5. Implementer fixes, pushes, runs CI
6. Implementer → Reviewer: "Fixes done on PR #X, CI passes/fails"
7. Reviewer re-reviews (focus on diff since last review)
8. Repeat steps 3-7 until approved
9. Reviewer → Lead: "PR #X approved after N rounds"

**Lead only hears:** "PR #X approved" or "Critical issue — escalating" (never fix details).

### Lead's State Tracking

Track each PR through these states:

```
PENDING_REVIEW → IN_REVIEW → READY_TO_MERGE → MERGED
```

The lead does NOT track NEEDS_FIXES — that's between reviewer and implementer.

### Merge Process (Lead Only)

When a reviewer reports "PR #X approved":
1. Verify all predecessor PRs in merge order are MERGED
2. If predecessors aren't merged yet, mark as READY_TO_MERGE and wait
3. Merge: `gh pr merge [PR#] --squash --delete-branch`
4. Mark merge task as completed
5. If more PRs remain, notify all agents with open branches to rebase:
   ```
   SendMessage to each active implementer:
   "staging updated after merging [stream]. Rebase your branch:
    git fetch origin && git rebase origin/staging
    Then re-run CI."
   ```
6. After merge, if the implementer has another assigned stream → tell them to start it. Otherwise → send shutdown request.

**Checkpoint** (unless `--auto`): Confirm after each merge.

### Reviewer Backpressure

Reviewer can have multiple PRs in flight — reviewing PR3 while impl-1 fixes PR1 and impl-2 fixes PR2. **Backpressure rule:** reviewer pauses new reviews if 3+ PRs are in NEEDS_FIXES state (waiting for implementer fixes).

### Multi-Reviewer Coordination

If 2 reviewers are active:
- reviewer-1 handles merge-order positions 1, 3, 5
- reviewer-2 handles merge-order positions 2, 4, 6
- Both report to lead
- Lead still manages merge order centrally (never more than one merge at a time)

## Phase 5: Handover & Cleanup

After all PRs are merged:

### Generate Handover Document

Create `docs/handovers/YYYY-MM-DD-[design-name]-handover.md` by aggregating the Setup & Testing sections from all merged PRs.

1. Read each merged PR's description (already has Setup & Testing info from implementers)
2. Consolidate into one document, deduplicating env vars and ordering setup steps logically
3. Add any cross-cutting concerns (e.g., "run migrations before testing feature X")

**Handover document structure:**

```markdown
# [Design Name] — Implementation Handover

**Date:** YYYY-MM-DD
**Design doc:** [path]
**PRs merged:** #X, #Y, #Z

## Environment Variables

| Variable | Service | How to Obtain | Required |
|----------|---------|---------------|----------|
| [VAR_NAME] | Vercel / Render / Supabase | [instructions] | Yes/No |

## Third-Party Setup

- [Aggregated setup steps from all PRs]

## Database Migrations

- [All migrations in order, noting which PR introduced them]

## Manual Testing Checklist

- [ ] [Combined testing steps from all PRs, ordered logically]

## Known Limitations / Follow-ups

- [Anything scoped out or deferred]
```

### Clean Up

1. **Remove worktrees:**
   ```bash
   git worktree remove ../telitask-[stream-name]
   ```
   For each stream.

2. **Clean up team:**
   - Send shutdown requests to all agents
   - `TeamDelete` after all agents confirm shutdown

3. **Report summary:**
   ```
   ## Implementation Complete

   | Stream | PR | Status |
   |--------|----|--------|
   | [name] | #[number] | Merged |

   All [N] streams implemented and merged to staging.
   Handover document: docs/handovers/[filename]
   [Any issues or notes]
   ```

## Mode Reference

| Mode | Behavior |
|------|----------|
| **Checkpoint** (default) | Pauses for user approval at: breakdown, team structure, agent spawn, after each merge |
| **`--auto`** | Fully autonomous — no pauses, runs start to finish |

## Red Flags

**Never:**
- Let agents share a working directory (always use worktrees — even single-agent)
- Use `git add .` or `git add -A` (always add specific files)
- Merge PRs out of declared order (respects dependency chain)
- Skip CI before creating PR or after rebasing
- Reference code from sibling branches that hasn't been merged
- Skip the review phase — every PR gets reviewed
- Proceed past a failing CI — fix it first
- Have the reviewer fix code — fixes always go back to the implementer
- Relay fix details through the lead — reviewer talks directly to implementer
- Shut down implementers before their PR is merged

**Always:**
- Paste full stream spec into agent prompts (don't make agents read the design doc)
- Create worktrees — even for single-agent mode
- Start reviews as soon as the first PR is ready (don't wait for all)
- Run full CI before PR creation and after rebase
- Rebase remaining branches after each merge
- Include Setup & Testing section in every PR description
- Generate handover document after all merges
- Clean up worktrees and team when done

## Integration

**Skills used by implementer agents:**
- `superpowers:writing-plans` — Create implementation plan
- `superpowers:executing-plans` — Execute plan with batch checkpoints
- `frontend-tools:github-pr-creator` — Create PR
- `frontend-tools:resolve-pr-comments` — Fix review issues (`--auto`)

**Skills used by reviewer agent:**
- `frontend-tools:review-pr` — Post review comments (`--auto-post`)

**Skills used by lead (single-agent path):**
- `superpowers:writing-plans` — Create implementation plan
- `superpowers:executing-plans` — Execute plan
- `frontend-tools:github-pr-creator` — Create PR
- `frontend-tools:review-pr` — Self-review

**Project rules enforced:**
- CLAUDE.md agent team rules (commit conventions, CI, worktree isolation)
- Git workflow (feature branches → staging, never commit to staging directly)
