# Session Handoff Template

**MANDATORY**: Post this comment when ending ANY work session.

## Template

```markdown
## 📋 Session Handoff — <Month Day, Year HH:MM>

### ✅ Completed This Session
- <Completed item 1>
- <Completed item 2>
- Fixed: <Bug if any>

### 📁 Files Changed
| File | Change |
|------|--------|
| `path/to/component.svelte` | New |
| `path/to/service.ts` | Modified |

### 📊 Acceptance Criteria Status
- [x] Criterion 1 ✅
- [x] Criterion 2 ✅
- [ ] Criterion 3 ⏳ in progress
- [ ] Criterion 4

### 📋 Work Plan Status
- [x] Step 1: Setup ✅
- [x] Step 2: Implementation ✅
- [ ] Step 3: Testing 👈 resume here
- [ ] Step 4: Cleanup

### ⚠️ Important Context
- <Technical decisions made and why>
- <Gotchas or edge cases discovered>
- <Things that almost worked but didn't>

### 🚫 Blockers (if any)
- Blocked by: #<n> — <reason>
- Waiting on: <external dependency>

### 🚀 Next Session
Resume at **<specific task>**:
1. <First thing to do>
2. <Second thing to do>
3. <Expected outcome>
```

## Required Fields

| Field | Required? | Notes |
|-------|-----------|-------|
| Completed This Session | ✅ Yes | Even if just "Investigation" |
| Files Changed | ✅ Yes | Only significant files |
| Acceptance Criteria Status | ✅ Yes | Show current state |
| Work Plan Status | ✅ Yes | Show where to resume |
| Important Context | ✅ Yes | Critical for continuity |
| Blockers | If applicable | Document anything blocking |
| Next Session | ✅ Yes | Specific starting point |

## Quick Version

For very short sessions or minor work:

```markdown
## 📋 Handoff — <date>

**Done**: <1-2 items>
**Files**: `path/to/file.ts` (modified)
**Criteria**: 2/5 complete
**Next**: Continue with <specific task>
**Note**: <anything critical>
```

## When to Post

- ✅ Before switching to different work
- ✅ Before ending for the day
- ✅ Before handing off to another person
- ✅ After hitting an unresolvable blocker
- ✅ When context would be lost

## Anti-Patterns

❌ Ending session without any handoff comment
❌ Vague "Next Session" like "continue working"
❌ Forgetting to show acceptance criteria status
❌ Not mentioning blockers when blocked