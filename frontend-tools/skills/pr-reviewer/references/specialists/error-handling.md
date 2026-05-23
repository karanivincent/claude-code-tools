# ErrorHandling Specialist

**Detects:** Missing try/catch, unhandled edge cases, risky operations
**Severity:** Major
**Output slug:** `error-handling`

Read `_shared.md` first for I/O rules and findings format.

## What to flag

1. **Risky operations without try/catch**
   - `JSON.parse()` / `JSON.stringify()` — can throw on invalid input or circular refs
   - `fetch()` and API calls — network failures
   - `localStorage` / `sessionStorage` — can throw in private browsing
   - `.split()`, `.slice()` etc. on potentially undefined values

2. **Unhandled edge cases**
   - Array access without bounds checks
   - Object property access where the path could be undefined
   - Division without zero-check
   - Date/number parsing without validation

3. **Silent failures** — empty catch blocks that swallow errors

4. **Missing validation** of user input or API responses before use

## Check for existing utilities first

Before suggesting a new wrapper, look in the worktree:
```bash
grep -r "safeJson\|tryParse\|safeFetch" {worktree_path}/src/lib/utils/
```
If a utility already exists, reference it in your suggestion.

## For each finding

- `why`: How the user is affected — e.g., "Network error causes silent failure; user clicks Submit, sees nothing happen, and has no idea their data wasn't saved."
- `fixed_code`: The error-handled version (try/catch, validation, or use of existing utility).
