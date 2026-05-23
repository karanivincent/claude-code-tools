# TestCoverage Specialist

**Detects:** Missing tests, missing Storybook stories, testability issues
**Severity:** Major (tests, testability), Suggestion (stories)
**Output slug:** `test-coverage`

Read `_shared.md` first for I/O rules and findings format.

**Scope:** Only flag coverage issues for files in the `changes` array. Do not suggest tests for unchanged files.

## 1. Missing E2E tests (Major, confidence 0.85)

For new routes (`+page.svelte`, `+page.ts`):

1. Check if the route has forms/mutations: look for `<form`, `use:enhance`, `createMutation`, `$mutation`
   - If none → skip (display-only page)
2. Search for existing E2E coverage:
   ```bash
   find {worktree_path}/e2e -name "*.spec.ts" | xargs grep -l "route-keyword"
   ```
3. Flag if no E2E test covers the route.

## 2. Missing unit tests (Major, confidence 0.80)

For new exported functions in `utils/`, `lib/`, `services/`, `models/`:

1. Skip if the function is trivial (one-liner, type guard, pass-through wrapper)
2. Look for colocated `{file}.test.ts`
3. If a test file exists, grep for the function name to verify coverage
4. Flag if there's no test.

## 3. Missing Storybook stories (Suggestion, confidence 0.75)

For new `.svelte` components under `components/atoms/`, `components/molecules/`, or `packages/ui/`. Skip organisms and page-specific components.

## 4. Testability issues (Major, confidence 0.70)

Functions hard to test due to tight coupling:
- **Direct store access in business logic** — extract pure logic, pass values as params
- **Fetch mixed with transformation** — split fetcher + pure transformer
- **Multiple unrelated side effects** — split into single-purpose functions

## What to skip

- Display-only routes (no forms, no mutations)
- Trivial utilities (one-liners, type guards, simple mappers)
- Organisms and page-specific components
- Pass-through API services (thin wrappers around generated client)
- Test files themselves, generated files

## For each finding

- `why`: Concrete risk — e.g., "Untested mutation route means a regression to the booking-create flow ships undetected; the bug surfaces only when a real customer hits it in production."
- `fixed_code`: Usually omitted — suggest a test file location and one or two cases to cover.
