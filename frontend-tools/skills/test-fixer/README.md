# Test Maintenance

Fix failing E2E (Playwright) and unit tests (Vitest), add new E2E tests, and debug test issues using Playwright MCP.

## When to Use

- Tests are failing and need fixing
- Test selectors or IDs have changed
- Workflow has changed and tests need updating
- Adding new E2E tests for features
- Unit test expectations need updating
- Debugging why a test fails

## Workflow Phases

1. **Phase 0: Environment Setup** - Kill existing server, build, start preview
2. **Phase 1: Explore** - Dispatch `manual-tester` agent to understand the feature
3. **Phase 2: Predict → Run → Compare** - Create predictions before running tests
4. **Phase 4: Write Tests** - Follow standards from `sveltekit-testing-skill`
5. **Phase 4.5: Review Tests** - Automatic review for test type and standards
6. **Phase 5: Fix Failures** - Use `failure-mapper` to map all failures systematically
7. **Phase 6: Finalize** - Run all related tests, check flakiness, commit

## Iron Law

**NEVER guess what changed. ALWAYS investigate first.**

## Key Standards

- Query priority: `getByRole` → `getByLabel` → `getByText` → `getByTestId`
- TestIds are a **last resort** - only for custom widgets
- No `waitForTimeout()` - use `expect().toBeVisible()` or `waitForResponse()`
- Test behavior, not implementation
- E2E tests verify outcomes (item appears on page, not just success toast)
