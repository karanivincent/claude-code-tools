# Issue Completion Template

**MANDATORY**: Post this comment when closing an issue.

## Pre-Completion Checklist (VERIFY BEFORE CLOSING)

```
□ All acceptance criteria checked off
□ All work plan items completed
□ No unchecked items in issue body
□ No active blockers
□ Code self-reviewed
□ PR created/linked (if applicable)
```

## Template

```markdown
## ✅ Completed — <Month Day, Year>

### Summary
<1-2 sentence summary of what was delivered>

### Delivered
- <User-facing outcome 1>
- <User-facing outcome 2>
- <Technical improvement if relevant>

### Key Files
| File | Purpose |
|------|---------|
| `path/to/file.ts` | <Brief description> |
| `path/to/component.svelte` | <Brief description> |

### Testing
- [ ] Manual testing: <what was tested>
- [ ] Unit tests: <added/updated/N/A>
- [ ] E2E tests: <added/updated/N/A>

### Sign-off Checklist
- [x] All acceptance criteria met
- [x] Work plan fully completed
- [x] Code self-reviewed
- [x] No console errors/warnings
- [x] No TypeScript errors
- [x] Works as expected in browser

### Related
- **PR**: #<pr-number>
- **Parent Epic**: #<epic-number> (if applicable)
- **Docs**: <link if updated>

### Follow-up (Optional)
- <Future enhancement idea>
- <Tech debt to address later>
- <Edge case to monitor>
- Or: "None — implementation is complete"
```

## Required Fields

| Field | Required? | Notes |
|-------|-----------|-------|
| Summary | ✅ Yes | One-liner of what shipped |
| Delivered | ✅ Yes | Outcomes, not process |
| Key Files | ✅ Yes | Significant files only |
| Testing | ✅ Yes | How correctness was verified |
| Sign-off Checklist | ✅ Yes | Explicit verification |
| Related | ✅ Yes | PR link is critical |
| Follow-up | Optional | Future considerations |

## Quick Version

For small fixes or straightforward issues:

```markdown
## ✅ Done — <date>

Implemented <feature/fix> in `path/to/file`.

**Verified**: <how tested>
**PR**: #<n>
**Sign-off**: All criteria met ✅
```

## After Posting Completion Comment

1. Remove `in-progress` label
2. Remove `blocked` label (if present)
3. Close the issue OR let PR close it with `Closes #<n>`
4. Update project status → Done
5. Post update to parent epic (if exists)

## Letting PR Close the Issue

In PR description, use:
```
Closes #28
Fixes #28
Resolves #28
```

Issue closes automatically when PR merges. Still post completion comment before merging.

## Parent Epic Update (REQUIRED if has parent)

After closing a sub-issue:

```markdown
### ✅ Sub-issue Completed — #<n>: <title>

**Delivered**: <one-line summary>
**Epic Progress**: X/Y sub-issues complete

**Remaining**:
- [ ] #<n>: <title>
- [ ] #<n>: <title>
```