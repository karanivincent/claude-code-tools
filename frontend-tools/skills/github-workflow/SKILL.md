---
name: github-workflow
description: Manage GitHub Issues through full lifecycle: create, track, and complete. Use when (1) creating issues from story breakdowns or planning discussions, (2) starting work on a feature branch, (3) tracking progress with commits and changes, (4) completing issues and updating parent epics. Triggers on: branch names like `28-feature-name`, keywords like "create issue" or "close issue", reading `*-breakdown.md` or `docs/plans/*.md` files, or discussing epics/stories/tasks.
---

# GitHub Workflow

Manage GitHub Issues through the full lifecycle with automatic project integration, native sub-issues, and audit trail.

---

## ⚠️ MANDATORY BEHAVIORS

These actions are **REQUIRED**, not optional. The agent MUST perform these at the specified checkpoints.

### On Session Start (ALWAYS)
1. ✅ Detect issue number from branch or ask user
2. ✅ Fetch issue details and display context
3. ✅ Add `in-progress` label
4. ✅ Post "Starting session" comment with work plan (to-dos)
5. ✅ Update project Status → "In Progress"

### During Work (AFTER EACH SIGNIFICANT CHANGE)
1. ✅ Update acceptance criteria checkboxes when completed
2. ✅ Post progress comment for: bug fixes, decisions, blockers
3. ✅ If parent epic exists, post progress summary to parent

### On Session End (ALWAYS)
1. ✅ Post handoff comment with completed/pending/next steps
2. ✅ Update any remaining checkboxes
3. ✅ If blocked, add `blocked` label and document why

### On Issue Completion (ALWAYS)
1. ✅ Verify all acceptance criteria are checked
2. ✅ Remove `in-progress` label
3. ✅ Post completion comment
4. ✅ Close issue (or let PR close it)
5. ✅ Update project Status → "Done"
6. ✅ If parent epic exists, post completion notice to parent

---

## Configuration

Project settings stored in [config.json](config.json):
- **project**: GitHub project name
- **owner**: GitHub organization/user
- **fields**: Custom field mappings

---

## Phase 1: Issue Creation

### Trigger Detection

Activate when:
- Reading files matching `*-breakdown.md`, `*-story.md`, `docs/plans/*.md`
- Keywords: "create issue", "create epic", "add issues", "github issues"
- Discussing: epics, stories, story points, acceptance criteria

### Creating an Epic

```bash
gh issue create \
  --title "Epic: <Title>" \
  --body "$(cat <<'EOF'
## Summary

<1-2 sentence description>

## Scope

- <Key deliverable 1>
- <Key deliverable 2>

## Success Criteria

- [ ] <Measurable outcome 1>
- [ ] <Measurable outcome 2>

## Sub-issue Progress

_Updates will be posted here as sub-issues progress._

---
**Story Points**: <total>
EOF
)"
```

**MUST set project fields:**
- Issue Type: `Epic`
- Priority: as appropriate
- Story Points: sum of planned children

### Creating Sub-issues

**MUST use native sub-issues:**

```bash
gh issue create \
  --title "<Descriptive title>" \
  --parent <epic-number> \
  --body "$(cat <<'EOF'
## Description

<What this issue delivers>

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>
- [ ] <Criterion 3>

## Work Plan

_To be added when work begins._

## Progress Log

_Updates will be posted here._

---
**Story Points**: <N>
EOF
)"
```

**MUST set project fields:**
- Issue Type: `Feature` / `Bug` / `Spike` / `Chore`
- Priority: P0-P3
- Story Points: N

### Blocking Dependencies

Native sub-issues do **NOT** handle blockers. Use GitHub's dependency feature separately.

**To add a blocker:**
1. Open the blocked issue in GitHub UI
2. In sidebar → "Development" → "Linked issues"
3. Add "is blocked by" relationship

**MUST also add visibility in issue body:**
```markdown
> ⚠️ **BLOCKED BY #<n>**: <reason>
>
> Cannot proceed until <what needs to happen>
```

