---
name: github-workflow
description: Manage GitHub Issues through full lifecycle: create, track, and complete. Use when (1) creating issues from story breakdowns or planning discussions, (2) starting work on a feature branch, (3) tracking progress with commits and changes, (4) completing issues and updating parent epics. Triggers on: branch names like `28-feature-name`, keywords like "create issue" or "close issue", reading `*-breakdown.md` or `docs/plans/*.md` files, or discussing epics/slices/stories.
---

# GitHub Workflow

Manage GitHub Issues through the full lifecycle with automatic project integration and audit trail.

## Configuration

Project settings stored in [config.json](config.json):
- **project**: Default project name (e.g., "yond-css")
- **owner**: GitHub organization/user
- **fields**: Custom field names for Story Points, Issue Type, Slice, Status

## Phase 1: Issue Creation

### Trigger Detection

Activate when:
- Reading files matching `*-breakdown.md`, `*-story.md`, `docs/plans/*.md`
- Keywords: "create issue", "create epic", "add issues", "github issues"
- Discussing: epics, slices, story points, acceptance criteria

### Auto-extraction Patterns

```typescript
// Story points: "3 pts", "3 points", "(3 story points)"
/(\d+)\s*(?:pts?|points?|story points?)/i → Story Points field

// Slice number: "Slice 2:", "Slice 2 -"
/Slice\s*(\d+)/i → Slice field (as "Slice N")

// Blocker: "Blocked by Slice 1", "depends on #29"
/(?:blocked by|depends on|after)\s*(?:Slice\s*)?#?(\d+)/i → Blocker reference
```

### Creating an Epic

```bash
# Create epic issue
gh issue create --title "<Epic Title>" --body "$(cat <<'EOF'
# 🎯 <Epic Title>

## Summary

<1-2 sentence description>

## Dependency Tree

- [ ] #TBD Setup task
      └── [ ] #TBD Slice 1
          ├── [ ] #TBD Slice 2
          └── [ ] #TBD Slice 3

## Progress

🟡 In Progress | 0/<total> complete
EOF
)"

# Add to project and set fields
gh project item-add <project-number> --owner <owner> --url <issue-url>
# Set Issue Type: "Epic", Story Points: <sum of children>
```

### Creating Child Issues

```bash
# Create child issue with blocker header
gh issue create --title "Slice N: <Title>" --body "$(cat <<'EOF'
> 🚫 **Blocked by**: #<blocker> (<blocker title>)
> 📦 **Parent**: #<epic> (<epic title>)

## Description

<Issue description>

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>

## Story Points: <N>
EOF
)"

# Add to project and set fields
gh project item-add <project-number> --owner <owner> --url <issue-url>
# Set Issue Type: "Slice", Story Points: N, Slice: "Slice N"
```

### After Creating Issues

1. Update epic's dependency tree with actual issue numbers
2. Update blocker references in child issues with actual numbers

## Phase 2: Working on Issues

### Issue Detection

1. Parse branch name: `28-filter-on-class-overview` → Issue #28 (regex: `/^(\d+)-/`)
2. If no number found, check `.claude/current-issue` file
3. If still unknown, ask once and save to `.claude/current-issue`

### Session Start

```bash
# Fetch issue details
gh issue view <number> --json title,body,labels,state

# Add session start comment
gh issue comment <number> --body "🚀 Starting session — $(date '+%b %d, %Y')"

# Add in-progress label
gh issue edit <number> --add-label "in-progress"

# Update project Status to "In Progress"
# 1. Get project item ID for this issue
gh project item-list <project-number> --owner <owner> --format json | jq '.items[] | select(.content.number == <issue-number>)'

# 2. Update Status field via GraphQL
gh api graphql -f query='
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}' -f projectId="<project-node-id>" -f itemId="<item-node-id>" -f fieldId="<status-field-id>" -f optionId="<in-progress-option-id>"
```

**Getting IDs for project update:**
```bash
# Get project ID and field IDs (cache per session)
gh project view <project-number> --owner <owner> --format json
# → Returns: id (project node ID)

# Get Status field ID and option IDs
gh project field-list <project-number> --owner <owner> --format json
# → Find "Status" field, get its id and options[].id for "In Progress"

# Get item ID for the issue
gh api graphql -f query='
query($owner: String!, $projectNumber: Int!, $issueNumber: Int!) {
  organization(login: $owner) {
    projectV2(number: $projectNumber) {
      items(first: 100) {
        nodes {
          id
          content {
            ... on Issue {
              number
            }
          }
        }
      }
    }
  }
}' -f owner="<owner>" -F projectNumber=<project-number> -F issueNumber=<issue-number>
```

Display resume info:
```
📌 Resuming: <title> (#<number>)
   Last session: <date> — <summary>
   Status: <labels> | <progress>
```

### Logging Progress

**Minimal Format** (routine actions):
```markdown
• Created `FilterRow.svelte` component
• Added Drawer export to barrel file
• Fixed TypeScript error in props
```

**Detailed Format** (decisions, blockers, bugs):
```markdown
### 🐛 Fixed: <title>

**Problem**: <what was wrong>
**Cause**: <root cause>
**Solution**: <what fixed it>
**Files**: `path/to/file.ts:45-62`
```

