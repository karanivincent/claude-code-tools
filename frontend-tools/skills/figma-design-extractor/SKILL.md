---
name: figma-design-extractor
description: >-
  Extract structured design specifications from Figma designs including token
  tables, icon inventory, designer notes, state matrices, layout measurements,
  and screenshots. Maps all Figma tokens to Yond project CSS tokens, typography
  utilities (yond-text-*), shadow utilities (yond-shadow-*), stroke utilities
  (yond-stroke-*), glass utilities (yond-glass-*), and Tailwind color classes.
  Trigger on Figma URLs, get_design_context results, design-to-code tasks,
  "implement this Figma design", "match the design tokens", "extract design
  specs", or when working with Figma MCP tools. Supersedes figma-token-mapper.
---

# Figma Design Extractor

Extract structured, implementation-ready design specs from Figma. Two modes:

1. **Full extraction** (default) — Produces complete Design Specification: token tables, icons, notes, state matrix, layout, screenshots
2. **Token lookup** — Quick token mapping for a specific element (lightweight, replaces old figma-token-mapper)

## Full Extraction

Dispatch the `figma-design-extractor` agent:

```
Extract a full design specification from this Figma design.

Figma URL: [URL or fileKey + nodeId]
Story context: [optional summary if available]

Token Mapping Reference:
[Read and paste contents of references/token-map.md]
```

The agent handles: Figma MCP calls, component drilling, icon identification, token mapping, and output assembly.

After the agent returns, **verify mapped tokens**: grep `packages/ui/src/styles.css` for any color/action/surface classes to confirm they exist. Fix any near-misses before writing the output.

Write the Design Specification to the appropriate location:
- If part of a story breakdown: slot into the breakdown document
- If standalone: write to `docs/{feature-name}-design-spec.md`

## Token Lookup

For quick token mapping without full extraction:

1. Call `get_variable_defs` from Figma MCP for the target node
2. Read `references/token-map.md` for transformation rules
3. Map each Figma token to its project utility
4. **Verify every mapped class** — Grep `packages/ui/src/styles.css` (for colors) or the relevant CSS file to confirm each class exists. See "Token Verification" in the reference for details

## Key Rules

- **Always prefer project tokens over raw Tailwind** — Use `text-toned-accent-bold` not `text-slate-700`
- **Typography** — Use `yond-text-{size}-{weight}` utilities, never `text-sm font-medium`
- **Shadows** — Use `yond-shadow-*` utilities, never `shadow-sm`
- **Strokes** — Use `yond-stroke-*` + `border` class, never raw `border-gray-200`
- **Glass** — Use `yond-glass-*` for glassmorphism effects
- **Never assume a token exists** — Grep the source CSS to verify before using

## Source CSS Files (in `packages/ui/src/`)

| File | Contains |
|---|---|
| `styles.css` | CSS variables + `@theme inline` Tailwind color aliases |
| `typography.css` | `yond-text-*` utilities |
| `shadows.css` | `yond-shadow-*` utilities |
| `strokes.css` | `yond-stroke-*` utilities |
| `glass.css` | `yond-glass-*` utilities |
