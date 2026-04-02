---
name: design-implementer
description: >
  Use when asked to "implement this design", "execute this design doc",
  "build from design", or "run agents on design". Reads a design doc, creates
  implementation plans with writing-plans, dispatches parallel sub-agents in
  isolated worktrees, reviews PRs, and merges via umbrella branch pattern to
  staging. Fully autonomous — analyzes streams, creates plans, and proceeds
  without user confirmation.
argument-hint: <design-doc-path>
---

# Implement Design

Orchestrate end-to-end implementation of a design document: analyze design, create implementation plans with `writing-plans`, dispatch parallel sub-agents in isolated worktrees, review PRs, merge sub-PRs to a base branch, and create one umbrella PR to staging.

**Announce at start:** "I'm using the design-implementer skill to orchestrate implementation of this design document."

## Phase 1: Analyze Design Doc

Parse `$ARGUMENTS` for the design doc path.

```
Arguments: $ARGUMENTS
Design doc path: first argument (required)
```

**If no design doc path provided:** Ask the user for the path.

### Steps

1. **Read the design doc** in full
2. **Extract work streams** — look for sections like "Work Streams", "Streams", "Tasks", "Implementation Plan", or numbered phases that can run independently
3. **For each stream, extract:**
   - Stream name (short identifier, kebab-case for branch names)
   - Scope summary (1-2 sentences)
   - Full task list (copy the text verbatim — plans need the complete spec)
   - Dependencies on other streams (if any)
   - File paths likely touched (scan spec for filenames, directories, components)
4. **Determine merge order** — streams with no dependencies merge first; if the design doc specifies order, follow it
5. **Identify prerequisites** — anything that must happen before any stream starts (shared migrations, package installs, etc.)
6. **Derive base branch name** — use the design doc title in kebab-case: `feature/[design-name]` (e.g., `feature/admin-phase2`)
7. **Determine execution path:**
   - **Single-stream:** 1 stream OR total tasks across all streams ≤ 3
   - **Multi-stream:** 2+ independent streams with enough work to parallelize

### Present Breakdown

Show the user:

```
## Design: [title from doc]

**Base branch:** feature/[design-name]
**Execution path:** [Single-stream / Multi-stream (N streams)]

### Prerequisites (before any stream)
- [list or "None"]

### Work Streams

| # | Stream | Branch | Scope | Dependencies | Est. Files |
|---|--------|--------|-------|--------------|------------|
| 1 | [name] | feature/[name] | [summary] | None | [count] |
| 2 | [name] | feature/[name] | [summary] | Stream 1 (if any) | [count] |

### Execution Order
- Wave 1: [independent streams — parallel]
- Wave 2: [streams depending on wave 1 — parallel after wave 1 merges]

### Final: Umbrella PR (feature/[design-name] → staging)
```

**Proceed immediately** — do not ask the user to confirm the breakdown.

## Phase 2: Create Plans

### Create Base Branch

**IMPORTANT:** Do NOT checkout the base branch — the user may be working on staging. Create and push without switching:

```bash
git branch feature/[design-name] staging
git push -u origin feature/[design-name]
```

### Handle Prerequisites

If prerequisites exist (shared migrations, package installs, etc.):
1. Create a temporary worktree from the base branch
2. Execute prerequisites there, commit, and push to the base branch
3. Remove the temporary worktree

### Create Implementation Plans

Use `superpowers:writing-plans` to create plans. The plans are the interface between the lead and sub-agents — they must be complete and self-contained.

**Single-stream path:** Invoke `writing-plans` once for a full implementation plan covering all tasks.

**Multi-stream path:** Invoke `writing-plans` once per stream to create a sub-plan for each. Each sub-plan should be independently executable.

Plans are saved to `docs/superpowers/plans/` following the writing-plans convention.

**After creating plans, proceed immediately to Phase 3.**

## Phase 3: Execute

### Single-Stream Path

1. **Create worktree** from the base branch:
   ```bash
   git worktree add ../telitask-[stream-name] -b feature/[stream-name] feature/[design-name]
   ```
