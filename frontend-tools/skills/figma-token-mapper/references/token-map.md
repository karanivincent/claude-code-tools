# Yond Token Mapping Reference

## Source Files

All token definitions live in `packages/ui/src/`. Grep these to verify a token exists:

| File | Tokens | Grep Pattern |
|---|---|---|
| `styles.css` | CSS variables + `@theme inline` color aliases | `--surface-\|--text-\|--border-\|--action-\|--comp-\|--msg-\|--color-` |
| `typography.css` | `yond-text-*` utilities | `@utility yond-text-` |
| `shadows.css` | `yond-shadow-*` utilities | `@utility yond-shadow-` |
| `strokes.css` | `yond-stroke-*` utilities | `@utility yond-stroke-` |
| `glass.css` | `yond-glass-*` utilities | `@utility yond-glass-` |

## Typography

**Pattern:** Figma `Yond-CSS/{SIZE}-{px}/{WEIGHT}` -> `yond-text-{size}-{weight}`

**Size mapping:**

| Figma | Utility | px |
|---|---|---|
| XXS-10 | xxs | 10px |
| XS-12 | xs | 12px |
| S-14 | s | 14px |
| M-16 | m | 16px |
| L-18 | l | 18px |
| XL-20 | xl | 20px |
| 2XL-24 | 2xl | 24px |
| 3XL-32 | 3xl | 32px |
| 4XL-36 | 4xl | 36px |
| 5XL-48 | 5xl | 48px |
| 6XL-64 | 6xl | 64px |
| 7XL-72 | 7xl | 72px |
| 8XL-96 | 8xl | 96px |
| 9XL-124 | 9xl | 124px |

**Weight mapping:**

| Figma | Utility | CSS |
|---|---|---|
| Thin | thin | 100 |
| ExtraLight | extralight | 200 |
| Light | light | 300 |
| Regular | regular | 400 |
| Medium | medium | 500 |
| SemiBold | semibold | 600 |
| Bold | bold | 700 |
| ExtraBold | extrabold | 800 |
| Black | black | 900 |

**Examples:**
- `Yond-CSS/M-16/Medium` -> `yond-text-m-medium`
- `Yond-CSS/S-14/SemiBold` -> `yond-text-s-semibold`
- `Yond-CSS/XL-20/Bold` -> `yond-text-xl-bold`

## Colors

Colors flow through three layers: Figma variable -> CSS variable -> Tailwind `@theme inline` alias -> utility class.

### Surface tokens

Figma `--Surface/{name}` -> CSS `--surface-bg-{name}` -> Tailwind `bg-surface-{name}`

| Figma Variable | CSS Variable | Tailwind Class |
|---|---|---|
| `--Surface/bg-app` | `--surface-bg-app` | `bg-surface-app` |
| `--Surface/bg-card` | `--surface-bg-card` | `bg-surface-card` |
| `--Surface/bg-disabled` | `--surface-bg-disabled` | `bg-surface-disabled` |
| `--Surface/bg-highlight` | `--surface-bg-highlight` | `bg-surface-highlight` |
| `--Surface/bg-neutral` | `--surface-bg-neutral` | `bg-surface-neutral` |
| `--Surface/bg-overlay` | `--surface-bg-overlay` | `bg-surface-overlay` |
| `--Surface/bg-subtle` | `--surface-bg-subtle` | `bg-surface-subtle` |

### Text - neutral tokens

Figma `--text/neutral/{name}` -> CSS `--text-neutral-{name}` -> Tailwind `text-neutral-{name}`

| Figma Variable | Tailwind Class |
|---|---|
| `--text/neutral/text-neutral-bold` | `text-neutral-bold` |
| `--text/neutral/text-neutral-main` | `text-neutral-main` |
| `--text/neutral/text-neutral-muted` | `text-neutral-muted` |
| `--text/neutral/text-neutral-dimmed` | `text-neutral-dimmed` |
| `--text/neutral/text-neutral-light` | `text-neutral-light` |
| `--text/neutral/text-neutral-extra-light` | `text-neutral-extra-light` |
| `--text/on-accent` | `text-on-accent` |

### Text - toned tokens

Figma `--text/toned/{name}` -> CSS `--text-toned-{name}` -> Tailwind `text-toned-{name}`

| Figma Variable | Tailwind Class |
|---|---|
| `--text/toned/text-accent-bold` | `text-toned-accent-bold` |
| `--text/toned/text-accent-mid` | `text-toned-accent-mid` |
| `--text/toned/text-toned-light` | `text-toned-light` |
| `--text/toned/text-toned-extra-light` | `text-toned-extra-light` |

### Action tokens

Figma `--Action/{name}` -> CSS `--action-{name}` -> Tailwind `{prefix}-action-{shortname}`

| Figma Variable | Tailwind Class (bg) | Tailwind Class (text) |
|---|---|---|
| `--Action/brand-background` | `bg-action-bg` | `text-action-bg` |
| `--Action/brand-fill` | `bg-action-fill` | `text-action-fill` |
| `--Action/brand-placeholder` | `bg-action-placeholder` | `text-action-placeholder` |
| `--Action/brand-stroke` | `bg-action-stroke` | `text-action-stroke` |
| `--Action/status-success` | `bg-action-success` | `text-action-success` |

### Border tokens

Figma `--Border/{name}` -> CSS `--border-stroke-{name}` -> Tailwind `border-stroke-{name}` or `text-stroke-{name}`

