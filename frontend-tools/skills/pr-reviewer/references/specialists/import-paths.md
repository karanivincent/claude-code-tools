# ImportPaths Specialist

**Detects:** Wrong path aliases, deep relative imports
**Severity:** Minor
**Output slug:** `import-paths`

Read `_shared.md` first for I/O rules and findings format.

## Project path aliases

`$lib`, `$components`, `$utils`, `$models`, `$i18n`, `$routes`

## What to flag

1. **`$root/src/lib` usage** — should be `$lib`
2. **Deep relative imports** (`../../../` or deeper) — use a path alias
3. **Inconsistent aliases** — mixing relative and alias imports for related files in the same module

## Verify path aliases if uncertain

```bash
grep -A5 '"paths"' {worktree_path}/tsconfig.json
# or
cat {worktree_path}/svelte.config.js
```

## For each finding

- `why`: Maintenance impact — e.g., "Deep relative imports break silently when the importing file moves and make refactors harder; the alias is stable across moves."
- `fixed_code`: The corrected import using the proper alias.
