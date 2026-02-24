---
name: issue-executor
description: >
  End-to-end issue resolution orchestrator. Takes a Linear issue URL and autonomously drives it from investigation to reviewable PR.
  Use when: "work on this issue", "execute this issue", "fix this issue", or when pasting a Linear issue URL.
  For bugs: routes to lightweight (single-agent) or full (agent team) flow based on complexity. Flexible verification by bug type.
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
   - Has "Bug" label -> Bug Flow (proceed to Complexity Gate)
   - Has "Story" or "Feature" label -> Story Flow
   - Unlabeled -> classify via AI analysis of title + description keywords
5. **Announce:** "Classified as **[Bug/Story]**. Routing to [Bug/Story] flow."
6. **Update Linear issue** — use `update_issue` to set:
   - Status: "In Progress"
   - Add comment: "Started working on this issue."

---

## Bug Complexity Gate

After classifying as a bug, assess complexity to choose the right flow.

| Question | Lightweight Signal | Full Signal |
|----------|-------------------|-------------|
| Root cause identified in issue? | Yes — issue points to specific code/behavior | No — vague symptoms only |
| Estimated files to change? | < 5 | 5+ or unknown |
| Well-documented (logs, repro steps, evidence)? | Yes | No or vague |
| Multiple competing hypotheses possible? | No — likely one root cause | Yes — could be several things |

**Routing:**
- **3-4 Lightweight signals** -> Lightweight Bug Flow
- **0-2 Lightweight signals** -> Full Bug Flow (Agent Team)
- **When in doubt**, default to Lightweight — you can escalate to Full at any point.

**Announce:** "Complexity assessment: **[Lightweight/Full]**. Using [Lightweight/Full] Bug Flow."

---

## Lightweight Bug Flow

For well-scoped bugs where the lead can investigate and fix alone.

### Phase L1: Setup

1. **Create fix branch** without checking it out:
   ```bash
   git branch fix/TELI-XXX staging
   git push -u origin fix/TELI-XXX
   ```
2. **Create worktree:**
   ```bash
   git worktree add ../telitask-TELI-XXX fix/TELI-XXX
   ```
3. **Working directory guard:** All subsequent work happens in `../telitask-TELI-XXX`. Do NOT modify files in the main working directory.

### Phase L2: Investigate & Fix

1. Use `superpowers:systematic-debugging` to investigate in the worktree
2. Identify root cause and implement fix
3. Run full CI:
   ```bash
   cd ../telitask-TELI-XXX && pnpm typecheck && pnpm lint && pnpm build && pnpm test -- -- --coverage
   ```
4. Commit and push to `fix/TELI-XXX`

**Escalation clause:** If during investigation you discover the bug is more complex than expected (multiple competing hypotheses, cross-cutting concerns, 5+ files), escalate to Full Bug Flow. Announce: "Escalating to Full Bug Flow — complexity exceeded lightweight threshold."

### Phase L3: Create PR

Use `frontend-tools:pr-creator` to create a PR targeting `staging`.

### Phase L4: Verification

Choose verification method based on bug type:

| Bug Type | Verification Method |
|----------|-------------------|
| UI / visual / interaction | Chrome verification — use tester prompt from `references/agent-prompts.md` |
| API / backend / data | Automated tests + manual curl/API verification in terminal |
| Infrastructure / config / build | Verify via CI pass + document rationale for why CI coverage is sufficient |
| Voice server / Twilio | Test via API client or document manual test steps for user |

For Chrome verification: wait for Vercel preview, then spawn tester agent.
For non-UI: document what was verified and how in the PR description.

### Phase L5: PR Review

1. Run `frontend-tools:pr-reviewer` with `--auto-post`
2. Run `frontend-tools:pr-comment-resolver` with `--auto`
3. Push any fixes, re-run CI
4. Follow the **PR Thread Resolution Checklist** (see below)

### Phase L6: Handoff

1. **Update Linear issue** — use `ToolSearch` to load Linear MCP, then `update_issue`:
   - Status: "In Review"
   - Add comment with PR link
2. **Present summary:**
   ```
   ## Bug Fix Complete

   **Issue:** TELI-XXX — [title]
   **Flow:** Lightweight
   **Root Cause:** [1-2 sentence summary]
   **Fix:** [what was changed]
   **Verification:** [method used + result]
   **PR Review:** Clean
   **PR:** #[number] ([link])

   The PR is ready for your review.
   ```
3. **Clean up:** Remove worktree: `git worktree remove ../telitask-TELI-XXX`

---

## Full Bug Flow (Agent Team)

For complex bugs requiring parallel investigation.

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
3. **Working directory guard:** All subsequent work happens in `../telitask-TELI-XXX`. Do NOT modify files in the main working directory.
4. **Create agent team:**
   ```
   TeamCreate:
     team_name: TELI-XXX
     description: "Bug fix for TELI-XXX: [issue title]"
   ```
