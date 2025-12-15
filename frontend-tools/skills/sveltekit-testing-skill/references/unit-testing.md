# Unit Testing Patterns (Vitest)

## Table of Contents

1. [What to Unit Test](#what-to-unit-test)
2. [Vitest Configuration](#vitest-configuration)
3. [Testing Pure Functions](#testing-pure-functions)
4. [Testing Svelte Stores](#testing-svelte-stores)
5. [Testing SvelteKit Server Code](#testing-sveltekit-server-code)
6. [Mocking Strategies](#mocking-strategies)
7. [Code Coverage](#code-coverage)
8. [Test Organization](#test-organization)

---

## What to Unit Test

### DO Test

- Pure utility functions (formatters, validators, parsers)
- Data transformations
- Business logic extracted from components
- Custom store logic
- Type guards and assertion functions
- Complex calculations

### DO NOT Test

- Simple getters/setters
- Direct library wrappers without custom logic
- Framework behavior (Svelte reactivity, SvelteKit routing)
- Code already tested by integration/E2E tests
- One-liner functions

### Decision Rule

If the function has no dependencies and returns predictable output for given input → unit test.
If it requires DOM, components, or real services → integration or E2E test.

---

## Vitest Configuration

### Recommended vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	test: {
		// Environment
		environment: 'jsdom',

		// Setup
		setupFiles: ['./vitest-setup.ts'],

		// File patterns
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.ts'], // Handled separately for runes

		// Globals (optional - allows test/expect without imports)
		globals: true,

		// Resolve conditions for Svelte
		resolve: {
			conditions: process.env.VITEST ? ['browser'] : [],
		},

		// Coverage
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['node_modules/', 'src/**/*.test.ts', 'src/**/*.spec.ts', 'src/mocks/**'],
		},

		// Performance
		pool: 'threads',
		isolate: true,
	},
});
```

### vitest-setup.ts

```typescript
import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import { vi } from 'vitest';

// Mock SvelteKit modules
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	prefetch: vi.fn(),
	prefetchRoutes: vi.fn(),
}));

// Reset mocks between tests
beforeEach(() => {
	vi.clearAllMocks();
});
```

---

## Testing Pure Functions

### Basic Pattern

```typescript
import { describe, test, expect } from 'vitest';
import { formatCurrency, parseDate, validateEmail } from './utils';

describe('formatCurrency', () => {
	test('formats positive amounts', () => {
		expect(formatCurrency(1234.56)).toBe('$1,234.56');
	});

	test('handles zero', () => {
		expect(formatCurrency(0)).toBe('$0.00');
	});

	test('formats negative amounts', () => {
		expect(formatCurrency(-50)).toBe('-$50.00');
	});
});
```

### Parameterized Tests

```typescript
import { describe, test, expect } from 'vitest';
import { isValidEmail } from './validators';

describe('isValidEmail', () => {
	test.each([
		['user@example.com', true],
		['user.name@domain.co.uk', true],
		['invalid', false],
		['@nodomain.com', false],
		['spaces in@email.com', false],
		['', false],
	])('validates %s as %s', (email, expected) => {
		expect(isValidEmail(email)).toBe(expected);
	});
});
```

### Testing Errors

```typescript
import { describe, test, expect } from 'vitest';
import { divide } from './math';

describe('divide', () => {
	test('divides numbers', () => {
		expect(divide(10, 2)).toBe(5);
	});

	test('throws on division by zero', () => {
		expect(() => divide(10, 0)).toThrow('Cannot divide by zero');
	});
});
```

---

## Testing Svelte Stores

### Writable Store

```typescript
import { describe, test, expect } from 'vitest';
import { get } from 'svelte/store';
import { createCartStore } from './cartStore';

describe('cartStore', () => {
	test('starts empty', () => {
		const cart = createCartStore();
		expect(get(cart).items).toEqual([]);
	});

	test('adds items', () => {
		const cart = createCartStore();
		cart.addItem({ id: '1', name: 'Product', price: 10 });

		expect(get(cart).items).toHaveLength(1);
		expect(get(cart).items[0].name).toBe('Product');
	});

	test('calculates total', () => {
		const cart = createCartStore();
		cart.addItem({ id: '1', name: 'A', price: 10 });
		cart.addItem({ id: '2', name: 'B', price: 20 });

		expect(get(cart).total).toBe(30);
	});
});
```

### Derived Store

```typescript
import { describe, test, expect } from 'vitest';
import { get } from 'svelte/store';
import { items, filteredItems, setFilter } from './itemsStore';

describe('filteredItems', () => {
	test('filters by category', () => {
		items.set([
			{ id: 1, category: 'A' },
			{ id: 2, category: 'B' },
			{ id: 3, category: 'A' },
		]);

		setFilter('A');

		expect(get(filteredItems)).toHaveLength(2);
		expect(get(filteredItems).every((i) => i.category === 'A')).toBe(true);
	});
});
```

### Svelte 5 Runes Store (use .svelte.test.ts)

```typescript
// counter.svelte.test.ts
import { describe, test, expect } from 'vitest';
import { flushSync } from 'svelte';
import { createCounter } from './counter.svelte';

describe('counter rune', () => {
	test('increments', () => {
		const counter = createCounter(0);

		counter.increment();
		flushSync();

		expect(counter.count).toBe(1);
	});

	test('derives doubled value', () => {
		const counter = createCounter(5);
		expect(counter.doubled).toBe(10);
	});
});
```

---

## Testing SvelteKit Server Code

### Load Functions

```typescript
import { describe, test, expect, vi } from 'vitest';
import { load } from './+page.server';

// Mock database
vi.mock('$lib/server/db', () => ({
	db: {
		posts: {
			findMany: vi.fn(),
		},
	},
}));

import { db } from '$lib/server/db';

describe('+page.server load', () => {
	test('returns posts for authenticated user', async () => {
		vi.mocked(db.posts.findMany).mockResolvedValue([
			{ id: 1, title: 'Post 1' },
			{ id: 2, title: 'Post 2' },
		]);

		const result = await load({
			locals: { user: { id: 'user-123' } },
			params: {},
			url: new URL('http://localhost/posts'),
		} as any);

		expect(result.posts).toHaveLength(2);
		expect(db.posts.findMany).toHaveBeenCalledWith({
			where: { authorId: 'user-123' },
		});
	});

	test('throws redirect for unauthenticated user', async () => {
		await expect(load({ locals: {}, params: {} } as any)).rejects.toEqual(
			expect.objectContaining({ status: 302, location: '/login' })
		);
	});
});
```

### Form Actions

```typescript
import { describe, test, expect, vi } from 'vitest';
import { actions } from './+page.server';

describe('create action', () => {
	test('creates item and returns success', async () => {
		const formData = new FormData();
		formData.set('title', 'New Item');
		formData.set('description', 'Description');

		const result = await actions.create({
			request: new Request('http://localhost', {
				method: 'POST',
				body: formData,
			}),
			locals: { user: { id: 'user-123' } },
		} as any);

		expect(result).toEqual({ success: true });
	});

	test('returns validation error for missing title', async () => {
		const formData = new FormData();
		formData.set('title', '');

		const result = await actions.create({
			request: new Request('http://localhost', {
				method: 'POST',
				body: formData,
			}),
			locals: { user: { id: 'user-123' } },
		} as any);

		expect(result).toEqual({
			error: true,
			message: 'Title is required',
		});
	});
});
```

### API Routes (+server.ts)

```typescript
import { describe, test, expect } from 'vitest';
import { GET, POST } from './+server';

describe('API /api/items', () => {
	test('GET returns items', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/items'),
			locals: { user: { id: 'user-123' } },
		} as any);

		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.items).toBeDefined();
	});

	test('POST creates item', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/items', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'New Item' }),
			}),
			locals: { user: { id: 'user-123' } },
		} as any);

		expect(response.status).toBe(201);
	});
});
```

---

## Mocking Strategies

### When to Mock

- External APIs and services
- Database calls
- File system operations
- Time-dependent code (dates, timers)
- Environment variables

### When NOT to Mock

- The code you're testing
- Pure utility functions
- Simple data transformations

### Mock Patterns

```typescript
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock module
vi.mock('$lib/api', () => ({
	fetchData: vi.fn(),
}));

