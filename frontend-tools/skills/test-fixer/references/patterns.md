# E2E Patterns Quick Reference

## Standards Reference

For generic E2E testing standards (query priority, anti-patterns, wait strategies):
→ See `sveltekit-test-guide/references/e2e-patterns.md`

This file contains **PROJECT-SPECIFIC** patterns only.

---

## Credentials

| User | Email | Password |
|------|-------|----------|
| Staff | `support@getyond.com` | `ohkooPhoh1xahhai` |
| Customer | `sb_customer_auth@example.com` | `phae2ahNguCeitah` |

## URLs

| Environment | URL |
|-------------|-----|
| Dev Server | `http://localhost:3000` |
| Preview (tests) | `http://localhost:4173` |
| Dev API | `https://dev-api.getyond.com/` |

## Environment Setup Commands

| Step | Command |
|------|---------|
| Kill port 4173 | `lsof -ti:4173 \| xargs kill -9 2>/dev/null \|\| true` |
| Build for tests | `pnpm run build:dev` |
| Start preview | `pnpm run preview &` |
| Verify server | Wait for "localhost:4173" in output |

**NEVER use CI commands locally:**
- `test:e2e:staff:ci` and `test:e2e:customer:ci` are for GitHub Actions only
- They expect an external server (no webServer config)
- Always use `test:e2e:staff` or `test:e2e:customer` for local testing

## Fixture Hierarchy

```
@playwright/test (base)
└── loginFixture (sessionToken, userInfo)
    └── apiClientFixture (client, instance)
        └── createCustomerFixture (customer)
            └── createPaymentMethodFixture (paymentMethod)
                └── createContractFixture (contract)
                    └── createClaimAndCreditFixture (claim, creditNote)
```

Import from: `$e2e/fixtures/[fixtureName]`

## Custom Test Utilities

Location: `src/lib/utils/e2eUtils.ts`

| Function | Purpose | Key Params |
|----------|---------|------------|
| `gotoPage(page, path)` | Navigate with base URL | path: `/app/...` |
| `testSelectInput(page, baseId, optionText, selectByTestId?)` | Select dropdown | baseId creates `{baseId}-selector` |
| `testCombobox(page, baseId, searchText, typeDirectly)` | Combobox with search | typeDirectly: true to type |
| `testToggleInput(page, testId, checked, isMeltUI?)` | Toggle/switch | isMeltUI: uses data-state |
| `testCheckboxInput(page, testId, checked)` | Checkbox | |
| `testGlobalMessage(page, type, text)` | Verify toast | type: 'success' or 'error' |
| `waitForResponse(page, pattern, method)` | Wait for API | pattern: string or RegExp |
| `testDatePicker(page, dateString)` | Date picker | Returns { fullDate, year, month, day } |

## Testid Convention

<WHEN-TO-USE>
**Use testids ONLY when semantic queries are impossible:**
- Custom drag-drop zones, canvas elements, third-party widgets
- Dynamic content where text/label changes unpredictably

**DO NOT use testids for:** Buttons, inputs, links, selects - use `getByRole` with accessible name

**Before adding a testid, ask:** Can I make this element findable via role + name?
- Add `aria-label` to icon-only buttons
- Associate labels properly with inputs
- Use semantic HTML (`<button>` not `<div onclick>`)
</WHEN-TO-USE>

Pattern: `{feature}-{element-type}`

| Element Type | Suffix | Example |
|--------------|--------|---------|
| Text input | `-input` | `customer-name-input` |
| Dropdown | `-selector` | `customer-type-selector` |
| Combobox | `-combobox` | `staff-combobox` |
| Toggle | `-toggle` | `active-toggle` |
| Checkbox | `-checkbox` | `terms-checkbox` |
| Button | `-button` | `submit-button` |

## File Locations

| Purpose | Path |
|---------|------|
| Staff tests | `e2e/staff_user/` |
| Customer tests | `e2e/customer_user/` |
| Fixtures | `e2e/fixtures/` |
| Auth storage | `e2e/playwright/.auth/{staff,customer}.json` |
| Test utilities | `src/lib/utils/e2eUtils.ts` |
| Test details | `e2e/testDetails.ts` (devSandboxUrl) |

## API Response Waiting

```typescript
import { devSandboxUrl } from '$e2e/testDetails';

// Wait for specific endpoint
const data = await waitForResponse(page, /customers\/\d+/, 'GET');

// Build pattern from base URL
const pattern = new RegExp(`^${devSandboxUrl}customers`);
```

## Melt UI Assertions

For Melt UI components, check `data-state` attribute instead of standard attributes:

```typescript
// Toggle checked state
await expect(page.getByTestId('my-toggle')).toHaveAttribute('data-state', 'checked');

// Toggle unchecked
await expect(page.getByTestId('my-toggle')).toHaveAttribute('data-state', 'unchecked');
```
