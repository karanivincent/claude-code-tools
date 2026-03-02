---
name: figma-token-mapper
description: Map Figma design variables to Yond project CSS tokens, typography utilities (yond-text-*), shadow utilities (yond-shadow-*), stroke utilities (yond-stroke-*), glass utilities (yond-glass-*), and Tailwind color classes. Trigger on Figma URLs, get_design_context results, design-to-code tasks, "implement this Figma design", "match the design tokens", or when working with Figma MCP tools. Provides naming conventions so tokens can be derived without exhaustive lookup tables.
---

# Figma Token Mapper

Map Figma design tokens to Yond project utilities. Read `references/token-map.md` for the complete naming convention patterns.

## Workflow

1. **Extract design tokens** - Call `get_design_context` and `get_variable_defs` from Figma MCP for target nodes
2. **Load naming conventions** - Read `references/token-map.md` to understand transformation rules
3. **Map tokens** - For each Figma token, apply naming conventions to derive the project utility. If unsure, grep the source CSS file listed in the reference to confirm the utility exists
4. **Handle gaps** - If a Figma token has no project match, follow the Gap Detection workflow in `references/token-map.md`

## Key Rules

- **Always prefer project tokens over raw Tailwind** - Use `text-toned-accent-bold` not `text-slate-700`
- **Typography** - Use `yond-text-{size}-{weight}` utilities, never `text-sm font-medium`
- **Shadows** - Use `yond-shadow-*` utilities, never `shadow-sm`
- **Strokes** - Use `yond-stroke-*` + `border` class, never raw `border-gray-200`
- **Glass** - Use `yond-glass-*` for glassmorphism effects
- **Decorative colors** with no semantic token (e.g., icon gradients) may use Tailwind palette
- **Never assume a token exists** - Grep the source CSS to verify before using

## Quick Pattern Reference

| Figma Token | Project Utility |
|---|---|
| `Yond-CSS/M-16/Medium` | `yond-text-m-medium` |
| `--text/toned/text-accent-bold` | `text-toned-accent-bold` |
| `--Surface/bg-card` | `bg-surface-card` |
| `Shadow/Section` | `yond-shadow-section` |
| `Stroke/Card` | `yond-stroke-card` + `border` |
| `--radius/md` | `rounded-md` |
| `--Spacing/4` | `p-4`, `gap-4`, etc. |

## Source CSS Files (in `packages/ui/src/`)

| File | Contains |
|---|---|
| `styles.css` | CSS variables (surface, text, border, action, component tokens) + `@theme inline` Tailwind color aliases |
| `typography.css` | `yond-text-*` utilities |
| `shadows.css` | `yond-shadow-*` utilities |
| `strokes.css` | `yond-stroke-*` utilities |
| `glass.css` | `yond-glass-*` utilities |
