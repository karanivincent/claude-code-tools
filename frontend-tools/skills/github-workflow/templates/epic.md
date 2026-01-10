# Epic Issue Template

Use for parent issues that coordinate multiple sub-issues.

## Template

```markdown
## Summary

<1-2 sentence description of the feature/epic>

## Scope

- <Key deliverable 1>
- <Key deliverable 2>
- <Key deliverable 3>

## Success Criteria

- [ ] <Measurable outcome 1>
- [ ] <Measurable outcome 2>
- [ ] <Measurable outcome 3>

## Out of Scope

- <Explicitly excluded item>

## Sub-issue Progress

| Issue | Title | Status | Last Update |
|-------|-------|--------|-------------|
| #— | _TBD_ | Not created | — |

_Progress updates posted as comments below._

## Notes

<Context, constraints, dependencies, or technical considerations>

---
**Story Points**: <total sum of sub-issues>
```

## Sections Explained

| Section | Purpose |
|---------|---------|
| Summary | Quick context for anyone viewing |
| Scope | What's included in this epic |
| Success Criteria | How we know the epic is done |
| Out of Scope | Explicit boundaries |
| Sub-issue Progress | Quick status table (updated by agent) |
| Notes | Background context |

## After Creating Sub-issues

Update the progress table:

```markdown
## Sub-issue Progress

| Issue | Title | Status | Last Update |
|-------|-------|--------|-------------|
| #42 | Setup filter infrastructure | ✅ Done | Dec 20 |
| #43 | Create FilterRow component | 🔄 In Progress | Dec 22 |
| #44 | Add filter state management | ⏳ Not started | — |
| #45 | Integration tests | 🚫 Blocked by #43 | — |
```

## Status Icons

| Icon | Meaning |
|------|---------|
| ⏳ | Not started |
| 🔄 | In Progress |
| 🚫 | Blocked |
| 👀 | In Review |
| ✅ | Done |

## Required Agent Updates to Epic

Agents working on sub-issues MUST post to parent epic:

### On Session Start (of sub-issue)
```markdown
🚀 Starting work on #<n>: <title>
```

### On Significant Progress
```markdown
### 📊 Progress Update — #<n>: <title>

**Status**: <X/Y criteria done>
**Completed**: <summary>
**Next**: <what's coming>
```

### On Blocker
```markdown
⚠️ Sub-issue #<n> is **blocked** by #<blocker>
Reason: <why>
```

### On Sub-issue Completion
```markdown
### ✅ Sub-issue Completed — #<n>: <title>

**Delivered**: <summary>
**Epic Progress**: X/Y sub-issues complete
```

### When Epic is Fully Complete
```markdown
🎉 **All sub-issues complete!**

### Summary
- <total delivered>

### Sub-issues Completed
- #42: <title> ✅
- #43: <title> ✅
- #44: <title> ✅

Ready for final review.
```