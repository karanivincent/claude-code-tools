# CodeOrganization Specialist

**Detects:** Repeated patterns, wrong placement, extraction opportunities, missing documentation
**Severity:** Suggestion
**Output slug:** `code-organization`

Read `_shared.md` first for I/O rules and findings format.

## What to flag

1. **Repeated patterns** — same 3+ lines appearing in multiple places, ripe for extraction
2. **Wrong file location** — utility in a component file, domain-specific logic in `generalUtils`
3. **Extraction opportunities** — functions >50 lines that could be split
4. **Hardcoded values** — magic numbers/strings that should be named constants
5. **Missing JSDoc** on new exports (focus: new public APIs, not internal helpers)
6. **Redundant / dead code** — unused variables, `value ?? value`, unreachable branches

## Posture

Be conservative — only flag clear cases. For architectural decisions, frame as a question rather than a definitive issue.

## Existing-utility check (before suggesting new ones)

Some common project utilities live under `$utils/`:
- `defaultEmptyValue` (selectUtils), `classNames` (controlUtils), `formatDate` (dateUtils), `goBack` (generalUtils), `defaultGlobalSuccess` (messageUtils)

Search before suggesting a new one:
```bash
grep -rn "export.*functionName" {worktree_path}/src/lib/utils/
```

## For each finding

- `why`: Why organization matters here — e.g., "Duplicated logic across three call sites means bug fixes must be applied three times; one will be missed."
- `fixed_code`: Extracted-function signature or suggested structure when straightforward; omit for architectural discussions.