| Figma Variable | Border Class | Text/Icon Class |
|---|---|---|
| `--Border/stroke-action` | `border-stroke-action` | `text-stroke-action` |
| `--Border/stroke-dot` | `border-stroke-dot` | `text-stroke-dot` |
| `--Border/stroke-focus` | `border-stroke-focus` | `text-stroke-focus` |
| `--Border/stroke-indicator` | `border-stroke-indicator` | `text-stroke-indicator` |
| `--Border/stroke-static` | `border-stroke-static` | `text-stroke-static` |
| `--Border/stroke-subtle` | `border-stroke-subtle` | `text-stroke-subtle` |
| `--Border/stroke-light` | `border-stroke-light` | `text-stroke-light` |

### Component tokens

Figma `--Component/{name}` -> CSS `--comp-{name}` -> Tailwind `{prefix}-comp-{name}`

Available: `comp-avatar-stroke`, `comp-button-ghost-fill`, `comp-button-outline-fill`, `comp-handle`, `comp-tag-text`, `comp-toggle-thumb`, `comp-toggle-track`

### Message tokens

Figma `--Message/{name}` -> Tailwind `bg-msg-{name}` or `text-msg-{name}`

Available: `msg-error-bg`, `msg-error-text`, `msg-neutral-bg`, `msg-neutral-text`, `msg-success-bg`, `msg-success-text`

### shadcn bridge tokens

These map Figma tokens to shadcn component conventions:

| Purpose | Tailwind Class |
|---|---|
| Page background | `bg-background` |
| Default text | `text-foreground` |
| Card background | `bg-card` |
| Card text | `text-card-foreground` |
| Primary action | `bg-primary` / `text-primary` |
| Primary text on accent | `text-primary-foreground` |
| Muted background | `bg-muted` |
| Muted text | `text-muted-foreground` |
| Destructive | `text-destructive` |
| Default border | `border-border` |
| Input border | `border-input` |
| Focus ring | `ring-ring` |

### Card display tokens

For card content styling:

| Tailwind Class | Usage |
|---|---|
| `text-general-title` | Page/section titles |
| `text-card-displayTitle` | Card titles |
| `text-card-displayText` | Card body text |
| `text-card-displayLink` | Card links |
| `text-card-displayIcon` | Card icons |
| `text-card-displayTagText` | Tag text in cards |
| `bg-card-displayTagBackground` | Tag background |
| `bg-card-displayBackground` | Card subtle background |

## Shadows

**Pattern:** Figma `Shadow/{Name}` -> `yond-shadow-{name}`

| Figma | Utility | Effect |
|---|---|---|
| `Shadow/Section` | `yond-shadow-section` | 0 0 10px 0 black/7% |
| `Shadow/Card` | `yond-shadow-card` | 0 1px 5px 0 black/5% |
| `Shadow/Calendar` | `yond-shadow-calendar` | 0 2px 4px 0 black/3% |
| `Shadow/Button` | `yond-shadow-button` | 0 1px 3px 0 black/7% |
| `Shadow/Button Dark` | `yond-shadow-button-dark` | 0 1px 3px 0 gray/7% |

## Strokes

**Pattern:** Figma `Stroke/{Name}` -> `yond-stroke-{name}` (always combine with `border` class)

| Figma | Utility | Usage |
|---|---|---|
| `Stroke/Section` | `border yond-stroke-section` | Uses `--border-stroke-static` |
| `Stroke/Card` | `border yond-stroke-card` | Uses `--border-stroke-indicator` |

## Glass

**Pattern:** Figma glass/frost effect -> `yond-glass-{name}`

| Figma | Utility | Usage |
|---|---|---|
| Glass Button | `yond-glass-button` | Buttons, inputs, search fields. Includes bg, border, shadow, backdrop-filter. Has built-in `:focus-within` state. |
| Glass Menu | `yond-glass-menu` | Action menus, panels, drawers. Includes bg, border, shadow, backdrop-filter. |

## Radius

**Pattern:** Figma `--radius/{size}` -> `rounded-{size}`

| Figma | Utility | Value |
|---|---|---|
| `--radius/none` | `rounded-none` | 0 |
| `--radius/xs` | `rounded-xs` | 4px |
| `--radius/sm` | `rounded-sm` | 8px |
| `--radius/md` | `rounded-md` | 12px |
| `--radius/lg` | `rounded-lg` | 16px |
| `--radius/xl` | `rounded-xl` | 24px |
| `--radius/pill` | `rounded-pill` | 999px |

## Spacing

Figma `--Spacing/{n}` follows standard Tailwind 4px grid: `p-{n}`, `m-{n}`, `gap-{n}`, etc.

Common: 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px, 10=40px, 12=48px

Layout safe-area spacing: `pt-layout-top`, `px-layout-x`, `pb-layout-bottom`

## Gap Detection Workflow

When a Figma token has NO match in the project:

1. **Grep** the source CSS files to confirm it's truly missing
2. **Identify** the category (surface, text, border, shadow, typography, glass, etc.)
3. **Propose** adding it following existing naming conventions:
   - CSS variable in `styles.css` under the matching category section (both `:root` and `.dark`)
   - Tailwind alias in the `@theme inline` block of `styles.css`
   - Or a new `@utility` in the matching utility file
4. **Show** the user exactly what CSS to add and in which file
5. **Wait** for user confirmation before making changes

**Example:** Figma uses `--text/toned/text-warning` but it doesn't exist:
- Add `--text-toned-warning: var(--color-amber-600);` to `:root` in `styles.css`
- Add `--text-toned-warning: var(--color-amber-400);` to `.dark` in `styles.css`
- Add `--color-toned-warning: var(--text-toned-warning);` to `@theme inline` block
- Result: `text-toned-warning` becomes available as a Tailwind class