| Situation | Format |
|-----------|--------|
| Creating/modifying files | Minimal |
| Routine refactoring | Minimal |
| Bug fix | Detailed (what, why, how) |
| Design decision | Detailed (options, rationale) |
| Blocker encountered | Detailed (what's blocked, what's needed) |
| Test failures | Detailed (which tests, errors) |

### Labels

| Label | Purpose |
|-------|---------|
| `in-progress` | Active work |
| `blocked` | Waiting on something |
| `ready-for-review` | Code complete, needs review |

Lifecycle:
- Start working → add `in-progress`, project Status → "In Progress"
- Hit blocker → add `blocked` (keep `in-progress`)
- Blocker resolved → remove `blocked`
- All tasks done → remove `in-progress`, add `ready-for-review`

### Checklist Management

When work matches an acceptance criteria item:

1. **Edit issue body** to check off the item
2. **Add comment** with completion details

```bash
# Update issue body (check item)
gh issue edit <number> --body "<updated body with [x]>"

# Add completion comment
gh issue comment <number> --body "✅ **Completed**: <item>

- Implemented in \`Component.svelte\`
- <brief details>"
```

### Session Handoff

Post handoff comment at session end. See [templates/handoff.md](templates/handoff.md).

```bash
gh issue comment <number> --body "$(cat <<'EOF'
## 📋 Session Handoff — <date>

### ✅ Completed
- <item 1>
- <item 2>

### 📁 Key Files Changed
| File | Change |
|------|--------|
| `path/to/file` | New/Modified |

### ⏳ Pending
- [ ] <remaining item>

### ⚠️ Notes
- <important context>

### 🚀 Next Session
Start with **<next task>** — <brief description>
EOF
)"
```

## Phase 3: Completing Issues

### Trigger Detection

Activate when:
- Keywords: "close issue", "complete issue", "mark done", "finish issue"
- All acceptance criteria checked in issue body
- User indicates work is complete

### Pre-close Validation

```bash
# Check if all acceptance criteria are done
gh issue view <number> --json body

# Parse body for unchecked items: - [ ]
# If found, warn user and confirm before proceeding
```

### Close Actions

```bash
# 1. Remove work labels
gh issue edit <number> --remove-label "in-progress" --remove-label "blocked"

# 2. Close the issue
gh issue close <number>

# 3. Update project status to Done (via GraphQL API)
gh api graphql -f query='
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}'
```

### Parent Epic Update

If this is a child issue with a parent epic:

```bash
# 1. Fetch parent epic body
gh issue view <parent> --json body

# 2. Update dependency tree: - [ ] #29 → - [x] #29
# 3. Update progress count: 1/5 complete → 2/5 complete
gh issue edit <parent> --body "<updated body>"

# 4. If all children complete, mark epic ready for review
gh issue edit <parent> --add-label "ready-for-review"
```

### Completion Comment

Post completion comment. See [templates/completion.md](templates/completion.md).

```bash
gh issue comment <number> --body "$(cat <<'EOF'
## ✅ Completed — <date>

### Delivered
- <what was built/fixed>

### Key Files
| File | Purpose |
|------|---------|
| `path/file.ts` | <brief description> |

### Testing
- <how it was verified>

### Notes
- <any follow-up considerations>
EOF
)"
```

## GitHub Projects Integration

### Adding Issues to Project

```bash
# Get project number (from config.json or query)
gh project list --owner <owner> --format json

# Add issue to project
gh project item-add <project-number> --owner <owner> --url <issue-url>
```

### Setting Field Values

```bash
# Get project and field IDs (cache these per session)
gh project view <number> --owner <owner> --format json
gh project field-list <number> --owner <owner> --format json

# Set field value via GraphQL
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<project-node-id>"
    itemId: "<item-node-id>"
    fieldId: "<field-node-id>"
    value: { number: 3 }  # or singleSelectOptionId for select fields
  }) {
    projectV2Item { id }
  }
}'
```

### Label-to-Status Sync

When labels change, update project Status field:

| Label Action | Project Status |
|--------------|---------------|
| Add `in-progress` | "In Progress" |
| Add `ready-for-review` | "In Review" |
| Issue closed | "Done" |

## GitHub CLI Reference

| Action | Command |
|--------|---------|
| Create issue | `gh issue create --title "..." --body "..."` |
| Get issue | `gh issue view <n> --json title,body,labels,state` |
| Add comment | `gh issue comment <n> --body "..."` |
| Update body | `gh issue edit <n> --body "..."` |
| Add label | `gh issue edit <n> --add-label "label"` |
| Remove label | `gh issue edit <n> --remove-label "label"` |
| Close issue | `gh issue close <n>` |
| List projects | `gh project list --owner <owner>` |
| Add to project | `gh project item-add <n> --owner <owner> --url <url>` |
| GraphQL query | `gh api graphql -f query='...'` |

## Templates

- [templates/epic.md](templates/epic.md) — Parent issue structure with dependency tree
- [templates/child.md](templates/child.md) — Child issue with blocker header
- [templates/handoff.md](templates/handoff.md) — Session handoff comment format
- [templates/completion.md](templates/completion.md) — Issue completion comment format
