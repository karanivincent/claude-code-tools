# Component Testing Patterns (@testing-library/svelte)

## Table of Contents

1. [What to Test in Components](#what-to-test-in-components)
2. [Query Priority](#query-priority)
3. [Testing Svelte 5 Components](#testing-svelte-5-components)
4. [User Interactions](#user-interactions)
5. [Testing Props and Events](#testing-props-and-events)
6. [Accessibility Testing](#accessibility-testing)
7. [Async Operations](#async-operations)
8. [Mocking Dependencies](#mocking-dependencies)

---

## What to Test in Components

### DO Test

- User-visible output based on props
- User interactions (clicks, typing, selections)
- Conditional rendering ("show X when Y")
- Event emissions to parent
- Accessibility (roles, labels, focus management)
- Error states and loading states

### DO NOT Test

- Internal state variables directly
- Implementation details (which function was called)
- Svelte internals / reactivity mechanics
- Styles (unless functional, like visibility)
- Things that should be E2E (multi-component flows)

### Decision Rule

Test from the user's perspective: "What does the user see and do?" not "How does the code work internally?"

---

## Query Priority

Always use the most accessible query available:

```typescript
// 1. ✅ BEST: Accessible to everyone (screen readers, users)
screen.getByRole('button', { name: 'Submit' });
screen.getByRole('textbox', { name: 'Email' });
screen.getByRole('checkbox', { name: 'Accept terms' });
screen.getByRole('combobox', { name: 'Country' });

// 2. ✅ GOOD: Semantic HTML associations
screen.getByLabelText('Email address');
screen.getByPlaceholderText('Search...');
screen.getByAltText('Company logo');

// 3. ⚠️ OKAY: Text content (less stable)
screen.getByText('Welcome back');
screen.getByDisplayValue('current input value');

// 4. ❌ LAST RESORT: Test IDs (not user-facing)
screen.getByTestId('submit-button');
```

### Finding the Right Role

```typescript
// Use logRoles to discover available roles
import { logRoles } from '@testing-library/dom';

const { container } = render(MyComponent);
logRoles(container);
```

### Common Role Mappings

| Element                   | Role         |
| ------------------------- | ------------ |
| `<button>`                | `button`     |
| `<a href>`                | `link`       |
| `<input type="text">`     | `textbox`    |
| `<input type="checkbox">` | `checkbox`   |
| `<select>`                | `combobox`   |
| `<ul>`, `<ol>`            | `list`       |
| `<li>`                    | `listitem`   |
| `<table>`                 | `table`      |
| `<dialog>`                | `dialog`     |
| `<nav>`                   | `navigation` |
| `<header>`                | `banner`     |
| `<main>`                  | `main`       |

---

## Testing Svelte 5 Components

### Basic Component Test

```typescript
import { render, screen } from '@testing-library/svelte';
import Button from './Button.svelte';

test('renders with label', () => {
	render(Button, { props: { label: 'Click me' } });
	expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
});
```

### Testing Runes ($state, $derived)

Files with runes MUST use `.svelte.test.ts` extension:

```typescript
// counter.svelte.ts
export function createCounter(initial = 0) {
	let count = $state(initial);
	const doubled = $derived(count * 2);

	return {
		get count() {
			return count;
		},
		get doubled() {
			return doubled;
		},
		increment: () => {
			count++;
		},
	};
}
```

```typescript
// counter.svelte.test.ts (note the .svelte in filename)
import { flushSync } from 'svelte';
import { createCounter } from './counter.svelte';

test('increments and derives correctly', () => {
	const counter = createCounter(0);

	expect(counter.count).toBe(0);
	expect(counter.doubled).toBe(0);

	counter.increment();
	flushSync(); // Required to flush reactive updates

	expect(counter.count).toBe(1);
	expect(counter.doubled).toBe(2);
});
```

### Testing $effect

Use `$effect.root()` for cleanup:

```typescript
import { flushSync } from 'svelte';

test('effect runs on state change', () => {
	const logs: number[] = [];

	const cleanup = $effect.root(() => {
		let count = $state(0);

		$effect(() => {
			logs.push(count);
		});

		count = 1;
		flushSync();
		count = 2;
		flushSync();
	});

	cleanup();
	expect(logs).toEqual([0, 1, 2]);
});
```

---

## User Interactions

### Always Use userEvent Over fireEvent

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

test('handles user input', async () => {
	const user = userEvent.setup();
	render(SearchBox);

	const input = screen.getByRole('textbox', { name: 'Search' });
	await user.type(input, 'hello');

	expect(input).toHaveValue('hello');
});
```

### Common Interactions

```typescript
const user = userEvent.setup();

// Clicking
await user.click(button);
await user.dblClick(element);

// Typing
await user.type(input, 'text');
await user.clear(input);

// Keyboard
await user.keyboard('{Enter}');
await user.tab();

// Selection
await user.selectOptions(select, 'option-value');
await user.selectOptions(select, ['value1', 'value2']); // multi-select

// Checkboxes/Radio
await user.click(checkbox); // toggles
```

### Testing Keyboard Navigation

```typescript
test('supports keyboard navigation', async () => {
	const user = userEvent.setup();
	render(Menu);

	await user.tab();
	expect(screen.getByRole('menuitem', { name: 'Home' })).toHaveFocus();

	await user.keyboard('{ArrowDown}');
	expect(screen.getByRole('menuitem', { name: 'About' })).toHaveFocus();
});
```

---

## Testing Props and Events

### Props

```typescript
import { render, screen, rerender } from '@testing-library/svelte';

test('updates when props change', async () => {
	const { rerender } = render(Badge, { props: { count: 5 } });
	expect(screen.getByText('5')).toBeInTheDocument();

	await rerender({ count: 10 });
	expect(screen.getByText('10')).toBeInTheDocument();
});
```

### Events (Component Dispatch)

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

test('dispatches select event', async () => {
	const user = userEvent.setup();
	const handleSelect = vi.fn();

	render(Dropdown, {
		props: { options: ['a', 'b', 'c'] },
		events: { select: handleSelect },
	});

	await user.click(screen.getByRole('combobox'));
	await user.click(screen.getByRole('option', { name: 'b' }));

	expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ detail: 'b' }));
});
```

### Testing Slots

```typescript
import { render, screen } from '@testing-library/svelte';
import Card from './Card.svelte';

// Create a test wrapper component or use html option
test('renders slot content', () => {
	render(Card, {
		props: { title: 'My Card' },
		slots: { default: '<p>Card content</p>' },
	});

	expect(screen.getByText('Card content')).toBeInTheDocument();
});
```

---

## Accessibility Testing

### vitest-axe Integration

```typescript
// vitest-setup.ts
import 'vitest-axe/extend-expect';

// Component test
import { axe } from 'vitest-axe';
import { render } from '@testing-library/svelte';

test('has no accessibility violations', async () => {
	const { container } = render(LoginForm);
	const results = await axe(container);
	expect(results).toHaveNoViolations();
});
```

### Focus Management

```typescript
test('focuses input on mount', () => {
	render(SearchBox, { props: { autofocus: true } });
	expect(screen.getByRole('textbox')).toHaveFocus();
});

test('traps focus in modal', async () => {
	const user = userEvent.setup();
	render(Modal, { props: { open: true } });

	const closeButton = screen.getByRole('button', { name: 'Close' });
	const confirmButton = screen.getByRole('button', { name: 'Confirm' });

	closeButton.focus();
	await user.tab();
	expect(confirmButton).toHaveFocus();

	await user.tab();
	expect(closeButton).toHaveFocus(); // Wraps around
});
```

---

## Async Operations

### Waiting for Elements

```typescript
import { render, screen, waitFor } from '@testing-library/svelte';

test('shows data after loading', async () => {
	render(DataList);

	// Wait for loading to finish
	await waitFor(() => {
		expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
	});

	// Or wait for specific element
	expect(await screen.findByText('Data loaded')).toBeInTheDocument();
});
```

### findBy vs getBy vs queryBy

```typescript
// getBy - Throws if not found (use for elements that should exist)
screen.getByRole('button'); // Throws immediately if missing

// queryBy - Returns null if not found (use for asserting absence)
expect(screen.queryByText('Error')).not.toBeInTheDocument();

// findBy - Waits and retries (use for async elements)
await screen.findByText('Loaded'); // Waits up to 1000ms by default
```

---

## Mocking Dependencies

### Mocking Modules

```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('$lib/api', () => ({
	fetchUsers: vi.fn().mockResolvedValue([{ id: 1, name: 'John' }]),
}));

// Mock specific export
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
}));
```

### Mocking Stores

```typescript
import { vi } from 'vitest';
import { writable } from 'svelte/store';

vi.mock('$lib/stores/user', () => ({
	user: writable({ name: 'Test User', role: 'admin' }),
}));
```

### Mocking Fetch (with MSW)

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
	http.get('/api/users', () => {
		return HttpResponse.json([
			{ id: 1, name: 'John' },
			{ id: 2, name: 'Jane' },
		]);
	}),
];
```

```typescript
// vitest-setup.ts
import { setupServer } from 'msw/node';
import { handlers } from './src/mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```
