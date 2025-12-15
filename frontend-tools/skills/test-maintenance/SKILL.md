---
name: test-maintenance
description: Fix failing E2E (Playwright) and unit tests (Vitest), add new E2E tests, and debug test issues using Playwright MCP. Use when (1) tests are failing and need fixing, (2) test selectors or IDs have changed, (3) workflow has changed and tests need updating, (4) adding new E2E tests for features, (5) unit test expectations need updating, (6) debugging why a test fails using live browser interaction.
---

# E2E Test Suite

<MANDATORY>
BEFORE doing anything else:
1. Read `references/patterns.md` for credentials, URLs, and utilities
2. Create TodoWrite entries for ALL phases you'll execute:
   - "Phase 0: Environment Setup"
   - "Phase 1: Explore with manual-tester"
   - "Phase 2: Predict → Run → Compare"
   - "Phase 4.5: Review Tests" (if adding tests)
   - "Phase 5: Fix with failure-mapper" (if fixing)
   - "Phase 6: Finalize"
3. Mark current phase as in_progress, update as you complete each
</MANDATORY>

<STANDARDS>
When writing or fixing E2E tests, follow standards from `sveltekit-testing-skill`:
- Query priority: `getByRole` → `getByLabel` → `getByText` → `getByTestId`
- **TestIds are a LAST RESORT** - only for custom widgets without native semantics
- No `waitForTimeout()` - use `expect().toBeVisible()` or `waitForResponse()`
- Test behavior, not implementation
- E2E tests verify outcomes (item appears on page, not just success toast)
</STANDARDS>

## Workflow

```
Fixing tests: Setup → Explore → Analyze Test → Run Tests → Fix → Finalize
Adding tests: Setup → Explore → Add Accessibility (if needed) → Write Tests → Review → Finalize
```

## Iron Law

NEVER guess what changed. ALWAYS investigate first.

## Why This Workflow Exists

**Reactive fixing** (see error → fix → run → repeat):
- Burns ~15-20k tokens per failure cycle
- Loses patterns across failures
- Context exhaustion after 3-4 failures

**Map-first fixing** (map all → fix systematically):
- ~5k tokens for complete map
- See patterns across all failures
- Fix root causes, not symptoms

The workflow exists to preserve YOUR context. Follow it.

## Rationalizations That Mean Failure

If you catch yourself thinking:
- "I can just check the component quickly" → WRONG. Dispatch manual-tester first.
- "This looks like a simple fix" → WRONG. Map ALL failures before fixing ANY.
- "I'll read patterns.md later" → WRONG. Read it BEFORE starting.
- "I already know the issue" → WRONG. You're guessing. Investigate.
- "Manual-tester is overkill" → WRONG. It preserves context and catches issues you'd miss.
- "I'll map failures manually" → WRONG. Dispatch failure-mapper agent. It preserves main context.
- "I can add testIds quickly" → WRONG. Dispatch testid-fixer for 2+ components. They run in parallel.
- "I'll run tests to see what fails" → WRONG. Explore the feature first, THEN run tests.
- "The test error tells me what's wrong" → WRONG. Errors are symptoms. Explore first.
- "Let me just check if the server is running" → WRONG. Phase 0 handles this.
- "I need to understand the component first" → WRONG. Manual-tester understands for you.
- "The failure map won't tell me more than the error" → WRONG. It shows patterns.
- "I'll create predictions mentally" → WRONG. Write them to TodoWrite.
- "I'll use getByTestId, it's faster" → WRONG. Follow query priority from sveltekit-testing-skill.
- "I'll add waitForTimeout to fix timing" → WRONG. Use proper waits per sveltekit-testing-skill.
- "This component needs a testid" → WRONG. First try: aria-label, proper label, semantic HTML. Testid is last resort.
- "I'll add testids to all the form fields" → WRONG. Form fields have roles. Use `getByRole('textbox')`, `getByRole('combobox')`.
- "The tests look fine, review is overkill" → WRONG. Run the review. Catches wrong test types and missing cases.
- "I'll review after running" → WRONG. Review catches issues that waste test cycles.
- "This is clearly an E2E test" → WRONG. Check against the Test Type Decision Framework in Phase 4.5.

## Run Commands

| Test Type | Command |
|-----------|---------|
| E2E Staff | `pnpm run test:e2e:staff -- path/to/test.spec.ts` |
| E2E Customer | `pnpm run test:e2e:customer -- path/to/test.spec.ts` |
| Unit | `pnpm run test:unit path/to/file.test.ts` |

