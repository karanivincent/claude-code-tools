# GitHub Workflow

Manage GitHub Issues through the full lifecycle: create, track, and complete with automatic project integration and audit trail.

## When to Use

- Creating issues from story breakdowns
- Starting work on a feature branch
- Tracking progress with commits and changes
- Completing issues and updating parent epics
- Working on branches like `28-feature-name`

## Phases

### Phase 1: Issue Creation

- Create epics with dependency trees
- Create child issues with blocker headers
- Auto-extract story points and slice numbers
- Add issues to GitHub Projects with custom fields

### Phase 2: Working on Issues

- Auto-detect issue from branch name (`28-feature-name` → Issue #28)
- Add session start comments
- Log progress (minimal for routine, detailed for decisions/blockers)
- Manage labels: `in-progress`, `blocked`, `ready-for-review`
- Update acceptance criteria checkboxes
- Post session handoff comments

### Phase 3: Completing Issues

- Validate all acceptance criteria are complete
- Close issue and update project status
- Update parent epic progress
- Post completion comment

## Trigger Detection

- Branch names: `28-feature-name`
- Keywords: "create issue", "close issue"
- Files: `*-breakdown.md`, `docs/plans/*.md`
- Topics: epics, slices, story points

## GitHub CLI Commands

| Action | Command |
|--------|---------|
| Create issue | `gh issue create --title "..." --body "..."` |
| View issue | `gh issue view <n> --json title,body,labels,state` |
| Add comment | `gh issue comment <n> --body "..."` |
| Add label | `gh issue edit <n> --add-label "label"` |
| Close issue | `gh issue close <n>` |
