---
name: issue-executor
description: >
  End-to-end issue resolution orchestrator. Takes a Linear issue URL and autonomously drives it from investigation to reviewable PR.
  Use when: "work on this issue", "execute this issue", "fix this issue", or when pasting a Linear issue URL.
  For bugs: parallel investigation with agent teams, Chrome verification, auto PR review.
  For stories: interactive brainstorming, then autonomous implementation.
disable-model-invocation: true
argument-hint: <linear-issue-url>
---

# Issue Executor

Takes a Linear issue URL and drives it end-to-end: classify, investigate, fix, verify, review, and hand off a clean PR.

**Announce at start:** "I'm using the issue-executor skill to resolve this Linear issue."

## Phase 0: Detection & Classification

Parse `$ARGUMENTS` for the Linear issue URL.

```
Arguments: $ARGUMENTS
Linear URL: first argument (required) — e.g., https://linear.app/telitask/issue/TELI-123
```

**If no URL provided:** Ask the user for the Linear issue URL.

### Steps

1. **Extract issue ID** from URL (e.g., `TELI-123` from `https://linear.app/telitask/issue/TELI-123/...`)
2. **Discover Linear tools** — use `ToolSearch` with query `+linear get issue` to load Linear MCP tools
3. **Fetch issue** via `get_issue` using the extracted ID
4. **Classify** — check issue labels/type for "Bug" or "Story"/"Feature":
   - Has "Bug" label -> Bug Flow
   - Has "Story" or "Feature" label -> Story Flow
   - Unlabeled -> classify via AI analysis of title + description keywords
5. **Announce:** "Classified as **[Bug/Story]**. Routing to [Bug/Story] flow."
6. **Update Linear issue** — use `update_issue` to set:
   - Status: "In Progress"
   - Add comment: "Started working on this issue."

---

## Bug Flow (Fully Autonomous)

### Agent Team

| Agent | Role | Tools |
|-------|------|-------|
| Lead (you) | Orchestrate phases, pick hypotheses, create PR | Full tools + team coordination |
| investigator-a | Frontend-focused debugging | Git worktree, code tools, `superpowers:systematic-debugging` |
| investigator-b | Backend/data-focused debugging | Git worktree, code tools, `superpowers:systematic-debugging` |
| tester | Verify fix via Vercel preview | Chrome plugin (browser automation) |

### Phase 1: Setup

1. **Create fix branch** without checking it out:
   ```bash
   git branch fix/TELI-XXX staging
   git push -u origin fix/TELI-XXX
   ```
2. **Create worktree:**
   ```bash
   git worktree add ../telitask-TELI-XXX fix/TELI-XXX
   ```
3. **Create agent team:**
   ```
   TeamCreate:
     team_name: TELI-XXX
     description: "Bug fix for TELI-XXX: [issue title]"
   ```
4. **Create tasks:** investigation (x2), fix implementation, chrome verification, PR review, handoff
5. **Share context** — send Linear issue details (title, description, reproduction steps) to all agents via `SendMessage`

### Phase 2: Parallel Investigation

Spawn both investigators in parallel:

**investigator-a** (frontend focus):
```
Task tool:
  subagent_type: general-purpose
  name: investigator-a
  team_name: TELI-XXX
  mode: bypassPermissions
  prompt: |
    You are investigating a bug (frontend focus).

    Issue: [title]
    Description: [full description]
    Reproduction steps: [steps]

    Worktree: ../telitask-TELI-XXX
    Branch: fix/TELI-XXX

    Focus on: UI components, client-side logic, rendering, event handlers, state management.

    Use /systematic-debugging to investigate.
    Produce: root cause analysis + ranked hypotheses (most likely first).
    Report findings to the lead when done.
```

**investigator-b** (backend focus):
```
Same structure but focus on: API calls, data flow, server-side logic, database queries,
middleware, Supabase RLS policies, edge functions.
```

Both report findings to the lead via `SendMessage`.

### Phase 3: Hypothesis Selection

When both investigators report back:

| Scenario | Action |
|----------|--------|
| Same root cause from both | High confidence — proceed immediately with that fix |
| Different root causes | Rank all hypotheses, pick most promising, hold others as fallback |
| One found nothing | Use the other's findings |
| Neither found anything | Escalate to user with investigation summary |

Assign the fix to whichever investigator found the winning hypothesis.

### Phase 4: Fix Implementation

The selected investigator:
1. Implements the fix in `../telitask-TELI-XXX`
2. Runs full CI: `pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage`
3. Commits and pushes to `fix/TELI-XXX`
4. Creates PR via `frontend-tools:pr-creator` targeting `staging`
5. Reports PR number to the lead

### Phase 5: Chrome Verification (First Pass)

