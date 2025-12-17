# Session Handoff Template

Post this comment when ending a session to enable seamless continuation.

```markdown
## 📋 Session Handoff — <Month Day, Year>

### ✅ Completed

- <Completed item 1>
- <Completed item 2>
- Fixed: <Bug description if any>

### 📁 Key Files Changed

| File | Change |
|------|--------|
| `packages/ui/src/shadcn/drawer/` | New (shadcn) |
| `packages/ui/src/index.ts` | Added Drawer export |
| `apps/selfservice/src/lib/components/FilterRow.svelte` | New |
| `apps/selfservice/src/routes/classes/+page.svelte` | Added filter button |

### ⏳ Pending

- [ ] <Remaining task 1>
- [ ] <Remaining task 2>

### ⚠️ Notes

- <Important context for next session>
- <Technical considerations or gotchas>

### 🚀 Next Session

Start with **<Next task title>** — <brief description of what to do>
```

## Guidelines

- **Completed**: List all meaningful work done, including bug fixes
- **Key Files**: Only include files with significant changes
- **Pending**: Reference remaining acceptance criteria or tasks
- **Notes**: Include technical context that would be lost between sessions
- **Next Session**: Give clear direction on where to start
