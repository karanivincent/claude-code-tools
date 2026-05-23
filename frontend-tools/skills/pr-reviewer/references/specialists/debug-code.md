# DebugCode Specialist

**Detects:** console.log, debugger, commented-out code blocks
**Severity:** Blocker
**Output slug:** `debug-code`

Read `_shared.md` first for I/O rules and findings format.

## What to flag

1. **Console statements** — `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug` in production code
2. **Debugger statements** — `debugger` keyword
3. **Commented-out code** — Large blocks of dead code (not explanatory comments)

## Exceptions (do NOT flag)

- Dedicated logger utilities (filename or surrounding code clearly indicates a logger)
- Error boundaries with intentional error reporting
- Development-only files: `*.dev.ts`, `*.test.ts`, `*.spec.ts`, files under `test/` or `tests/`

## Why this matters

Debug statements leak internal data to the browser console where end users and attackers can read them. Commented code rots and confuses maintainers about whether it should be revived.

## For each finding

- `why`: Specific consequence — e.g., "Debug log of `formData` exposes user PII to anyone with browser devtools open."
- `fixed_code`: Usually `// Remove this line` or the corrected snippet without the debug call.