1. **Wait for Vercel preview** — poll with `gh pr view [PR#] --json url` or use Vercel MCP to check deployment status
2. **Spawn tester agent:**
   ```
   Task tool:
     subagent_type: general-purpose
     name: tester
     team_name: TELI-XXX
     mode: bypassPermissions
     prompt: |
       You are a QA tester verifying a bug fix using the Chrome browser plugin.

       Issue: [title]
       Reproduction steps: [steps from Linear issue]
       Preview URL: [Vercel preview URL]

       1. Use ToolSearch to discover Chrome MCP tools
       2. Navigate to the preview URL
       3. Log in using credentials from the repository root .env:
          - TEST_STAGING_EMAIL / TEST_STAGING_PASSWORD
       4. Follow the reproduction steps exactly
       5. Report: PASS (bug no longer reproduces) or FAIL (still broken, with details)
   ```
3. **On PASS:** Proceed to Phase 6
4. **On FAIL:** Assign fallback hypothesis to the other investigator. Repeat Phases 4-5. If all hypotheses exhausted, present findings to user with what was tried.

### Phase 6: PR Review

1. Lead runs `frontend-tools:pr-reviewer` with `--auto-post` on the PR
2. Lead runs `frontend-tools:pr-comment-resolver` with `--auto` to address review comments
3. Push any fixes from review, re-run CI

### Phase 7: Chrome Verification (Second Pass)

If review changes were significant (not just style/naming):
- Tester re-verifies on the updated Vercel preview
- Quick smoke test: confirm review fixes did not regress the bug fix

If review changes were trivial, skip this pass.

### Phase 8: Handoff

1. **Update Linear issue** — use `ToolSearch` to load Linear MCP, then `update_issue`:
   - Status: "In Review"
   - Add comment with PR link
2. **Present summary:**
   ```
   ## Bug Fix Complete

   **Issue:** TELI-XXX — [title]
   **Root Cause:** [1-2 sentence summary]
   **Fix:** [what was changed]
   **Chrome Verification:** PASS
   **PR Review:** Clean
   **PR:** #[number] ([link])

   The PR is ready for your review.
   ```
3. **Clean up:**
   - Send shutdown requests to all agents
   - `TeamDelete` after confirmations
   - Remove worktree: `git worktree remove ../telitask-TELI-XXX`

---

## Story Flow (Interactive then Autonomous)

### Phase 1: Brainstorming (Interactive)

Invoke `superpowers:brainstorming` with context from the Linear issue:
- Pass issue title, description, and acceptance criteria as input
- User answers brainstorming questions interactively
- Output: design document at `docs/plans/YYYY-MM-DD-<topic>-design.md`

### Phase 2: Implementation (Autonomous)

Invoke `general-tools:design-implementer` with the design document path from Phase 1.

This skill handles everything autonomously:
- Analyzes streams and determines team structure
- Creates umbrella branch, worktrees, agent team
- Parallel implementation with pipelined reviews
- Merges sub-PRs, creates umbrella PR
- Generates handover document

### Phase 3: Completion

1. **Update Linear issue** via Linear MCP:
   - Status: "In Review" (or "Done" if umbrella PR is merged)
   - Add comment with PR links and handover doc path
2. **Present summary:**
   ```
   ## Story Implementation Complete

   **Issue:** TELI-XXX — [title]
   **Design doc:** docs/plans/[filename]
   **Handover:** docs/handovers/[filename]
   **Umbrella PR:** #[number] ([link])
   **Sub-PRs:** #X, #Y, #Z (all merged to base branch)

   Review the umbrella PR when ready.
   ```

---

## Test Credentials

Skills that need to log in use env vars from the **repository root `.env`**:

| Variable | Purpose |
|----------|---------|
| `TEST_STAGING_EMAIL` | Staging login email |
| `TEST_STAGING_PASSWORD` | Staging login password |
| `TEST_PROD_EMAIL` | Production login email |
| `TEST_PROD_PASSWORD` | Production login password |
| `TEST_STAGING_URL` | Staging app URL |
| `TEST_PROD_URL` | Production app URL |

## Red Flags

**Never:**
- Share a working directory across agents (always use worktrees)
- Use `git add .` or `git add -A` (always add specific files)
- Skip CI before creating a PR
- Skip Chrome verification for bug fixes
- Suggest a fix without investigation evidence
- Merge without PR review

**Always:**
- Classify the issue before routing to a flow
- Use worktrees for all implementation work
- Run full CI before PR creation
- Verify bug fixes in the browser via Chrome plugin
- Update the Linear issue status at start ("In Progress") and at completion ("In Review")
- Clean up agents, teams, and worktrees when done

## Integration

**Skills used (Bug Flow):**
- `superpowers:systematic-debugging` — Root cause investigation (investigators)
- `frontend-tools:pr-creator` — Create PR (investigator)
- `frontend-tools:pr-reviewer` — Review PR (`--auto-post`, lead)
- `frontend-tools:pr-comment-resolver` — Fix review issues (`--auto`, lead)

**Skills used (Story Flow):**
- `superpowers:brainstorming` — Interactive design session (lead)
- `general-tools:design-implementer` — Full implementation orchestration (lead)

**MCP tools used:**
- Linear MCP — Fetch issue, update status, add comments
- Chrome MCP — Browser verification (tester agent)
- Vercel MCP — Check preview deployment status (optional)
