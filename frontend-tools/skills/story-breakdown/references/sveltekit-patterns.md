# SvelteKit Patterns (Yond Selfservice)

## Project Structure

```
apps/selfservice/src/
├── routes/                  # SvelteKit pages
│   ├── appointments/        # Appointment booking & details
│   ├── classes/             # Class overview & details
│   ├── profile/             # User profile
│   ├── login/               # Authentication
│   └── exp/                 # Experimental (do NOT reference)
├── lib/
│   ├── components/          # App-specific components
│   │   ├── atoms/           # Basic UI elements
│   │   ├── molecules/       # Composed components
│   │   └── organisms/       # Complex components
│   ├── api/
│   │   ├── services/        # TanStack Query wrappers
│   │   └── apiUtils.ts      # createGetQuery, createMutation helpers
│   ├── stores/              # Svelte 5 runes stores (.svelte.ts)
│   ├── config/              # Tenant configuration
│   ├── utils/               # API, date, environment, native utils
│   └── generated/api.ts     # Auto-generated API client + types
├── paraglide/messages.js    # i18n (auto-generated, gitignored)
└── e2e/                     # Playwright E2E tests
packages/ui/                 # @yond/ui shared components
├── src/shadcn/              # Button, Input, Badge, Label, etc.
├── src/mobile/              # BottomNav
└── src/basic/, src/pages/   # Reserved for future
```

## Component Patterns

### Imports

```typescript
import { Button, Input, Badge, Avatar, Label } from '@yond/ui';
```

No Y- prefix form components. No Meltui wrappers. Use `@yond/ui` shadcn components directly.

### Custom Components

App-specific components live in `src/lib/components/` using atomic design (atoms, molecules, organisms). Shared/reusable components go in `packages/ui/`.

## Reactivity — Svelte 5 Runes

```svelte
<script lang="ts">
  // Props
  let { variant = 'primary', onClick } = $props();

  // State
  let count = $state(0);

  // Derived
  let doubled = $derived(count * 2);
</script>
```

**Never use:** `export let`, `$:`, `$$props`, `$$restProps`, `on:click`

## API Patterns — TanStack Query v6

```typescript
// Query (GET)
const query = createGetQuery(apiClient.endpoint, 'cache-key');
// Access: query.data, query.isLoading, query.error

// Mutation (POST/PUT/DELETE)
const mutation = createMutation(apiClient.endpoint, {
  onSuccess: () => queryClient.invalidateQueries(['cache-key'])
});
// Access: mutation.mutate({...}), mutation.isPending
```

**Never use `$` prefix** on queries/mutations — they are runes, not stores. `$query.data` causes `store_invalid_shape` runtime errors.

## State Management

| Scope | Solution |
|-------|----------|
| Local | `$state()` runes |
| Shared | Svelte 5 runes stores (`.svelte.ts` files) |
| Server | TanStack Query cache |
| Form | Direct state management (no sveltekit-superforms) |

## Styling — TailwindCSS Only

```svelte
<div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
  <button class={cn("rounded-md px-4 py-2", variant === 'primary' && "bg-primary text-white")}>
    Click
  </button>
</div>
```

- Use `cn()` helper from `@yond/ui` for conditional class merging
- Use `cva()` for component variants
- **Never write `<style>` blocks**

## Types

- `interface` for all object shapes (enforced by ESLint)
- `type` only for unions, primitives, tuples, function signatures, mapped/conditional types

## i18n — Paraglide.js

```svelte
<script>
  import { m } from '../../paraglide/messages.js';
</script>

<span>{m.greeting({ username: 'John' })}</span>
```

Import `m` using relative path from the file to `src/paraglide/messages.js`.

## Testing

### E2E (Playwright)

```typescript
test('should [action]', async ({ page }) => {
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'Book' }).click();
  await expect(page.getByText('Confirmed')).toBeVisible();
});
```

### Preferred Locators

1. `getByRole` — semantic, accessible
2. `getByLabel` — form fields
3. `getByTestId` — complex components
4. `getByText` — visible content

### Unit Tests (Vitest)

Located alongside components or in `__tests__/` directories.