2. **Execute plan** using `superpowers:subagent-driven-development` (preferred, same session with review) or `superpowers:executing-plans`
3. **Run CI:** `pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage`
4. **Create sub-PR** targeting the **base branch** using `frontend-tools:pr-creator` — include Setup Required + How to Test sections
5. **Proceed to Phase 4** for review and merge

### Multi-Stream Path

#### Determine Waves

Group streams by dependencies:
- **Wave 1:** All streams with no dependencies (run in parallel)
- **Wave N:** Streams whose dependencies are all satisfied by earlier waves

#### Execute Each Wave

For each wave, spawn **all sub-agents in parallel** using the Agent tool:

```
Agent tool:
  subagent_type: general-purpose
  description: "Implement [stream-name]"
  mode: bypassPermissions
  run_in_background: true
  prompt: [Use implementer template from references/agent-prompts.md]
```

Populate each implementer prompt with:
- Stream name and full spec text (pasted inline — don't make agents read the design doc)
- Plan file path (so the agent can read the structured plan)
- Worktree path and branch name
- **Base branch name:** `feature/[design-name]`
- Prerequisite context (what was already done)
- CI command from CLAUDE.md
- **PR target:** `feature/[design-name]` (NOT staging)

**Wait for all sub-agents in the wave to complete.** Collect PR numbers from their results. Proceed to Phase 4 for this wave's PRs.

#### Between Waves

After merging wave N's PRs to the base branch, spawn wave N+1's sub-agents. They create worktrees from the **updated** base branch, so they automatically have the merged work.

## Phase 4: Review, Merge & Finalize

### Review Sub-PRs

**Single-stream:** Lead runs `/pr-review-and-fix` directly on the PR.

**Multi-stream:** Lead spawns **parallel reviewer sub-agents** (one per PR in the wave):

```
Agent tool:
  subagent_type: general-purpose
  description: "Review PR #[number]"
  mode: bypassPermissions
  run_in_background: true
  prompt: |
    Review and fix PR #[PR_NUMBER] for [stream-name].

    The PR targets the base branch: feature/[DESIGN_NAME]
    Worktree: ../telitask-[STREAM_NAME]

    Run /pr-review-and-fix [PR_NUMBER]

    After the skill completes, report:
    - Review verdict (approved / changes made)
    - Summary of any fixes applied
    - Whether CI passes after fixes
```

All reviews happen concurrently — no serial bottleneck. Reviewers return with verdicts.

### Merge Sub-PRs

After all PRs in a wave are reviewed:
1. Merge to **base branch** in declared dependency order: `gh pr merge [PR#] --squash --delete-branch`
2. If more waves remain, proceed back to Phase 3 for the next wave

### Generate Handover Document

After **all** sub-PRs are merged to the base branch, create `docs/handovers/YYYY-MM-DD-[design-name]-handover.md` by aggregating Setup & Testing sections from all merged sub-PRs.

1. Read each merged sub-PR's description
2. Consolidate into one document, deduplicating env vars and ordering setup steps logically

**Handover document structure:**

```markdown
# [Design Name] — Implementation Handover

**Date:** YYYY-MM-DD
**Design doc:** [path]
**Sub-PRs merged:** #X, #Y, #Z

## Environment Variables

| Variable | Service | How to Obtain | Required |
|----------|---------|---------------|----------|
| [VAR_NAME] | Vercel / Render / Supabase | [instructions] | Yes/No |

## Third-Party Setup

- [Aggregated setup steps from all sub-PRs]

## Database Migrations

- [All migrations in order, noting which sub-PR introduced them]

## Manual Testing Checklist

- [ ] [Combined testing steps from all sub-PRs, ordered logically]

## Known Limitations / Follow-ups

- [Anything scoped out or deferred]
```

### Commit Handover to Base Branch

Commit the handover document to the base branch (use a temporary worktree if needed):

```bash
git worktree add ../telitask-handover feature/[design-name]
# Copy handover doc into worktree, commit, push
git worktree remove ../telitask-handover
```

### Create Umbrella PR

Create the umbrella PR from base branch to staging using `frontend-tools:pr-creator`:

```
PR: feature/[design-name] → staging
```

**Umbrella PR body format:**

```markdown
## Summary

[2-3 sentence overview of the full feature/design implemented]

**Design doc:** [path]

## Sub-PRs

| # | PR | Stream | Summary |
|---|-----|--------|---------|
| 1 | #[number] | [stream-name] | [1-2 line summary from sub-PR] |

## Actions Required

### Environment Variables

| Variable | Service | How to Obtain |
|----------|---------|---------------|
| [VAR] | Vercel / Render / Supabase | [instructions] |

*"None" if no new env vars.*

### Database Migrations

- [All migrations in order]

*"None" if no migrations.*

### Third-Party Setup

- [Aggregated from sub-PRs]

*"None" if no third-party setup.*

## How to Test

1. [End-to-end testing flow across all streams]
2. [Ordered logically, not per-stream]

## Known Limitations / Follow-ups

- [Anything deferred or scoped out]

## Handover

Full handover document: `docs/handovers/YYYY-MM-DD-[design-name]-handover.md`
```

**Leave the umbrella PR open** — the user will review and merge it at their own pace.

### Clean Up

1. **Remove worktrees:**
   ```bash
   git worktree remove ../telitask-[stream-name]
   ```

2. **Report summary:**
   ```
   ## Implementation Complete

   | Stream | Sub-PR | Status |
   |--------|--------|--------|
   | [name] | #[number] | Merged to base branch |

   All [N] streams implemented and merged to base branch.

   **Umbrella PR:** #[number] (feature/[design-name] → staging)
   **Handover:** docs/handovers/[filename]

   Review the umbrella PR when ready — it contains all changes and required actions.
   ```

## Red Flags

**Never:**
- Let sub-agents share a working directory (always use worktrees)
- Use `git add .` or `git add -A` (always add specific files)
- Merge PRs out of declared order (respects dependency chain)
- Skip CI before creating PR or after rebasing
- Reference code from sibling branches that hasn't been merged
- Skip the review phase — every sub-PR gets reviewed
- Proceed past a failing CI — fix it first
- Have implementer sub-agents review their own PRs (nesting depth issue)
- Merge sub-PRs directly to staging — always merge to the base branch
- Checkout the base branch in the user's working directory
- Spawn sub-agents without a plan — always create plans first

**Always:**
- Create a base branch from staging without checking it out
- Create plans with `writing-plans` before dispatching sub-agents
- Paste full stream spec into sub-agent prompts (don't make agents read the design doc)
- Create worktrees from the base branch
- Target sub-PRs to the base branch (not staging)
- Spawn reviewer sub-agents in parallel after implementers return (no serial bottleneck)
- Run full CI before PR creation
- Include detailed Setup & Testing section in every sub-PR description
- Generate handover document after all sub-PRs merge
- Create umbrella PR (base branch → staging) with summary, sub-PR links, and actions required
- Leave umbrella PR open for the user to review and merge
- Clean up worktrees when done

## Integration

**Skills used by lead:**
- `superpowers:writing-plans` — Create implementation plans (full or per-stream)
- `superpowers:subagent-driven-development` — Execute plan (single-stream path)
- `superpowers:executing-plans` — Alternative execution (single-stream path)
- `frontend-tools:pr-creator` — Create sub-PR and umbrella PR
- `frontend-tools:pr-review-and-fix` — Review sub-PRs (single-stream: directly; multi-stream: via reviewer sub-agents)

**Skills used by implementer sub-agents:**
- `superpowers:executing-plans` — Execute assigned plan
- `frontend-tools:pr-creator` — Create PR

**Skills used by reviewer sub-agents:**
- `frontend-tools:pr-review-and-fix` — Review and auto-fix PR

**Project rules enforced:**
- CLAUDE.md agent team rules (commit conventions, CI, worktree isolation)
- Git workflow (feature branches → base branch → staging, never commit to staging directly)