**When blocker is resolved:**
1. Remove the dependency in GitHub UI
2. Update body: `> ✅ **UNBLOCKED** — #<n> completed`
3. Remove `blocked` label
4. Post comment: "🔓 Unblocked — ready to proceed"

---

## Phase 2: Working on Issues

### Issue Detection (REQUIRED FIRST STEP)

```bash
# 1. Try branch name
BRANCH=$(git branch --show-current)
ISSUE_NUM=$(echo "$BRANCH" | grep -oE '^[0-9]+')

# 2. If not found, check cache
if [ -z "$ISSUE_NUM" ] && [ -f ".claude/current-issue" ]; then
  ISSUE_NUM=$(cat .claude/current-issue)
fi

# 3. If still not found, ASK USER (do not guess)
if [ -z "$ISSUE_NUM" ]; then
  echo "❓ Which issue are you working on? (Enter issue number)"
  # Save response to .claude/current-issue
fi
```

### Session Start (MANDATORY STEPS)

**Step 1: Fetch and display context**
```bash
ISSUE_DATA=$(gh issue view $ISSUE_NUM --json title,body,labels,state,parent)
echo "📌 Issue #$ISSUE_NUM: $(echo $ISSUE_DATA | jq -r '.title')"

# Check for parent
PARENT=$(echo $ISSUE_DATA | jq -r '.parent.number // empty')
if [ -n "$PARENT" ]; then
  echo "📦 Parent Epic: #$PARENT"
fi

# Check for blockers
echo "⚠️ Checking blockers..."
```

**Step 2: Add in-progress label**
```bash
gh issue edit $ISSUE_NUM --add-label "in-progress"
```

**Step 3: Post starting comment with work plan (REQUIRED)**

```bash
gh issue comment $ISSUE_NUM --body "$(cat <<'EOF'
## 🚀 Starting Session — $(date '+%b %d, %Y %H:%M')

### Work Plan

Based on acceptance criteria, here's the planned approach:

- [ ] **Step 1**: <first task to do>
- [ ] **Step 2**: <second task>
- [ ] **Step 3**: <third task>
- [ ] **Step 4**: Verify all acceptance criteria
- [ ] **Step 5**: Self-review and cleanup

### Context

- Branch: `<branch-name>`
- Starting from: <current state>

---
_Progress updates will follow._
EOF
)"
```

**Step 4: Update project status**
```bash
# Update Status field to "In Progress"
# (See GraphQL mutation in "Project Integration" section)
```

**Step 5: Update issue body with work plan**

Add a "Work Plan" section to the issue body itself:
```bash
# Fetch current body
BODY=$(gh issue view $ISSUE_NUM --json body -q .body)

# Append work plan section if not present
if ! echo "$BODY" | grep -q "## Work Plan"; then
  UPDATED_BODY="$BODY

## Work Plan

- [ ] <Step 1>
- [ ] <Step 2>
- [ ] <Step 3>
- [ ] Final verification"

  gh issue edit $ISSUE_NUM --body "$UPDATED_BODY"
fi
```

### Progress Logging (REQUIRED)

#### After EACH significant change:

**For routine changes (file creation, minor edits):**
```bash
gh issue comment $ISSUE_NUM --body "• Created \`ComponentName.svelte\`
• Added export to barrel file
• Updated types in \`types.ts\`"
```

**For bug fixes, decisions, or blockers (DETAILED FORMAT REQUIRED):**
```bash
gh issue comment $ISSUE_NUM --body "$(cat <<'EOF'
### 🐛 Fixed: <title>

**Problem**: <what was wrong>
**Cause**: <root cause identified>
**Solution**: <how it was fixed>
**Files**: `path/to/file.ts:45-62`
EOF
)"
```

#### Update checkboxes as work completes:

