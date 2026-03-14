# SvelteKit Prototyper Reference

## Output Structure

```
src/routes/exp/prototypes/generated/{name}/
├── +page.svelte      # The prototype UI
├── +page.ts          # Load function returning mock data
└── mock-data.ts      # Typed mock data
```

## First-Time Setup

### Shared Layout

Create `src/routes/exp/prototypes/generated/+layout.svelte`:

```svelte
<script lang="ts">
  import { isPrototypeEnabled } from '$lib/env'; // or wherever the util lives
  import { error } from '@sveltejs/kit';

  let { children } = $props();

  if (!isPrototypeEnabled()) {
    error(404, 'Not found');
  }
</script>

<div class="min-h-screen">
  <div class="fixed top-2 right-2 z-50 rounded bg-amber-500 px-2 py-1 text-xs font-bold text-white shadow-lg">
    PROTOTYPE
  </div>
  {@render children()}
</div>
```

### Auth Bypass Layout

Create `src/routes/exp/prototypes/generated/+layout.ts`:

```typescript
// Skip any auth checks for prototype routes
export const ssr = false;
```

If the project uses auth hooks (`hooks.server.ts`), add the prototype path to the exclusion list. Search for `handle` function and add:

```typescript
if (event.url.pathname.startsWith('/exp/prototypes')) {
  return resolve(event);
}
```

### Output Directory

Default: `src/routes/exp/prototypes/generated/`

### Gitignore

Add to `.gitignore`:
```
src/routes/exp/prototypes/generated/*/
```

## File Templates

### +page.svelte

```svelte
<script lang="ts">
  // Svelte 5 runes ONLY — never use legacy syntax
  let { data } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);

  // In constrained mode: import real components
  // import { Button, Card } from '@yond/ui'; // or project's UI package

  // In creative mode: use any HTML + Tailwind
</script>

<div class="min-h-screen bg-background">
  <!-- Prototype content -->
</div>
```

### +page.ts

```typescript
import { mockData } from './mock-data';

export function load() {
  return {
    items: mockData
  };
}
```

### mock-data.ts

```typescript
// Import real types if they exist in the project
// import type { SomeType } from '$lib/generated/api';

export interface MockItem {
  id: string;
  name: string;
  // ... fields
}

export const mockData: MockItem[] = [
  {
    id: '1',
    name: 'Example',
  },
];
```

## Code Conventions

### Svelte 5 Runes (MUST use)
```svelte
<script lang="ts">
  let { data } = $props();       // props
  let count = $state(0);          // reactive state
  let doubled = $derived(count * 2); // computed
</script>
```

**Never use legacy syntax:** `export let`, `$:`, `$store`

### Components (Constrained Mode)
- Import from project's UI package: `import { Button, Card } from '@yond/ui'` (or wherever)
- Read component source files for `tv()` or `cva()` calls to find variant options
- Use `cn()` from the UI package for conditional class merging

### Components (Creative Mode)
- Build with raw HTML + Tailwind classes
- Use project's design tokens for colors
- Inline SVGs for icons when icon library not available

### Icons
- `unplugin-icons`: `import IconHeart from '~icons/tabler/heart'`
- If no icon library: use emoji or inline SVG

### Styling
- TailwindCSS utility classes ONLY — never write `<style>` blocks
- Use project color tokens: `bg-primary`, `text-muted-foreground`, `border-border`
- Use project radius tokens: `rounded-lg`, `rounded-md`, `rounded-sm`

## Dev Server

- URL: `http://localhost:5173` (default)
- Start: `pnpm dev`
- HMR: Vite HMR picks up changes automatically
- Preview path: `/exp/prototypes/generated/{prototype-name}`
