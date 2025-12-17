# Issue Completion Template

Post this comment when closing an issue to document what was delivered.

```markdown
## ✅ Completed — <Month Day, Year>

### Delivered
- <What was built or fixed>
- <Key functionality added>

### Key Files
| File | Purpose |
|------|---------|
| `path/to/file.ts` | <Brief description> |
| `path/to/component.svelte` | <Brief description> |

### Testing
- <How the work was verified>
- <Tests added or updated>

### Notes
- <Any follow-up considerations>
- <Related issues or future work>
```

## Guidelines

- **Delivered**: Focus on outcomes, not process. What can users/developers now do?
- **Key Files**: Only significant files, not every touched file
- **Testing**: How was correctness verified? Manual testing, unit tests, E2E?
- **Notes**: Anything the next person should know — edge cases, limitations, ideas

## Completion Checklist

Before posting completion comment:

1. [ ] All acceptance criteria checked off in issue body
2. [ ] Labels updated (remove `in-progress`, `blocked`)
3. [ ] Parent epic dependency tree updated (if child issue)
4. [ ] Project status set to "Done"
