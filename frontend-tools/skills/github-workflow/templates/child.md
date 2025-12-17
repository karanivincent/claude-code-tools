# Child Issue Template

Use this header for issues that are part of an epic or have blockers.

```markdown
> 🚫 **Blocked by**: #<n> (<blocker title>)
> 📦 **Parent**: #<n> (<epic title>)

## Description

<Issue description here>

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>
- [ ] <Criterion 3>
```

## States

- **Blocked**: `> 🚫 **Blocked by**: #<n> (<title>)`
- **Unblocked**: `> ✅ **Unblocked** — ready to start`
- **No blocker**: Omit the blocked line entirely

## Automatic Updates

When a blocker is resolved:
1. Update header from 🚫 to ✅
2. Remove `blocked` label from this issue
