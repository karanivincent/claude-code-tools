---
name: sveltekit-test-guide
description: Use when writing tests, reviewing test code, or deciding what/how to test in SvelteKit/Svelte projects. Covers unit tests (Vitest), component tests (@testing-library/svelte), and E2E tests (Playwright). Triggers on "write tests for", "add test coverage", "create e2e test", "fix flaky test", "test fails", "test timeout", or any testing-related task.
---

# SvelteKit Testing Standards

This skill provides testing guidance for SvelteKit applications using Vitest (unit/component) and Playwright (E2E).

## Quick Reference

| Test Type | Tool | File Extension | Location |
|-----------|------|----------------|----------|
| Unit | Vitest | `.test.ts` | Co-located in `src/` |
| Component | @testing-library/svelte | `.test.ts` | Co-located in `src/` |
| Runes | Vitest | `.svelte.test.ts` | Co-located in `src/` |
| E2E | Playwright | `.spec.ts` | `e2e/` directory |

## Test Type Decision Framework

```
┌─────────────────────────────────────────────────────────────┐
│ What are you testing?                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pure function (util, formatter, validator)?                │
│  └─► UNIT TEST with Vitest                                  │
│                                                             │
│  Component UI behavior (props, events, rendering)?          │
│  └─► COMPONENT TEST with @testing-library/svelte            │
│                                                             │
│  Server-side logic (load functions, form actions, API)?     │
│  └─► INTEGRATION TEST with Vitest + mocks                   │
│                                                             │
│  Complete user journey across pages?                        │
│  └─► E2E TEST with Playwright                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## When to Use Each Test Type

### Unit Tests (Vitest)

**Test:** Pure functions, utilities, validators, formatters, store logic
**Skip:** Component rendering, DOM interactions, things already covered by component tests

### Component Tests (@testing-library/svelte)

**Test:** User interactions, conditional rendering, event handling, accessibility
**Skip:** Implementation details, internal state, things that require real backend

### E2E Tests (Playwright)

**Test:** Critical user journeys (auth, checkout, data creation), multi-page flows
**Skip:** UI mechanics (toggles, dropdowns), validation of individual fields, anything testable at lower levels

## Core Principles

1. **Test behavior, not implementation** - Assert what users see, not internal state
2. **Use semantic queries** - `getByRole` > `getByLabel` > `getByText` > `getByTestId`
3. **One assertion focus per test** - Test one behavior, multiple assertions okay if related
4. **No hardcoded waits** - Use `waitFor`, `expect().toBeVisible()`, or response waits
5. **E2E tests verify outcomes** - Must confirm the action succeeded (item appears on page, not just "success toast")

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `waitForTimeout()` | Use `expect().toBeVisible()` or `waitForResponse()` |
| Testing implementation details | Test user-visible behavior instead |
| E2E test for form validation | Move to component test |
| `getByTestId` as first choice | Use `getByRole` → `getByLabel` → `getByText` first |
| Shared state between tests | Use `beforeEach` setup or isolated fixtures |
| Missing `flushSync()` with runes | Required after state changes in `.svelte.test.ts` |
| Using `networkidle` | Flaky—use specific element or response waits |

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| Test times out | Check for missing `await`, use `waitFor()` or specific element waits |
| Flaky in CI only | Add retries, use `waitForResponse()`, avoid `networkidle` |
| Runes not updating | Use `.svelte.test.ts` extension, add `flushSync()` |
| Component not rendering | Check for missing context providers or store mocks |
| `act(...)` warning | Wrap state changes in `act()` or use `userEvent` (auto-wraps) |

## File Naming & Location

```
src/
├── lib/
│   ├── components/
│   │   └── Button/
│   │       ├── Button.svelte
│   │       └── Button.test.ts        # Co-located component test
│   └── utils/
│       ├── formatters.ts
│       └── formatters.test.ts        # Co-located unit test
├── routes/
│   └── dashboard/
│       ├── +page.svelte
│       ├── +page.server.ts
│       └── +page.server.test.ts      # Server-side integration test
tests/                                 # E2E tests only
├── e2e/
│   ├── auth.spec.ts
│   └── appointments.spec.ts
└── fixtures/
    └── auth.setup.ts
```

## Code Patterns

### Svelte 5 Runes (requires `.svelte.test.ts`)

```typescript
import { flushSync } from 'svelte';

test('reactive state updates', () => {
	const counter = createCounter();
	counter.increment();
	flushSync(); // Required!
	expect(counter.count).toBe(1);
});
```

### Query Priority

```typescript
// ✅ Best: Semantic queries
page.getByRole('button', { name: 'Submit' });
page.getByLabel('Email');

// ⚠️ Acceptable: Text content
page.getByText('Welcome back');

// ❌ Last resort only
page.getByTestId('submit-btn');
```

## Detailed References

- **E2E patterns (Playwright)**: See [references/e2e-patterns.md](references/e2e-patterns.md) for Page Object Model, authentication, flaky test fixes, CI setup
- **Component testing**: See [references/component-testing.md](references/component-testing.md) for @testing-library patterns, accessibility testing, Svelte 5 specifics
- **Unit testing**: See [references/unit-testing.md](references/unit-testing.md) for store testing, mocking strategies, coverage configuration

## Related Skills

- **test-maintenance**: Use for fixing failing E2E tests and debugging test issues
- **superpowers:condition-based-waiting**: For eliminating flaky async tests with proper polling
- **superpowers:systematic-debugging**: For root-cause analysis of test failures