```bash
# When an acceptance criterion is done:
# 1. Edit issue body to check it off
BODY=$(gh issue view $ISSUE_NUM --json body -q .body)
UPDATED=$(echo "$BODY" | sed 's/- \[ \] Criterion text/- [x] Criterion text/')
gh issue edit $ISSUE_NUM --body "$UPDATED"

# 2. Post confirmation
gh issue comment $ISSUE_NUM --body "✅ Completed: **Criterion text**

Implemented in \`Component.svelte\` — <brief details>"
```

### Parent Epic Updates (REQUIRED if has parent)

**Post progress to parent epic periodically:**

```bash
PARENT=$(gh issue view $ISSUE_NUM --json parent -q '.parent.number')

if [ -n "$PARENT" ]; then
  gh issue comment $PARENT --body "$(cat <<'EOF'
### 📊 Progress Update — #<child-number>: <child-title>

**Status**: In Progress (2/5 acceptance criteria done)

**Completed**:
- <what's done>

**In Progress**:
- <current work>

**Remaining**:
- <what's left>
EOF
)"
fi
```

**When to update parent:**
- After completing 50% of acceptance criteria
- When hitting a significant blocker
- At end of each session
- When completing the issue

### Blocker Handling (REQUIRED when blocked)

```bash
# 1. Add blocked label
gh issue edit $ISSUE_NUM --add-label "blocked"

# 2. Post detailed blocker comment
gh issue comment $ISSUE_NUM --body "$(cat <<'EOF'
### 🚫 BLOCKED

**Blocked by**: #<number> — <title>

**Reason**: <why this blocks progress>

**What's needed**: <specific requirement to unblock>

**Can continue with**: <any work that can proceed, or "Nothing">
EOF
)"

# 3. Update issue body with blocker notice
# Add to top of body:
# > ⚠️ **BLOCKED BY #<n>**: <reason>

# 4. Notify parent epic if exists
if [ -n "$PARENT" ]; then
  gh issue comment $PARENT --body "⚠️ Sub-issue #$ISSUE_NUM is **blocked** by #<blocker>. See issue for details."
fi
```

### Session Handoff (REQUIRED at session end)

**ALWAYS post before ending a session:**

```bash
gh issue comment $ISSUE_NUM --body "$(cat <<'EOF'
## 📋 Session Handoff — <date/time>

### ✅ Completed This Session
- <item 1>
- <item 2>

### 📁 Files Changed
| File | Change |
|------|--------|
| `path/to/file` | New |
| `path/to/other` | Modified |

### 📊 Acceptance Criteria Status
- [x] Criterion 1 ✅
- [x] Criterion 2 ✅
- [ ] Criterion 3 ⏳ (in progress)
- [ ] Criterion 4

### ⏳ Work Plan Status
- [x] Step 1 ✅
- [x] Step 2 ✅
- [ ] Step 3 👈 resume here

### ⚠️ Important Context
- <technical notes>
- <gotchas discovered>
- <decisions made>

### 🚀 Next Session
Resume with **<specific task>** — <exactly where to pick up>
EOF
)"

# Update parent epic
if [ -n "$PARENT" ]; then
  gh issue comment $PARENT --body "📋 Session ended on #$ISSUE_NUM. Progress: X/Y criteria complete. See handoff comment for details."
fi
```

---

## Phase 3: Completing Issues

### Pre-Completion Checklist (VERIFY ALL BEFORE CLOSING)

```bash
# 1. Check all acceptance criteria are done
BODY=$(gh issue view $ISSUE_NUM --json body -q .body)
UNCHECKED=$(echo "$BODY" | grep -c '\- \[ \]')

if [ "$UNCHECKED" -gt 0 ]; then
  echo "⚠️ WARNING: $UNCHECKED unchecked items remain"
  echo "Review and confirm before closing:"
  echo "$BODY" | grep '\- \[ \]'
  # STOP and confirm with user
fi

# 2. Verify work plan items are done
# 3. Ensure no blocking issues remain
# 4. Confirm tests pass (if applicable)
```

### Completion Actions (REQUIRED SEQUENCE)

