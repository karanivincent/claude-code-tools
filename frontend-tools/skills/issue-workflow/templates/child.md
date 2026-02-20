# Sub-issue Template

Use for issues that are children of an epic. Create with `--parent` flag.

## Creation Command

```bash
gh issue create \
  --title "<Descriptive title>" \
  --parent <epic-number> \
  --body "<use template below>"
```

## Template

```markdown
## Description

<What this issue delivers — focus on the outcome>

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>
- [ ] <Criterion 3>

## Work Plan

_To be filled when work begins:_

- [ ] Step 1: <task>
- [ ] Step 2: <task>
- [ ] Step 3: <task>
- [ ] Final verification

## Progress Log

_Session updates will be posted as comments. Summary:_

| Date | Status | Notes |
|------|--------|-------|
| — | Not started | — |

## Technical Notes

<Implementation hints, architecture decisions, or constraints>

---
**Story Points**: <N>
```

## Sections Explained

| Section | Purpose | Who Updates |
|---------|---------|-------------|
| Acceptance Criteria | Definition of done | PM/Author at creation |
| Work Plan | Tactical steps to complete | Agent at session start |
| Progress Log | Running status summary | Agent updates table |
| Technical Notes | Implementation context | Anyone |

## With Blocker

If blocked by another issue:

```markdown
> ⚠️ **BLOCKED BY #<n>**: <specific reason>
>
> Cannot proceed until: <what needs to happen>

## Description
...
```

## Required Agent Actions

### On Session Start
1. Add to-do items in Work Plan section
2. Post session start comment
3. Add `in-progress` label

### During Work
1. Check off Work Plan items as completed
2. Check off Acceptance Criteria as completed
3. Post progress comments for significant changes
4. Update Progress Log table

### On Session End
1. Post handoff comment
2. Update Progress Log table with session summary

### On Completion
1. Verify all Acceptance Criteria checked
2. Post completion comment
3. Close issue