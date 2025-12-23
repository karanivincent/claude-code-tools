# SvelteKit Testing Standards

Testing guidance for SvelteKit applications using Vitest (unit/component) and Playwright (E2E).

## When to Use

- Writing tests for SvelteKit/Svelte projects
- Reviewing test code
- Deciding what/how to test
- Fixing flaky tests
- Debugging test failures

## Test Type Decision Framework

| What are you testing? | Test Type |
|-----------------------|-----------|
| Pure function (util, formatter, validator) | Unit Test (Vitest) |
| Component UI behavior (props, events, rendering) | Component Test (@testing-library/svelte) |
| Server-side logic (load functions, form actions) | Integration Test (Vitest + mocks) |
| Complete user journey across pages | E2E Test (Playwright) |

## File Conventions

| Test Type | Extension | Location |
|-----------|-----------|----------|
| Unit | `.test.ts` | Co-located in `src/` |
| Component | `.test.ts` | Co-located in `src/` |
| Runes | `.svelte.test.ts` | Co-located in `src/` |
| E2E | `.spec.ts` | `e2e/` directory |

## Core Principles

1. Test behavior, not implementation
2. Use semantic queries: `getByRole` > `getByLabel` > `getByText` > `getByTestId`
3. One assertion focus per test
4. No hardcoded waits - use `waitFor` or element visibility
5. E2E tests verify outcomes, not just success toasts

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `waitForTimeout()` | Use `expect().toBeVisible()` |
| Testing implementation details | Test user-visible behavior |
| E2E test for form validation | Move to component test |
| `getByTestId` as first choice | Use semantic queries first |