<WARNING>
NEVER use `test:e2e:staff:ci` or `test:e2e:customer:ci` locally.
These are CI-only commands (no webServer, expects external server).
Always use `test:e2e:staff` or `test:e2e:customer` for local testing.
</WARNING>

## You Are Deviating If...

Stop and return to the workflow if ANY of these are true:

- You're reading component source without manual-tester findings
- You ran a test and are now "investigating" the error
- You're fixing something without a failure map from failure-mapper
- You're thinking "this is faster than dispatching an agent"
- You haven't created prediction todos but want to run tests
- You're running tests without completing Phase 4.5 review
- You skipped checking test type appropriateness

**If deviating:** Return to the last completed phase. Do NOT continue.

---

## Phase 0: Environment Setup (MANDATORY)

**Step 1: Kill existing server**
```bash
lsof -ti:4173 | xargs kill -9 2>/dev/null || true
```

**Step 2: Build project**
```bash
pnpm run build:dev
```

**Step 3: Start preview server**
```bash
pnpm run preview &
```
Wait for "http://localhost:4173" to appear in output.

**GATE:** Server running at localhost:4173? If NO → Debug build/server issues first.

---

## Phase 1: Explore (MANDATORY)

**YOU MUST dispatch `manual-tester` agent.** This is not optional.

```
Agent prompt: "Explore [feature] at [URL]. Document: happy path steps, element roles and accessible names, elements needing testids (custom widgets only), API endpoints, test cases."
```

Agent returns findings. Create TodoWrite entry: "Phase 1: Explore - COMPLETE" only after agent finishes.

<CRITICAL>
DO NOT run tests until this phase completes.
Running tests early = seeing failure messages = "I already know the issue" rationalization = deviation.
</CRITICAL>

**GATE:** Did manual-tester complete AND return findings?
- If NO → STOP. You may NOT proceed to any phase that runs tests.
- If YES → Proceed to Phase 2. Create prediction todos from findings.

---

## Phase 2: Predict → Run → Compare

**Step 1: Read test file**
Read the test file. For each locator/assertion, create a TodoWrite entry:
- "Prediction: `{testId}` - PASS/FAIL because {reason}"

**Step 2: Create prediction todos (REQUIRED)**
You MUST have prediction todos BEFORE running tests. Example:
- "Prediction: appointmentAllDay-checkbox - FAIL (manual-tester found switch, not checkbox)"
- "Prediction: appointmentTime-startTime-selector - PASS (exists in findings)"

**Step 3: Run test**
Only NOW run the test:
```bash
pnpm run test:e2e:staff -- path/to/test.spec.ts
```

**Step 4: Compare predictions to actual**
Mark prediction todos as completed. Note surprises.

<FAILURE-TRAP>
You just saw test output. Your brain is saying "I know the fix."
STOP. This is the deviation point.
DO NOT investigate errors. DO NOT read components.
GO TO Phase 5 Step 1 and dispatch failure-mapper.
</FAILURE-TRAP>

---

## Phase 3: Add Accessibility Attributes (If Needed)

<SEMANTIC-FIRST>
Most elements should be findable via `getByRole` or `getByLabel` WITHOUT testids.
Only add `data-testid` when:
- Custom widget without native role (custom calendar, drag-drop zones)
- Dynamic content where text/label changes unpredictably
- Third-party component without accessible API

DO NOT add testids to: buttons, inputs, links, checkboxes - use their native roles.
</SEMANTIC-FIRST>

If testids ARE needed, use convention: `{feature}-{element-type}` (see patterns.md)

---

## Phase 4: Write Tests

<STANDARDS-CHECK>
Before writing: Read `sveltekit-testing-skill` Quick Reference.
Apply: Query priority, no hardcoded waits, verify outcomes not just toasts.
</STANDARDS-CHECK>

1. Check similar tests in `e2e/staff_user/` or `e2e/customer_user/`
2. Choose fixture (see patterns.md for hierarchy)
3. Write happy path first using Phase 1 findings
4. Add edge cases
5. **Standards review**: Does test use `getByRole` where possible? No `waitForTimeout`?

---

## Phase 4.5: Review Tests (AUTOMATIC)

This phase runs automatically after writing tests. Issues are fixed automatically.

**Review Checklist:**

Create TodoWrite entries for each category:

### Category 1: Test Type Appropriateness
Reference: `sveltekit-testing-skill` Test Type Decision Framework