// Mock specific function
import { fetchData } from '$lib/api';

describe('service using API', () => {
	beforeEach(() => {
		vi.mocked(fetchData).mockResolvedValue({ data: 'test' });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test('calls API and transforms data', async () => {
		const result = await myService.getData();

		expect(fetchData).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ transformed: 'test' });
	});
});
```

### Mocking Time

```typescript
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

describe('time-dependent function', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('formats relative time', () => {
		expect(formatRelativeTime(new Date('2024-01-15T09:00:00Z'))).toBe('1 hour ago');
	});
});
```

---

## Code Coverage

### Meaningful Coverage Targets

```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    // Global minimums
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    // Critical paths - higher standards
    'src/lib/auth/**': {
      branches: 85,
      functions: 85,
      lines: 85,
    },
    'src/lib/payments/**': {
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
}
```

### What Coverage Tells You

- **Line coverage**: Which lines executed (least useful alone)
- **Branch coverage**: Which conditionals tested (most useful)
- **Function coverage**: Which functions called

### What Coverage DOESN'T Tell You

- Whether assertions are meaningful
- Edge cases you haven't thought of
- Integration between units
- Real-world usage patterns

### Running Coverage

```bash
# Generate coverage report
pnpm vitest run --coverage

# Watch mode with coverage
pnpm vitest --coverage
```

---

## Test Organization

### File Naming

```
utility.ts         → utility.test.ts
store.svelte.ts    → store.svelte.test.ts (for runes)
+page.server.ts    → +page.server.test.ts
```

### Test Structure (AAA Pattern)

```typescript
test('descriptive name of behavior', () => {
	// Arrange - set up test data and conditions
	const input = { name: 'test', value: 42 };

	// Act - execute the code under test
	const result = processInput(input);

	// Assert - verify the outcome
	expect(result.processed).toBe(true);
	expect(result.output).toBe('TEST-42');
});
```

### Describe Blocks

```typescript
describe('UserService', () => {
	describe('createUser', () => {
		test('creates user with valid data', () => {
			/* ... */
		});
		test('throws on duplicate email', () => {
			/* ... */
		});
		test('hashes password before saving', () => {
			/* ... */
		});
	});

	describe('deleteUser', () => {
		test('removes user from database', () => {
			/* ... */
		});
		test('throws if user not found', () => {
			/* ... */
		});
	});
});
```

### Shared Setup

```typescript
describe('CartStore', () => {
	let cart: ReturnType<typeof createCartStore>;

	beforeEach(() => {
		cart = createCartStore();
		// Add common test items
		cart.addItem({ id: '1', name: 'Item', price: 10 });
	});

	test('calculates subtotal', () => {
		expect(get(cart).subtotal).toBe(10);
	});

	// More tests using the pre-populated cart...
});
```
