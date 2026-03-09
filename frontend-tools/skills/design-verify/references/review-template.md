# Review Output Template

Write the review document using this structure.

```markdown
# [Feature Name] — Design Review

**Breakdown:** `docs/{feature-name}-breakdown.md`
**Figma:** [list Figma URLs verified]
**Pages verified:** [list page URLs visited]
**Date:** YYYY-MM-DD

---

## Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | N     | N     | N         |
| High     | N     | N     | N         |
| Medium   | N     | N     | N         |
| Low      | N     | N     | N         |

---

## Critical Issues

### N. [Issue title]

**Figma:** [What the design specifies — quote designer notes or reference token table]
**Current:** [What the implementation actually does — cite file:line]
**Root cause:** [Why this happened — missing prop, wrong class, inverted condition]
**Status:** Fixed | Unfixable — [reason]
**Fix applied:** [Description of the code change made, or why it can't be fixed]

---

## High Issues

### N. [Issue title]

**Figma:** [spec]
**Current:** [actual]
**Status:** Fixed | Unfixable — [reason]
**Fix applied:** [change description]

---

## Medium Issues

### N. [Issue title]

**Figma:** [spec]
**Current:** [actual]
**Status:** Fixed | Unfixable — [reason]
**Fix applied:** [change description]

---

## Low / Cosmetic Issues

### N. [Issue title]

**Figma:** [spec]
**Current:** [actual]
**Status:** Fixed | Unfixable — [reason]
**Fix applied:** [change description]

---

## Cross-Page Findings

If shared components are used across multiple routes, document any per-page issues here with a subsection per page:

### [Route path] (`file.svelte`)

#### [Severity]: [Issue title]

**Figma:** [spec]
**Current:** [actual]
**Status:** Fixed | Unfixable — [reason]
**Fix applied:** [change description]

### What works correctly on [route] page

| Feature | Status |
|---------|--------|
| [feature] | OK |

---

## What Matches Correctly

| Feature | Status |
|---------|--------|
| [feature description] | OK |
```

## Rules

- **Number findings sequentially** across severity levels (not per-level)
- **Cite file:line** for every "Current" observation
- **Quote designer notes verbatim** when referencing Figma specs
- **Always include "What Matches Correctly"** — gives confidence in what's working
- **Fixed items stay in the document** — mark them as "Fixed" but keep the finding for the record
- **Unfixable items must explain why** — "requires API change", "needs product decision", "ambiguous spec"
- **Cross-page section only appears** when shared components are verified across multiple routes
- **Omit empty severity sections** — if no Critical issues found, skip that heading