| Test Content | Action |
|--------------|--------|
| Testing form field validation only | Move to component test |
| Testing UI toggle/dropdown mechanics | Move to component test |
| Testing utility function | Move to unit test |
| Testing complete user journey across pages | ✅ Keep as E2E |
| Testing critical flow (auth, checkout, data creation) | ✅ Keep as E2E |

**Action:** If test is wrong type, move it to correct location and test type.

### Category 2: Missing Test Cases
Compare tests written against Phase 1 manual-tester findings:

- [ ] All happy path steps from manual-tester covered?
- [ ] Edge cases identified in exploration included?
- [ ] Error states that should be tested?

**Action:** Add missing test cases identified in Phase 1 exploration.

### Category 3: E2E Standards Compliance
Reference: `sveltekit-testing-skill` Core Principles & Common Mistakes

| Check | Auto-Fix |
|-------|----------|
| Uses `getByTestId` before semantic queries? | Replace with `getByRole`/`getByLabel`/`getByText` |
| Has `waitForTimeout()` calls? | Replace with `expect().toBeVisible()` or `waitForResponse()` |
| Only checks success toast, not outcome? | Add assertion for actual outcome (item on page) |
| Uses `networkidle`? | Replace with specific element/response waits |

**Step 1: Run Review**
Go through all three categories. Mark TodoWrite entries as you check.

**Step 2: Auto-Fix Issues**
For each issue found:
1. Apply the fix from the Action/Auto-Fix column
2. Mark TodoWrite entry as completed
3. Continue to next issue

**Step 3: Continue**
Once all issues fixed, proceed to Phase 5/6.

<DEVIATION-TRAP>
If you're thinking "tests look fine, I'll skip review" → WRONG.
The review catches issues that waste test cycles and produce false confidence.
</DEVIATION-TRAP>

---

## Phase 5: Fix Failures (MANDATORY SEQUENCE)

<IRON-GATE>
You CANNOT fix ANYTHING until failure-mapper returns a map.

If you're thinking:
- "I already saw the errors" → That's the trap. Dispatch anyway.
- "I'll just check the component" → That's the trap. Dispatch anyway.
- "Manual mapping is faster" → That's the trap. Dispatch anyway.

Manual mapping is NOT an option. Only failure-mapper maps failures.
</IRON-GATE>

**Step 1: Dispatch failure-mapper (NO EXCEPTIONS)**

Dispatch `failure-mapper` agent:
```
TEST_PATH: {test-file-path}
TEST_COMMAND: pnpm run test:e2e:staff --
```

Agent:
- Creates temp branch with commit per failure
- Returns failure map + temp branch name
- Analyzes patterns and root cause

Create TodoWrite from the failure map.

**GATE:** Do you have failure map? If NO → Wait for agent.

**Step 2: Fix root cause**

| Pattern in Map | Fix Approach |
|----------------|--------------|
| Missing semantic identifiers | First: add aria-label or proper label association. Only dispatch `testid-fixer` if element has no native role/semantics |
| Utility function wrong | Update test to use correct utility |
| Element type changed | Update test assertions |
| Timing issues | Add proper waitFor conditions |

<STANDARDS-CHECK>
When fixing, ensure fixes follow `sveltekit-testing-skill` standards:
- Don't add `waitForTimeout()` as a timing fix
- Use proper element queries, not just testIds
- If adding testIds, follow naming convention from patterns.md
</STANDARDS-CHECK>

For testId fixes with 2+ components: dispatch `testid-fixer` agents in parallel (max 3).

```
Agent prompt for testid-fixer:
COMPONENT_PATH: {path/to/Component.svelte}
TESTID_PATTERN: {testId}-{value}-radio-button
ELEMENT_SELECTOR: button elements in the each block
```

**Step 3: Update test file**

Using the failure map, update the test file:
1. Replace old testIds with new ones
2. Swap utility functions as needed
3. Remove/update obsolete assertions

**Step 4: Verify**

Uncomment ALL mapped lines → Run test → Should pass.

**Step 5: Cleanup**

Delete temp branch: `git branch -D {temp-branch-name}`

**Never:**
- Use arbitrary `waitForTimeout` as a fix
- Leave `.skip` as a permanent solution

For advanced parallel fixing: See `references/parallel-test-fixing.md`

---

## Phase 6: Finalize

1. Run all related tests: `pnpm run test:e2e:staff -- e2e/staff_user/feature/`
2. Check flakiness: `--repeat-each=3`
3. Remove `.only`, `.skip`, `console.log`
4. Commit

---

## References

- `references/patterns.md` - Credentials, fixtures, utilities, testid conventions
- `references/parallel-test-fixing.md` - Git worktrees for concurrent fixes
