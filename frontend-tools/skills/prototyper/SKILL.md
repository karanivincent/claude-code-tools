---
name: prototyper
description: |
  Generate working prototypes using any project's real components, design tokens, and app layout.
  Framework-aware: supports Next.js and SvelteKit with auto-detection.
  Two modes: Creative (default, unrestricted design) and Constrained (uses project's real components).
  Use when:
  - User wants to prototype a feature or page
  - User says "prototype", "build a prototype", "create a prototype", "mock up"
  - User wants to explore a UI idea quickly
  - User pastes a screenshot or Figma URL and wants it built
  - User wants to modify an existing page to try something new
---

# Prototyper

Generate working prototypes that are immediately previewable in the browser. Supports any project with auto-detection of framework, components, and design tokens.

## Quick Start

1. Detect project setup (config or auto-detect)
2. Ensure dev server is running
3. Run first-time setup if needed
4. Determine prototype mode (creative / constrained) and page mode (new / modify / visual)
5. Generate files immediately — no confirmation step
6. Tell user the preview URL

## Step 1: Detect Project Setup

**Check CLAUDE.md for a `## Prototyper` section first.** If present, use its values:

```markdown
## Prototyper

- **Framework:** next (or sveltekit)
- **Component library:** shadcn/ui at src/components/ui/
- **Design tokens:** tailwind.config.ts
- **Icons:** lucide-react
- **Output directory:** src/app/(prototypes)/exp/
- **Dev URL:** http://localhost:3000
- **Default mode:** creative (or constrained)
```

**If no config, auto-detect:**

1. **Framework** — Read root `package.json`:
   - `next` in dependencies → Next.js (read `references/nextjs.md`)
   - `@sveltejs/kit` in dependencies → SvelteKit (read `references/sveltekit.md`)
   - Neither → ask the user
2. **UI components** — Scan file system:
   - `src/components/ui/` with `button.tsx` → shadcn/ui
   - `packages/ui/src/index.ts` → monorepo UI package (read exports)
   - Check `package.json` for `@radix-ui`, `@melt-ui`, `bits-ui`
   - Nothing found → creative mode only
3. **Design tokens** — Read `tailwind.config.ts` or `tailwind.config.js`, extract custom colors, radius, fonts. Fall back to default Tailwind palette.
4. **Icons** — Check `package.json`:
   - `lucide-react` → `import { Icon } from 'lucide-react'`
   - `unplugin-icons` → `import Icon from '~icons/tabler/{name}'`
   - Nothing → inline SVGs or emoji in creative mode
5. **Dev URL** — Next.js: `http://localhost:3000`, SvelteKit: `http://localhost:5173`

## Step 2: Ensure Dev Server

Ping the dev URL. If no response:

1. Start the dev server in background: `pnpm dev` (or project's dev command)
2. Wait for it to be ready (poll until responsive, max 30s)
3. If still not ready, tell user to start it manually

## Step 3: First-Time Setup

On first prototype run per project, create the scaffolding. Only do this once.

1. **Output directory** — Create if it doesn't exist
2. **Gitignore** — Add output directory to `.gitignore` if not already there
3. **Environment utility** — If no `isProduction()` / `isDevelopment()` helper exists in the project, create one:
   ```typescript
   // Place at project's lib path (e.g., src/lib/env.ts or src/lib/utils/env.ts)
   export const isProduction = () => process.env.NODE_ENV === 'production';
   export const isDevelopment = () => process.env.NODE_ENV === 'development';
   export const isPrototypeEnabled = () => !isProduction();
   ```
   Search for existing env utilities first (`Grep` for `isProduction`, `NODE_ENV === 'production'` in lib/utils). Use the existing one if found.
4. **Auth bypass** — Framework-specific, see reference files
5. **Prototype layout** — Framework-specific, see reference files. Must:
   - Call `isPrototypeEnabled()` and show 404/notFound in production
   - Render a floating "PROTOTYPE" badge
   - Skip any auth middleware/guards

## Step 4: Determine Mode

### Prototype Mode

- **Creative (default)** — Build the best-looking prototype possible. Use project's design tokens (colors, fonts, spacing) for brand consistency but NOT limited to existing components. Can use any Tailwind patterns, custom layouts, animations, inline SVGs.
- **Constrained** — Only use the project's real UI component library. Follows project code conventions strictly. Closer to production-ready code.

**Triggers for constrained:** user says "use our components", "production-ready", "use existing components", "with real components". CLAUDE.md config can set `Default mode: constrained`.

**Switching:** User can say "rebuild with our real components" mid-iteration to switch.

### Page Mode

- **References an existing page** → **Modify** — Copy and modify
- **Includes an image or Figma URL** → **Visual** — Translate to code
- **Everything else** → **New** — Create from scratch

## Step 5: Generate Prototype

Read the framework-specific reference file for exact file structure and code patterns:
- Next.js → `references/nextjs.md`
- SvelteKit → `references/sveltekit.md`

### Common Rules (All Frameworks)

**Styling:**
- TailwindCSS utility classes only — never write `<style>` blocks
- Use project design tokens from Tailwind config (not raw hex values)
- In creative mode: any Tailwind classes are fair game

**Mock data:**
- Create typed mock data in a separate `mock-data.ts` file
- Use real interfaces from the project where they exist
- For new concepts, define interfaces in `mock-data.ts`
- Make data realistic (real names, plausible dates, sensible values)

**TypeScript:**
- Use `interface` for object shapes, never `type`
- Strict types for all props and data

## Step 6: Preview URL

After generating:

```
Prototype generated! Preview at:
{devUrl}/exp/{name}
```

If iterating: "Updated — refresh your browser."

## Iteration

- Edit existing files in place — don't create new folders for iterations
- HMR/fast refresh picks up changes automatically
- User says "rebuild with our real components" → switch to constrained mode, regenerate

## Listing Prototypes

"Show my prototypes" → list folders in the output directory with names.

## Important Notes

- Output directory is gitignored — prototypes never reach production
- Prototype layout disables itself in production via `isPrototypeEnabled()`
- Never modify production code — only write to the output directory (except first-time setup files)
- Dev server must be running for preview
