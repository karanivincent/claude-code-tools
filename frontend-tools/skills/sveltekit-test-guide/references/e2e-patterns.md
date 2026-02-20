# E2E Testing Patterns (Playwright)

## Table of Contents

1. [What Belongs in E2E Tests](#what-belongs-in-e2e-tests)
2. [Test Structure](#test-structure)
3. [Authentication Handling](#authentication-handling)
4. [Page Object Model](#page-object-model)
5. [Eliminating Flaky Tests](#eliminating-flaky-tests)
6. [Network Handling](#network-handling)
7. [CI/CD Configuration](#cicd-configuration)
8. [Visual Regression Testing](#visual-regression-testing)

---

## What Belongs in E2E Tests

### DO Test (Critical Paths)

- Authentication flows (login, logout, password reset)
- Data creation that affects other users/systems (appointments, orders, bookings)
- Multi-page workflows (checkout, onboarding wizards)
- Permission-based access (admin vs user views)
- Integrations with external services

### DO NOT Test (Move to Component/Unit)

- Individual form field validation
- UI state toggles (accordion open/close, modal show/hide)
- Dropdown selections without submission
- Input formatting
- Tooltip displays
- Any interaction that doesn't persist data or navigate

### Decision Rule

Ask: "If this breaks, do we lose revenue or users?" If yes → E2E. If no → lower level test.

---

## Test Structure

### Use test.step() for Readability

```typescript
test('creates appointment with participant', async ({ page }) => {
	await test.step('Open appointment modal', async () => {
		await page.getByRole('button', { name: 'New appointment' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
	});

	await test.step('Fill required fields', async () => {
		await page.getByLabel('Title').fill('Team Meeting');
		await page.getByRole('combobox', { name: /type/i }).selectOption('meeting');
	});

	await test.step('Submit and verify on calendar', async () => {
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByText('Team Meeting')).toBeVisible();
	});
});
```

### Keep Tests Independent

Each test must work in isolation. Never depend on other tests running first.

```typescript
// ❌ Bad: Depends on previous test creating data
test('edits appointment', async ({ page }) => {
	await page.getByText('Team Meeting').click(); // Assumes it exists
});

// ✅ Good: Creates its own data or uses fixtures
test('edits appointment', async ({ page, testAppointment }) => {
	await page.goto(`/appointments/${testAppointment.id}`);
});
```

---

## Authentication Handling

### storageState Pattern (Recommended)

Authenticate once, reuse session across tests:

```typescript
// auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
	await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	await page.context().storageState({ path: authFile });
});
```

```typescript
// playwright.config.ts
export default defineConfig({
	projects: [
		{ name: 'setup', testMatch: /.*\.setup\.ts/ },
		{
			name: 'chromium',
			use: { storageState: 'playwright/.auth/user.json' },
			dependencies: ['setup'],
		},
	],
});
```

### Multiple User Roles

```typescript
// Create separate auth files
// playwright/.auth/admin.json
// playwright/.auth/user.json

// Use per-describe block
test.describe('admin features', () => {
	test.use({ storageState: 'playwright/.auth/admin.json' });

	test('can delete users', async ({ page }) => {
		/* ... */
	});
});
```

### localStorage-based Auth (SvelteKit)

If your app uses localStorage tokens:

```typescript
test.beforeEach(async ({ page }) => {
	await page.goto('/'); // Must navigate first
	await page.evaluate((token) => {
		localStorage.setItem('sessionToken', token);
	}, process.env.TEST_SESSION_TOKEN);
	await page.reload();
});
```

---

## Page Object Model

### When to Use POM

- Pattern appears in 3+ tests
- Complex interactions that need encapsulation
- Forms with many fields

### When to Skip POM

- Simple, one-off tests
- Test file has < 5 tests
- Direct locators are clear enough

### Implementation Pattern

```typescript
// pages/AppointmentModal.ts
import { type Page, type Locator, expect } from '@playwright/test';

export class AppointmentModal {
	readonly page: Page;
	readonly titleInput: Locator;
	readonly typeSelect: Locator;
	readonly createButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.titleInput = page.getByLabel('Title');
		this.typeSelect = page.getByRole('combobox', { name: /type/i });
		this.createButton = page.getByRole('button', { name: 'Create' });
	}

	async open() {
		await this.page.getByRole('button', { name: 'New appointment' }).click();
		await expect(this.page.getByRole('dialog')).toBeVisible();
	}

	async fillAndSubmit(data: { title: string; type?: string }) {
		await this.titleInput.fill(data.title);
		if (data.type) {
			await this.typeSelect.selectOption(data.type);
		}
		await this.createButton.click();
	}
}
```

### Fixture-based POM (Preferred)

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';
import { AppointmentModal } from './pages/AppointmentModal';

export const test = base.extend<{ appointmentModal: AppointmentModal }>({
	appointmentModal: async ({ page }, use) => {
		await use(new AppointmentModal(page));
	},
});

// In tests
test('creates appointment', async ({ page, appointmentModal }) => {
	await appointmentModal.open();
	await appointmentModal.fillAndSubmit({ title: 'Meeting' });
	await expect(page.getByText('Meeting')).toBeVisible();
});
```

---

## Eliminating Flaky Tests

### Common Causes & Fixes

| Cause          | Bad                               | Good                                                         |
| -------------- | --------------------------------- | ------------------------------------------------------------ |
| Timing         | `waitForTimeout(3000)`            | `await expect(locator).toBeVisible()`                        |
| Network        | `waitForLoadState('networkidle')` | `waitForResponse(/api\/data/)`                               |
| Animations     | Click during animation            | `await locator.click({ force: true })` or wait for animation |
| Dynamic IDs    | `getByTestId('item-123')`         | `getByRole('listitem').filter({ hasText: 'Item Name' })`     |
| Test pollution | Shared state between tests        | `beforeEach` cleanup or isolated fixtures                    |

### Debugging Flaky Tests

```bash
# Run single test multiple times
npx playwright test path/to/test.spec.ts --repeat-each=10

# With tracing
npx playwright test --trace on

# Debug mode
npx playwright test --debug
```

### CI-Specific Settings

```typescript
// playwright.config.ts
export default defineConfig({
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	use: {
		trace: 'on-first-retry',
		video: 'on-first-retry',
	},
});
```

---

## Network Handling

### Wait for Specific API Calls

```typescript
// Wait for response before asserting
const responsePromise = page.waitForResponse(
	(resp) => resp.url().includes('/api/appointments') && resp.request().method() === 'POST'
);
await page.getByRole('button', { name: 'Create' }).click();
await responsePromise;

await expect(page.getByText('Success')).toBeVisible();
```

### Mock External Services

```typescript
// Mock payment provider
await page.route('**/api.stripe.com/**', (route) =>
	route.fulfill({
		status: 200,
		body: JSON.stringify({ success: true, id: 'mock_payment_123' }),
	})
);
```

### Simulate Error States

```typescript
test('handles API failure gracefully', async ({ page }) => {
	await page.route('**/api/appointments', (route) =>
		route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
	);

	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByText(/something went wrong/i)).toBeVisible();
});
```

---

## CI/CD Configuration

### GitHub Actions with Sharding

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm exec playwright install chromium --with-deps
      - run: pnpm exec playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.shardIndex }}
          path: playwright-report/
```

### SvelteKit webServer Config

```typescript
// playwright.config.ts
export default defineConfig({
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});
```

---

## Visual Regression Testing

### When to Use

- Design system components
- Marketing/landing pages
- PDF/document generation

### When to Avoid

- Data-heavy pages that change often
- User-generated content areas
- Time-sensitive displays

### Implementation

```typescript
test('dashboard layout', async ({ page }) => {
	await page.goto('/dashboard');

	await expect(page).toHaveScreenshot('dashboard.png', {
		mask: [page.locator('.timestamp'), page.locator('.user-avatar'), page.locator('[data-dynamic]')],
		maxDiffPixelRatio: 0.02,
	});
});
```

### Update Snapshots

```bash
npx playwright test --update-snapshots
```
