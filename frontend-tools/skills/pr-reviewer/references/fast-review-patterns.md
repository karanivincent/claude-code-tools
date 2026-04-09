# Fast Review Patterns

Compact checklist for the Consolidated Reviewer agent (small PR fast path). Replaces loading agents.md + patterns.md + reviewer-examples.md in a single pass.

**Critical constraint:** Only flag issues on lines present in the `changes` array from diff-data.json. Worktree access is for validation only. Any finding on a line not in `changes` will be rejected by MetaReviewer.

---

## Blocker

### Debug Code
Console statements, debugger, large commented-out blocks.
- Pattern: `console\.(log|warn|error|info|debug)\(` | `\bdebugger\b`
- Exceptions: logger utilities, error boundaries, dev-only files (*.dev.ts, tests)
- Why: "Debug statements leak internal data to browser console, visible to end users"

### Security
Hardcoded secrets, API keys, credentials, sensitive data logging.
- API keys: `['"]sk-[a-zA-Z0-9]{20,}['"]`
- Secrets: `(api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]`
- DB strings: `(mongodb|postgres|mysql|redis)://[^'"]+:[^'"]+@`
- Exceptions: type definitions, test mocks with fake values, documentation
- Why: "API key in source code will be exposed in browser bundle, allowing attackers to impersonate the application"

---

## Major

### Type Safety
Missing types, `any`, unsafe casts, nullish misuse.
- Explicit any: `:\s*any(?:\s|[,)\]>]|$)` | `as\s+any\b`
- String vs enum: `!== ['"][A-Z_]+['"]` | `=== ['"][A-Z_]+['"]` -- before flagging, check api.ts in worktree for type enforcement (union types make string literals safe)
- Or vs nullish: `\|\|\s*(?:['"]|\\[\\]|0|false)` -- use `??` for null/undefined
- Redundant nullish: `(\w+)\s*\?\?\s*\1`
- Missing return types on exported functions
- Multiple equality checks: `=== 'A' || x === 'B'` -> `['A', 'B'].includes(x)`
- Why: "String literal bypasses TypeScript enum checks -- if enum value changes, this comparison silently breaks"

### Error Handling
Unprotected risky operations, silent failures.
- `JSON.parse`/`JSON.stringify` without try/catch -- check for existing `safeJsonParse` utility first
- `localStorage`/`sessionStorage` access (throws in private browsing): `(localStorage|sessionStorage)\.(get|set)Item`
- Unhandled fetch/API calls
- Empty catch blocks that swallow errors
- Array access without bounds checking
- String operations (`.split()`, `.slice()`) on potentially undefined values
- Why: "Network error causes silent failure, user waits indefinitely with no feedback"

### Internationalization
Hardcoded UI strings that should use `$LL` translations.
- String literals in Svelte templates: `<button>Submit</button>` -> `<button>{$LL.common.submit()}</button>`
- Ignore: CSS classes, technical identifiers, dev error messages, test files
- Why: "Non-English users see untranslated text, breaking the localized experience"

### Test Coverage (flag, don't block)
- New routes with forms/mutations (`<form`, `use:enhance`, `createMutation`) but no E2E test in `e2e/**/*.spec.ts`
- New exported functions in utils/lib/services without unit tests
- Testability: store access in logic functions, mixed fetch+transform in same function
- Skip: display-only routes, trivial utilities, generated files, test files themselves
- Why: "Untested mutation route means regressions ship undetected to production"

---

## Minor

### Import Paths
- `$root/src/lib` usage -> use `$lib`: `from ['"]\\$root/src/lib`
- Deep relative imports (3+ levels) -> path aliases: `from ['"]\\.\\.(/\\.\\.){2,}`
- Available aliases: `$lib`, `$components`, `$utils`, `$models`, `$i18n`, `$routes`
- Why: "Deep relative imports break when files move and are harder to refactor"

### Naming
- Negative booleans (`!hidden` -> `visible`) -- causes double negations
- Missing `is`/`has`/`should` prefix on booleans
- Function names not matching behavior (e.g., `sortByWorkHours` that sorts alphabetically)
- State vs action confusion (`showQRReader` action vs `qrReaderVisible` state)
- Why: "Developers expect X behavior based on name, causing misuse and bugs"

---

## Suggestion

### Code Organization
- 3+ line repetition across locations -> extract to shared function
- Functions >50 lines -> split into smaller units
- Magic numbers: `(?<![.\d])\d{3,}(?![.\d])` -> named constants
- Missing JSDoc on exported functions/components
- Unused variables, dead code, `= undefined` (prefer `null`)
- Hardcoded colors: `['"]#[0-9A-Fa-f]{6}['"]` -> use named constants
- Why: "Duplicated logic means bug fixes must be applied in multiple places"

---

## Confidence Thresholds

Minimum confidence to report: 0.6. Blocker patterns have 0.95+ confidence. Major patterns 0.75-0.90. Minor/suggestions 0.60-0.80. When uncertain, lower confidence rather than omitting -- MetaReviewer filters low-confidence findings.

---

## Worktree Access (Validation Only)

Use the worktree to verify, never to discover new issues outside the diff:
- Check api.ts for type/enum definitions before flagging string literals
- Search for existing utilities (`safeJsonParse`, etc.) before suggesting new ones
- Verify test file locations before flagging missing coverage
- Confirm path aliases in tsconfig.json/svelte.config.js

---

## Output Format

Write findings JSON to `{output_file}`:

```json
{
  "agent": "ConsolidatedReviewer",
  "findings": [{
    "file": "path/to/file.ts",
    "line": 42,
    "severity": "blocker|major|minor|suggestion",
    "confidence": 0.85,
    "issue": "Brief description",
    "why": "Real-world consequence in one sentence",
    "suggestion": "How to fix",
    "code_snippet": "the problematic line from changes array",
    "fixed_code": "corrected version (optional for complex issues)"
  }]
}
```

Return only: `{ "agent": "ConsolidatedReviewer", "findings_count": N, "findings_file": "{output_file}" }`
