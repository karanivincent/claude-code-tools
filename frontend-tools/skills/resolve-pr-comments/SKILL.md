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
FETCH → BRAINSTORM (each comment) → PLAN → EXECUTE → COMMIT → REVIEW REPLIES → POST
```

### Phase 1: Fetch Comments

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

Ready to brainstorm through each?
```

### Phase 2: Brainstorm Each Comment

**One at a time.** For each comment:

1. Show comment with file, line, code snippet
2. Read the relevant code to understand context
3. Analyze: Is the suggestion technically correct? Does it fit the codebase?
4. Present options with recommendation:
   - **Fix** - implement the suggestion
   - **Disagree** - push back with reasoning
   - **Clarify** - ask a question
   - **Skip** - decide later
5. User decides
6. Draft the reply
7. Move to next comment

Example flow:

```
Comment 1/8
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
2. Disagree
3. Clarify
4. Skip

Your choice:
```

Record each decision:

```json
{
  "comment_id": "123456",
  "decision": "fix",
  "fix_description": "Replace string literal with enum",
  "draft_reply": "Fixed - now using the enum."
}
```

### Phase 3: Plan Fixes

After all comments decided, summarize:

```
Decisions:
  - 5 will fix
  - 2 disagree
  - 1 need clarification

Fixes needed:
  1. src/lib/api/client.ts:45 - Use enum instead of string literal
  2. src/lib/api/client.ts:89 - Add error handling
  3. src/routes/classes/+page.svelte:23 - Remove console.log
```

Invoke `superpowers:write-plan` with fix descriptions, files, and reasoning.

### Phase 4: Execute

Follow the plan. Use `superpowers:verification-before-completion` to verify each fix.

### Phase 5: Commit

Single commit with all fixes:

```
All fixes implemented.

Changes:
  - src/lib/api/client.ts (2 changes)
  - src/routes/classes/+page.svelte (1 change)

Ready to commit?
```

### Phase 6: Review Replies

Show all drafted replies:

```
Replies ready for PR #123:

1. src/lib/api/client.ts:45 - Fixed
   "Fixed - now using AppointmentStatus.DECLINED."

2. src/lib/api/client.ts:89 - Fixed
   "Added try/catch around JSON.parse."

3. src/routes/classes/+page.svelte:67 - Disagree
   "The loading state is already handled by the parent layout."

4. src/lib/utils/date.ts:12 - Clarify
   "Should this handle UTC or user's local timezone?"

Edit any replies? (enter number to edit, or 'ok' to proceed)
```

### Phase 7: Post to GitHub

Post each reply to the correct thread:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Fixed - now using the enum."
```

Report results:

```
Posted 5 replies to PR #123
https://github.com/owner/repo/pull/123
```

## Key Principles

- **Critical analysis** - Evaluate suggestions, don't blindly comply
- **One at a time** - Full focus on each comment
- **User decides** - Skill recommends, user chooses
- **Batch efficiency** - Plan fixes together, post replies together

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| PR not found | Error: "PR #123 not found" |
| No unresolved comments | Exit: "No unresolved comments" |
| Line no longer exists | Warn during brainstorm, allow decision |
| Session interrupted | Resume with `--resume` flag |
| Fix fails | Stop, show error, ask how to proceed |

## Dependencies

- `superpowers:write-plan` - Implementation planning
- `superpowers:verification-before-completion` - Verify fixes
- `gh` CLI - GitHub API access