**Step 1: Post completion comment**
```bash
gh issue comment $ISSUE_NUM --body "$(cat <<'EOF'
## ✅ Completed — <date>

### Summary
<1-2 sentence summary of what was delivered>

### Delivered
- <outcome 1>
- <outcome 2>

### Key Files
| File | Purpose |
|------|---------|
| `path/file.ts` | <description> |

### Testing
- <how it was verified>

### Sign-off Checklist
- [x] All acceptance criteria met
- [x] Code self-reviewed
- [x] No console errors/warnings
- [x] Works as expected

### Related
- PR: #<pr-number> (if applicable)

### Follow-up
- <any future considerations, or "None">
EOF
)"
```

**Step 2: Remove work labels**
```bash
gh issue edit $ISSUE_NUM --remove-label "in-progress" --remove-label "blocked"
```

**Step 3: Close issue**
```bash
gh issue close $ISSUE_NUM
# OR let PR close it with "Closes #<n>" in PR description
```

**Step 4: Update project status**
```bash
# Set Status → "Done" via GraphQL
```

**Step 5: Update parent epic (REQUIRED if has parent)**
```bash
if [ -n "$PARENT" ]; then
  gh issue comment $PARENT --body "$(cat <<'EOF'
### ✅ Sub-issue Completed — #<number>: <title>

**Delivered**: <summary>

**Epic Progress**: Now X/Y sub-issues complete

**Remaining sub-issues**:
- [ ] #<n> — <title>
- [ ] #<n> — <title>
EOF
)"

  # Check if ALL sub-issues are now complete
  OPEN_CHILDREN=$(gh api graphql -f query='...' | jq '...')
  if [ "$OPEN_CHILDREN" -eq 0 ]; then
    gh issue comment $PARENT --body "🎉 **All sub-issues complete!** Epic ready for final review."
    gh issue edit $PARENT --add-label "ready-for-review"
  fi
fi
```

---

## Labels Reference

| Label | When to Add | When to Remove |
|-------|-------------|----------------|
| `in-progress` | Session start | Issue closed |
| `blocked` | When blocked | When unblocked |
| `ready-for-review` | Work complete, needs review | After review/merge |

---

## Project Status Sync

| Event | Project Status |
|-------|----------------|
| Add `in-progress` label | → In Progress |
| Add `ready-for-review` label | → In Review |
| Close issue | → Done |

---

## Comment Frequency Guide

| Event | Comment Required? |
|-------|-------------------|
| Session start | ✅ YES — with work plan |
| File created/modified | ⚠️ Batch into periodic updates |
| Bug fix | ✅ YES — detailed format |
| Decision made | ✅ YES — with rationale |
| Blocker hit | ✅ YES — detailed format |
| Criterion completed | ✅ YES — brief confirmation |
| Session end | ✅ YES — handoff format |
| Issue complete | ✅ YES — completion format |
| Parent update | ✅ YES — at milestones |

---

## Anti-Patterns (DO NOT DO)

❌ Start coding without posting session start comment
❌ Complete acceptance criteria without checking them off
❌ End session without handoff comment
❌ Close issue without completion comment
❌ Close issue with unchecked criteria (without explicit user approval)
❌ Ignore parent epic updates
❌ Remove `in-progress` label mid-session
❌ Forget to set project Status

---

## Quick Reference

### Session Start Checklist
```
□ Identify issue number
□ Fetch issue details
□ Add in-progress label
□ Post session start comment with work plan
□ Update project status → In Progress
□ Add work plan to issue body (if not present)
```

### Session End Checklist
```
□ Update all completed checkboxes
□ Post handoff comment
□ Update parent epic (if exists)
□ Note any blockers
```

### Issue Close Checklist
```
□ Verify all acceptance criteria checked
□ Post completion comment with sign-off
□ Remove in-progress label
□ Close issue
□ Update project status → Done
□ Update parent epic (if exists)
```

---

## Templates

- [templates/epic.md](templates/epic.md) — Epic issue structure
- [templates/child.md](templates/child.md) — Sub-issue template
- [templates/handoff.md](templates/handoff.md) — Session handoff comment
- [templates/completion.md](templates/completion.md) — Issue completion comment