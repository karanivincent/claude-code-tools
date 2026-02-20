---
name: pr-comment-resolver
description: |
  Systematically process PR review comments with critical analysis, not blind compliance.
  Use when:
  - User says "address PR comments", "resolve review feedback", "fix PR review"
  - User invokes /resolve-pr-comments with PR number or URL
  - User needs to respond to code review comments on a pull request
  - User wants to work through reviewer feedback methodically
  Supports --auto flag for fully autonomous processing (no prompts, batch analysis, auto-post, auto-resolve threads).
---

# Resolve PR Comments

Process PR review comments: analyze, decide, fix, reply, resolve threads.

## Invocation

```bash
/resolve-pr-comments 123              # Interactive (default)
/resolve-pr-comments 123 --auto       # Auto mode: fully autonomous, no prompts
/resolve-pr-comments <url>            # PR URL
/resolve-pr-comments 123 --resume     # Resume interrupted session
```

Auto mode can also be enabled via project CLAUDE.md:
```markdown
When using /resolve-pr-comments, always use auto mode.
```

## Auto Mode

When `--auto` is passed (or configured in CLAUDE.md), the skill runs fully autonomously — no user prompts at any decision point.

**Decision philosophy:** The AI makes the same critical analysis as interactive mode. It does NOT blindly comply with everything:

| Situation | Auto behavior |
|-----------|--------------|
| Already Fixed | Auto-reply with template explanation |
| Valid suggestion | Fix it |
| Disagree (reviewer is wrong) | Don't implement. Post reply explaining why. Still resolve thread. |
| Ambiguous/unclear | Fix with best-effort interpretation, note ambiguity in reply |

Key: the AI makes the Disagree/Fix judgment call itself. It should disagree when the suggestion would make the code worse — don't implement bad advice just because it came from a reviewer.

**Reply templates (auto mode):**
- Already Fixed: "Thanks for catching this! This is already handled — [explanation]."
- Fix: "Good catch, fixed! [description of change]."
- Disagree: "I looked into this and [explanation of why the current approach is correct / why the suggestion would cause issues]. [Optional: suggest alternative if appropriate]."
- Ambiguous: "Thanks for the feedback! I've [description]. Let me know if you had something different in mind."

## Workflow

**Interactive:**
```
FETCH → PRE-ANALYZE → BRAINSTORM (one-by-one) → TODOS → DECISIONS → PLAN → EXECUTE → COMMIT → PUSH → REVIEW REPLIES → POST → RESOLVE THREADS
```

**Auto:**
```
FETCH → BATCH ANALYZE → TODOS → DECISIONS → PLAN → EXECUTE → AUTO-COMMIT → AUTO-PUSH → AUTO-POST → AUTO-RESOLVE
```

## Phase 1: Fetch Comments

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments
gh api repos/{owner}/{repo}/pulls/{number}/reviews
```

Filter to unresolved comments. Exclude resolved threads and pure "LGTM" comments.

**Fetch thread node IDs** alongside comments (needed for Phase 11 thread resolution):

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { databaseId }
            }
          }
        }
      }
    }
  }
' -F owner='{owner}' -F repo='{repo}' -F pr={number}
```

Build mapping: `{ comment_database_id → thread_node_id }`

Store this mapping for use in the decisions file and Phase 11.

Display summary:

```
PR #123: "Add search to class overview"
Author: @vince | Reviewers: @nicolas, @jane

Found 8 unresolved comments:
  - 5 inline code comments
  - 2 review comments
  - 1 thread with 3 replies

Starting pre-analysis...
```

## Phase 2: Pre-Analyze Comments

**Before brainstorming**, scan all comments to identify already-addressed issues.

For each comment, read the referenced code and check if the suggested fix is already implemented.

**Interactive mode:** Display results and offer options:

```
Pre-analysis complete.

Already Fixed (3 comments):
  1. searchHistory.svelte.ts:38 - JSON.parse validation ✓ isStringArray() exists
  2. searchHistory.svelte.ts:46 - localStorage validation ✓ Same fix
  3. appointmentUtils.ts:89 - Map.get assertion ✓ Uses ?? [] pattern

Remaining (5 comments):
  - 2 from @nicolas (helper suggestions)
  - 3 from @jane (naming, tests)

Options:
1. Skip all already-fixed with standard reply (Recommended)
2. Review already-fixed one-by-one
3. Show me details of already-fixed first
```

If user chooses option 1, auto-mark those as "Already Fixed" with standard reply:
> "Thanks for catching this! This is already handled — [brief explanation of existing fix]."

**Auto mode:** Automatically choose option 1 (skip already-fixed with standard reply). No prompt shown.

## Phase 3: Brainstorm Remaining Comments

### Interactive Mode: One at a Time

For each remaining comment:

1. Show comment with file, line, code snippet, and **comment ID**
2. Read the relevant code to understand context
3. Analyze: Is the suggestion technically correct? Does it fit the codebase?
4. Present options with recommendation:
   - **Fix** - implement the suggestion
   - **Already Fixed** - code already addresses this (missed in pre-analysis)
   - **Disagree** - push back with reasoning
   - **Clarify** - ask a question
   - **Skip** - decide later
5. User decides
6. Draft the reply together
7. Move to next comment

Example flow:

```
Comment 4/8 (ID: 2748124698)
src/lib/api/client.ts:45 (@nicolas)

"This should use AppointmentStatus.DECLINED instead of the string literal."

Code: if (booking.status !== 'DECLINED') {

---

Analyzing...

- AppointmentStatus enum exists in generated/api.ts
- It IS exported and available
- 3 other files already use this pattern

Recommendation: Fix
The reviewer is correct - enum provides type safety.

Options:
1. Fix - use AppointmentStatus.DECLINED (Recommended)
2. Already Fixed
3. Disagree
4. Clarify
5. Skip

Your choice:
```

After user decides, draft the reply together and confirm before moving to next comment.

### Auto Mode: Batch Analysis

In auto mode, Phase 3 becomes a single batch pass (no user prompts):

1. Read all relevant source files for all remaining comments at once
2. For each comment decide: **Already Fixed**, **Fix**, or **Disagree** — using the same critical analysis as interactive mode (no "Clarify" or "Skip" in auto mode)
3. Draft all replies in a single pass
4. If >10 remaining comments, split into batches of 10 (grouped by file)

For ambiguous comments: pick the most reasonable interpretation, implement it, and note the ambiguity in the reply.

## Phase 4: Create Todos

**Immediately after brainstorming/batch analysis completes**, create todos for all remaining steps:

```
□ Write decisions file (docs/reviews/pr-{number}-decisions.md)
□ Create implementation plan using superpowers:write-plan
□ Execute implementation plan
□ Run typecheck and tests to verify
□ Commit fixes
□ Push to remote
□ Review/edit replies in decisions file        (interactive only)
□ Post replies to GitHub
□ Resolve addressed threads
```

## Phase 5: Write Decisions File

Write all decisions to `docs/reviews/pr-{number}-decisions.md`.

**Format:**