5. **Create tasks:** investigation (x2), fix implementation, verification, PR review, handoff
6. **Share context** — send Linear issue details (title, description, reproduction steps) to all agents via `SendMessage`

### Phase 2: Parallel Investigation

Read prompt templates from `references/agent-prompts.md` and spawn both investigators in parallel using the **Investigator-A** and **Investigator-B** templates. Fill in all placeholders with actual issue details.

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

### Phase 5: Verification (First Pass)

Choose verification method based on bug type:

| Bug Type | Verification Method |
|----------|-------------------|
| UI / visual / interaction | Chrome verification — spawn tester using prompt from `references/agent-prompts.md` |
| API / backend / data | Automated tests + manual curl/API verification in terminal |
| Infrastructure / config / build | Verify via CI pass + document rationale for why CI coverage is sufficient |
| Voice server / Twilio | Test via API client or document manual test steps for user |

**For Chrome verification:**
1. Wait for Vercel preview — poll with `gh pr view [PR#] --json url`
2. Spawn tester agent using the **Tester** template from `references/agent-prompts.md`
3. On PASS: proceed to Phase 6
4. On FAIL: assign fallback hypothesis to the other investigator. Repeat Phases 4-5. If all hypotheses exhausted, present findings to user.

**For non-UI verification:**
1. Run relevant tests, curl commands, or log checks
2. Document verification steps and results
3. Proceed to Phase 6

### Phase 6: PR Review

1. Lead runs `frontend-tools:pr-reviewer` with `--auto-post` on the PR
2. Lead runs `frontend-tools:pr-comment-resolver` with `--auto` to address review comments
3. Push any fixes from review, re-run CI
4. Follow the **PR Thread Resolution Checklist** (see below)

### Phase 7: Verification (Second Pass)

If review changes were significant (not just style/naming):
- Re-verify using the same method as Phase 5
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
   **Flow:** Full (Agent Team)
   **Root Cause:** [1-2 sentence summary]
   **Fix:** [what was changed]
   **Verification:** [method used + result]
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

## PR Thread Resolution Checklist

Used by both Lightweight and Full Bug Flows after PR review.

1. **Query unresolved threads:**
   ```bash
   gh api graphql -f query='
     query($owner:String!, $repo:String!, $pr:Int!) {
       repository(owner:$owner, name:$repo) {
         pullRequest(number:$pr) {
           reviewThreads(first:100) {
             nodes { isResolved id comments(first:1) { nodes { body path } } }
           }
         }
       }
     }' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER
   ```
2. **For each unresolved thread:** Either fix the issue and push, or resolve the thread if it was addressed:
   ```bash
   gh api graphql -f query='
     mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { isResolved } } }
   ' -f id=THREAD_NODE_ID
   ```
3. **Push any code changes** from resolving threads, then re-run CI
4. **Confirm zero unresolved threads** before handoff

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
- Edit files in the main working directory after creating a worktree
- Use `git add .` or `git add -A` (always add specific files)
- Skip CI before creating a PR
- Suggest a fix without investigation evidence
- Merge without PR review
- Leave unresolved PR threads at handoff

**Always:**
- Classify the issue before routing to a flow
- Assess bug complexity before choosing Lightweight vs Full flow
- Use worktrees for all implementation work
- Run full CI before PR creation
- Verify bug fixes using the appropriate method for the bug type (Chrome for UI, tests/curl for API, CI/logs for infra)
- Update the Linear issue status at start ("In Progress") and at completion ("In Review")
- Resolve all PR review threads before handoff
- Clean up agents, teams, and worktrees when done

## Integration

**Skills used (Lightweight Bug Flow):**
- `superpowers:systematic-debugging` — Root cause investigation (lead)
- `frontend-tools:pr-creator` — Create PR (lead)
- `frontend-tools:pr-reviewer` — Review PR (`--auto-post`, lead)
- `frontend-tools:pr-comment-resolver` — Fix review issues (`--auto`, lead)

**Skills used (Full Bug Flow):**
- `superpowers:systematic-debugging` — Root cause investigation (investigators)
- `frontend-tools:pr-creator` — Create PR (investigator)
- `frontend-tools:pr-reviewer` — Review PR (`--auto-post`, lead)
- `frontend-tools:pr-comment-resolver` — Fix review issues (`--auto`, lead)

**Skills used (Story Flow):**
- `superpowers:brainstorming` — Interactive design session (lead)
- `general-tools:design-implementer` — Full implementation orchestration (lead)

**MCP tools used:**
- Linear MCP — Fetch issue, update status, add comments
- Chrome MCP — Browser verification (tester agent, UI bugs only)
- Vercel MCP — Check preview deployment status (optional)
