---
name: resolve-pr-comments
description: |
  Systematically process PR review comments with critical analysis, not blind compliance.
  Use when:
  - User says "address PR comments", "resolve review feedback", "fix PR review"
  - User invokes /resolve-pr-comments with PR number or URL
  - User needs to respond to code review comments on a pull request
  - User wants to work through reviewer feedback methodically
---

# Resolve PR Comments

Process PR review comments one at a time: analyze, decide, fix, reply.

## Invocation

```bash
/resolve-pr-comments 123          # PR number
/resolve-pr-comments <url>        # PR URL
/resolve-pr-comments 123 --resume # Resume interrupted session
```

## Workflow

```
FETCH → PRE-ANALYZE → BRAINSTORM (remaining) → CREATE TODOS → WRITE DECISIONS → PLAN → EXECUTE → COMMIT → PUSH → REVIEW REPLIES → POST
```

## Phase 1: Fetch Comments

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments
gh api repos/{owner}/{repo}/pulls/{number}/reviews
```

Filter to unresolved comments. Exclude resolved threads and pure "LGTM" comments.

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

**Before one-by-one brainstorming**, scan all comments to identify already-addressed issues.

For each comment, read the referenced code and check if the suggested fix is already implemented.

Display results:

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
> "Thanks for the suggestion! This is already implemented - [brief explanation of existing fix]."

## Phase 3: Brainstorm Remaining Comments

**One at a time.** For each remaining comment:

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

## Phase 4: Create Todos

**Immediately after brainstorming completes**, create todos for all remaining steps:

```
□ Write decisions file (docs/reviews/pr-{number}-decisions.md)
□ Create implementation plan using superpowers:write-plan
□ Execute implementation plan
□ Run typecheck and tests to verify
□ Commit fixes
□ Push to remote
□ Review/edit replies in decisions file
□ Post replies to GitHub
```

## Phase 5: Write Decisions File

Write all decisions to `docs/reviews/pr-{number}-decisions.md`.

**Format:**

```markdown
# PR #86 Decisions

## Already Fixed

### 1. searchHistory.svelte.ts:38 (ID: 2745871956)
JSON.parse validation already implemented via isStringArray() type guard.

### 2. searchHistory.svelte.ts:46 (ID: 2745871963)
Same fix - localStorage branch uses isStringArray() validation.

## Fixes

### 3. mock-setup.ts:23 (ID: 2748124698)
Created `mockRoute` helper to reduce boilerplate.

### 4. class-search.spec.ts:87 (ID: 2748130762)
Replaced static timeouts with visibility waits.

## Disagree

### 5. dateUtils.ts:361 (ID: 2748235527)
The current design keeps dateUtils pure without i18n dependencies. Callers pass translated labels. The hardcoded English is a last-resort fallback.

## Clarify

### 6. appointmentUtils.ts:139 (ID: 2748164415)
Already opened a team discussion - see the Notion proposal for TypeScript type vs interface standardization.
```

**Important:** Include comment IDs visibly - needed for posting replies later.

## Phase 6: Create Implementation Plan

**STOP.** You MUST invoke `superpowers:write-plan` to create the implementation plan. Do NOT use todos or implement directly.

Invoke `superpowers:write-plan` with:
- All "Fix" decisions from brainstorming (NOT "Already Fixed" - those need no implementation)
- File paths and line numbers
- Fix descriptions and reasoning
- Output location: `docs/reviews/pr-{number}-plan.md`

## Phase 7: Execute Plan

Follow the implementation plan. Use `superpowers:verification-before-completion` to verify each fix.

## Phase 8: Commit and Push

After all fixes verified:

```
All fixes implemented.

Changes:
  - src/lib/api/client.ts (2 changes)
  - src/routes/classes/+page.svelte (1 change)

Ready to commit?
```

Single commit, then push to remote.

## Phase 9: Review Replies

Prompt user to review/edit replies in the decisions file:

```
Fixes committed and pushed.

Next: Review your reply drafts in docs/reviews/pr-86-decisions.md
Edit any replies to match your tone, then say "ready to post".
```

Wait for user confirmation before posting.

## Phase 10: Post Replies to GitHub

Parse the decisions file to extract comment IDs and replies. Post each reply:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Your reply text"
```

Report results:

```
Posted 8 replies to PR #86
https://github.com/owner/repo/pull/86
```

## Key Principles

- **Pre-analyze first** - Scan for already-fixed issues before one-by-one review
- **Critical analysis** - Evaluate suggestions, don't blindly comply
- **One at a time** - Full focus on each comment during brainstorming
- **User decides** - Skill recommends, user chooses
- **Document first** - Write decisions before planning
- **Track everything** - Use todos to ensure no step is forgotten

## Output Files

| File | Contents |
|------|----------|
| `docs/reviews/pr-{number}-decisions.md` | All decisions with reply drafts and comment IDs |
| `docs/reviews/pr-{number}-plan.md` | Implementation tasks (fixes only) |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| PR not found | Error: "PR #123 not found" |
| No unresolved comments | Exit: "No unresolved comments" |
| All comments already fixed | Skip to Phase 4 (todos), no implementation plan needed |
| Line no longer exists | Warn during brainstorm, allow decision |
| Session interrupted | Resume with `--resume` flag |
| Fix fails | Stop, show error, ask how to proceed |

## Dependencies

- `superpowers:write-plan` - Implementation planning (MANDATORY)
- `superpowers:verification-before-completion` - Verify fixes
- `gh` CLI - GitHub API access