```markdown
# PR #86 Decisions

**Mode:** auto | interactive
**Date:** {ISO timestamp}
**Comments processed:** {total} ({already_fixed} already fixed, {fixes} fixes, {disagree} disagreed)

## Thread ID Mapping

| Comment ID | Thread Node ID | File:Line |
|-----------|---------------|-----------|
| 2745871956 | PRRT_kwDOxyz123 | searchHistory.svelte.ts:38 |
| 2745871963 | PRRT_kwDOxyz456 | searchHistory.svelte.ts:46 |
| 2748124698 | PRRT_kwDOxyz789 | mock-setup.ts:23 |

## Already Fixed

### 1. searchHistory.svelte.ts:38 (ID: 2745871956)
JSON.parse validation already implemented via isStringArray() type guard.
**Reply:** Thanks for catching this! This is already handled — isStringArray() type guard validates the parsed JSON.

### 2. searchHistory.svelte.ts:46 (ID: 2745871963)
Same fix - localStorage branch uses isStringArray() validation.
**Reply:** Thanks for catching this! This is already handled — same isStringArray() validation covers this path.

## Fixes

### 3. mock-setup.ts:23 (ID: 2748124698)
Created `mockRoute` helper to reduce boilerplate.
**Reply:** Good catch, fixed! Created a mockRoute helper that reduces the boilerplate.

### 4. class-search.spec.ts:87 (ID: 2748130762)
Replaced static timeouts with visibility waits.
**Reply:** Good catch, fixed! Replaced setTimeout with waitForSelector visibility checks.

## Disagree

### 5. dateUtils.ts:361 (ID: 2748235527)
The current design keeps dateUtils pure without i18n dependencies. Callers pass translated labels. The hardcoded English is a last-resort fallback.
**Reply:** I looked into this and the current approach is intentional — dateUtils stays pure without i18n dependencies, and callers pass translated labels. The hardcoded English serves as a last-resort fallback only.

## Clarify

### 6. appointmentUtils.ts:139 (ID: 2748164415)
Already opened a team discussion - see the Notion proposal for TypeScript type vs interface standardization.
**Reply:** Great question! I've opened a team discussion about this — see the Notion proposal for our type vs interface standardization.
```

**Important:** Include comment IDs and thread node IDs visibly — needed for posting replies and resolving threads.

**Also write** `docs/reviews/pr-{number}-original-drafts.json` — a companion file containing the original reply text keyed by comment ID:

```json
{
  "2748124698": "Good catch, fixed! Created a mockRoute helper that reduces the boilerplate.",
  "2745871956": "Thanks for catching this! This is already handled — isStringArray() type guard validates the parsed JSON."
}
```

This file is used in Phase 10 for edit detection (interactive mode). It is a transient artifact — do NOT commit it.

## Phase 6: Create Implementation Plan

**STOP.** You MUST invoke `superpowers:write-plan` to create the implementation plan. Do NOT use todos or implement directly.

Invoke `superpowers:write-plan` with:
- All "Fix" decisions from brainstorming (NOT "Already Fixed" — those need no implementation)
- File paths and line numbers
- Fix descriptions and reasoning
- Output location: `docs/reviews/pr-{number}-plan.md`

## Phase 7: Execute Plan

Follow the implementation plan. Use `superpowers:verification-before-completion` to verify each fix.

## Phase 8: Commit and Push

**Interactive mode:** Ask for confirmation before committing:

```
All fixes implemented.

Changes:
  - src/lib/api/client.ts (2 changes)
  - src/routes/classes/+page.svelte (1 change)

Ready to commit?
```

Single commit, then push to remote after user confirms.

**Note:** Do NOT commit `docs/reviews/pr-{number}-original-drafts.json` — it is a transient artifact for edit detection only.

**Auto mode:** Commit and push immediately with no confirmation. Commit message format:
```
fix: address PR #{number} review comments
```

## Phase 9: Review Replies

**Interactive mode:** Prompt user to review/edit replies in the decisions file:

```
Fixes committed and pushed.

Next: Review your reply drafts in docs/reviews/pr-86-decisions.md
Edit any replies to match your tone, then say "ready to post".
```

Wait for user confirmation before posting.

**Auto mode:** Skip entirely. Replies were drafted during batch analysis and are ready to post.

## Phase 10: Post Replies to GitHub

Parse the decisions file to extract comment IDs and replies. Before posting each reply, append an AI attribution marker:

**Auto mode:** Append `\n\n<!-- ai:resolve-pr-comments mode:auto -->` to each reply body (no edit check needed — user never touches replies).

**Interactive mode:** Read `docs/reviews/pr-{number}-original-drafts.json` and compare each reply with its original draft:
- If identical → append `\n\n<!-- ai:resolve-pr-comments mode:interactive edited:false -->`
- If different → append `\n\n<!-- ai:resolve-pr-comments mode:interactive edited:true -->`

