---
name: yond-prototyper
description: |
  Generate working SvelteKit prototypes using the project's real components, design tokens, and app layout.
  Use when:
  - User wants to prototype a feature or page
  - User says "prototype", "build a prototype", "create a prototype", "mock up"
  - User wants to explore a UI idea quickly
  - User pastes a screenshot or Figma URL and wants it built for the app
  - User wants to modify an existing page to try something new
---

# Yond Prototyper

Generate working SvelteKit prototypes using the real `@yond/ui` components, design tokens, and app layout. Prototypes are immediately previewable in the browser.

## Quick Start

1. Look up what you need from the codebase map below
2. Determine mode (new / modify / visual)
3. Generate files immediately - no confirmation step
4. Tell user the preview URL

## Codebase Map

Read source files on demand — only what you need for the current prototype.

| What | Where | How to use |
|------|-------|------------|
| **Available components** | `packages/ui/src/index.ts` | Scan exports for component names; import from `@yond/ui` |
| **Component variants** | Each component's `.svelte` source in `packages/ui/src/` | Read the file and look for `tv()` or `cva()` calls to find variant options |
| **Design tokens (colors, radius)** | `packages/ui/tailwind.config.ts` | Read `colors` and `borderRadius` sections |
| **API types (for mock data)** | `apps/selfservice/src/lib/generated/api.ts` | Search for relevant interfaces when creating typed mock data |
| **App layout** | `apps/selfservice/src/routes/+layout.svelte` | Reference for app shell structure |
| **Output directory** | `apps/selfservice/src/routes/exp/prototypes/generated/` | Where all generated prototypes go |

**Lookup strategy**: For a typical prototype, read `packages/ui/src/index.ts` to see available components. If you need variant details for a specific component (e.g., Button sizes), read that component's source file. Only read tokens/API types when the prototype requires them.

## Step 2: Determine Mode

Based on the user's request:

- **References an existing page** (e.g., "take the home page and add...") → **Mode: Modify**
- **Includes an image or Figma URL** → **Mode: Visual Reference**
- **Everything else** → **Mode: New Page**

## Step 3: Generate Prototype

### Mode: New Page

1. Pick a kebab-case name for the prototype (e.g., `member-referral`)
2. Create these files:

```
apps/selfservice/src/routes/exp/prototypes/generated/{name}/
├── +page.svelte       # The prototype UI
├── +page.ts           # Load function returning mock data
└── mock-data.ts       # Typed fake data
```

### Mode: Modify Existing Page

1. Read the source of the existing page the user references
2. Pick a descriptive name (e.g., `home-with-quick-book`)
3. Create a copy in the generated folder with the requested modifications
4. Preserve the original page's patterns and style

### Mode: Visual Reference

1. If Figma URL: use Figma MCP (`get_design_context`) to extract the design
2. If pasted image: analyze the visual and map elements to `@yond/ui` components
3. Translate visual colors to project design tokens (never use raw hex)
4. Generate the page using project conventions

## Code Rules (MUST follow)

### Components
- Import ALL UI components from `@yond/ui`:
  ```svelte
  <script lang="ts">
    import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@yond/ui';
  </script>
  ```
- Import icons from `~icons/tabler/{name}`:
  ```svelte
  <script lang="ts">
    import IconHeart from '~icons/tabler/heart';
    import IconShare from '~icons/tabler/share';
  </script>
  ```
- Use `cn()` from `@yond/ui` for conditional class merging

### Styling
- **TailwindCSS utility classes ONLY** - never write `<style>` blocks
- Use project color tokens: `bg-primary`, `text-muted-foreground`, `border-border`, etc.
- Use project radius tokens: `rounded-lg`, `rounded-md`, `rounded-sm`

### Svelte 5 Runes
```svelte
<script lang="ts">
  // CORRECT: Svelte 5 runes
  let { data } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```
Never use legacy syntax (`export let`, `$:`, `$store`).

### TypeScript
- Use `interface` for object shapes, never `type`
- Import real API types from `$lib/generated/api` for mock data shapes

### Mock Data
- Create typed mock data in `mock-data.ts`
- Import real interfaces from the generated API types where they exist
- For new concepts without existing types, define interfaces in mock-data.ts
- Make data realistic (real names, plausible dates, sensible values)

Example `mock-data.ts`:
```typescript
import type { CustomerCalendarEventInListWithBookingIndicator } from '$lib/generated/api';

export const mockAppointments: CustomerCalendarEventInListWithBookingIndicator[] = [
  {
    oid: 'evt-001',
    name: 'Yoga Flow',
    start_ts: '2026-03-15T10:00:00',
    end_ts: '2026-03-15T11:00:00',
    // ... realistic fields
  }
];
```

Example `+page.ts`:
```typescript
import { mockAppointments } from './mock-data';

export function load() {
  return {
    appointments: mockAppointments
  };
}
```

## Step 4: Tell User the Preview URL

After generating files:

```
Prototype generated! Preview it at:
http://localhost:5173/exp/prototypes/generated/{name}
```

If iterating on an existing prototype, just say "Updated - refresh your browser."

## Iteration

When the user asks to modify the prototype:
- Edit the existing generated files in place
- Don't create a new prototype folder for iterations
- Vite HMR will pick up changes automatically

## Important Notes

- Prototypes live in `apps/selfservice/src/routes/exp/prototypes/generated/` which is gitignored
- A shared layout adds the app shell (nav, header) and a "PROTOTYPE" badge
- The user must be logged in to the app for the shell to render correctly
- The dev server must be running (`pnpm dev`)
- Never modify production code - only write to the generated folder