Post each reply:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Your reply text\n\n<!-- ai:resolve-pr-comments mode:auto -->"
```

**Interactive mode:** Post replies and report results. Wait for user confirmation before proceeding.

**Auto mode:** Post all replies immediately, no confirmation.

Report results:

```
Posted 8 replies to PR #86
```

## Phase 11: Resolve Threads

After posting replies, resolve each addressed thread on GitHub using GraphQL.

**Resolve using the thread node IDs** from the decisions file mapping:

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }
' -f threadId='{thread_node_id}'
```

**Which threads to resolve:**
- **Fix** — resolve (code changed, reply posted)
- **Already Fixed** — resolve (reply explains existing fix)
- **Disagree** — resolve (reply explains reasoning)
- **Clarify** (interactive only) — do NOT resolve (needs reviewer follow-up)

**Interactive mode:** Show list of threads and ask for confirmation:

```
Ready to resolve 7 threads (3 already fixed, 3 fixes, 1 disagree).
1 "Clarify" thread will NOT be resolved (needs reviewer follow-up).

Options:
1. Resolve all 7 threads (Recommended)
2. Select which threads to resolve
3. Skip thread resolution
```

**Auto mode:** Resolve all addressed threads immediately, no confirmation.

**Auto mode summary output:**

```
Auto-resolve complete for PR #86

Processed: 8 comments
  - 3 already fixed (replied + thread resolved)
  - 4 fixes implemented (replied + thread resolved)
  - 1 disagreed (replied + thread resolved)

Commit: abc1234 "fix: address PR #86 review comments"
Pushed to: origin/feature/search

Replies posted: 8/8
Threads resolved: 8/8

Decisions: docs/reviews/pr-86-decisions.md
PR: https://github.com/owner/repo/pull/86
```

## Phase 12: Cleanup

Trash transient artifacts:

```bash
trash docs/reviews/pr-{number}-original-drafts.json
```

This file was only needed for edit detection in Phase 10 and should not persist.

## Key Principles

- **Pre-analyze first** — Scan for already-fixed issues before detailed review
- **Critical analysis** — Evaluate suggestions, don't blindly comply (both modes)
- **One at a time** (interactive) — Full focus on each comment during brainstorming
- **Batch analysis** (auto) — Process all comments in a single pass, AI decides
- **User decides** (interactive) — Skill recommends, user chooses
- **AI decides** (auto) — Same analysis, autonomous judgment (Fix, Already Fixed, or Disagree)
- **Document first** — Write decisions before planning
- **Track everything** — Use todos to ensure no step is forgotten
- **Resolve threads** — Clean up after posting replies

## Output Files

| File | Contents |
|------|----------|
| `docs/reviews/pr-{number}-decisions.md` | All decisions with reply drafts, comment IDs, and thread ID mapping |
| `docs/reviews/pr-{number}-plan.md` | Implementation tasks (fixes only) |
| `docs/reviews/pr-{number}-original-drafts.json` | Original reply text keyed by comment ID (transient — trashed after posting) |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| PR not found | Error: "PR #123 not found" |
| No unresolved comments | Exit: "No unresolved comments" |
| All comments already fixed | Skip to Phase 4 (todos), no implementation plan needed |
| Line no longer exists | Warn during brainstorm, allow decision |
| Session interrupted | Resume with `--resume` flag |
| Fix fails | Stop, show error, ask how to proceed |
| >10 comments (auto) | Process in batches of 10, grouped by file |
| GraphQL thread fetch fails | Fall back to REST-only (skip thread resolution) |
| Thread resolution permission denied | Warn, skip resolution, still post replies |
| Thread already resolved | Skip silently |
| All comments already fixed (auto) | No implementation plan needed, just post replies + resolve |

## Dependencies

- `superpowers:write-plan` - Implementation planning (MANDATORY)
- `superpowers:verification-before-completion` - Verify fixes
- `gh` CLI - GitHub API access (REST + GraphQL)
