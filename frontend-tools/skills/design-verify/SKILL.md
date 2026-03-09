---
name: design-verify
description: >-
  Verify a frontend implementation matches its design spec by comparing against
  a story-breakdown document, Figma designs (via MCP), and the live browser
  (via Chrome MCP). Produces a severity-ranked findings document and immediately
  fixes all fixable issues. Checks design mismatches, code quality (dead code,
  stale i18n), and cross-page consistency.
  Triggers: "verify design", "design verify", "check implementation against design",
  "does this match the design", "compare to Figma", "design review",
  "design QA", "check against breakdown", "/design-verify".
---

# Design Verify

Verify that a frontend implementation matches its design spec. Compares against:
1. **Story-breakdown document** — token tables, state matrix, designer notes, component hierarchy
2. **Figma designs** — via MCP for fresh screenshots and design context
3. **Live browser** — via Chrome MCP for visual and behavioral verification

Produces a review document, then **immediately fixes** all fixable issues.

## Inputs

**Required:**
- Breakdown document path — e.g., `docs/appointment-class-detail-redesign-breakdown.md`

**Optional:**
- Page URLs — concrete URLs with test data (e.g., `/classes/25436`). If not provided, ask the user.
- Dev server URL — defaults to `localhost:5173`

**Invocation:** `/design-verify docs/{feature-name}-breakdown.md`

With URLs: `/design-verify docs/{feature-name}-breakdown.md --urls /classes/25436 /appointments/book/confirm?benefit=7`

## Workflow

### Phase 1: Load Spec

Read the breakdown document. Extract:

- **Figma URLs** from the Summary section
- **Token tables** — every `Property | Figma Token | Project Class` mapping
- **State matrix** — which elements change per state (default, booked, scrolled, etc.)
- **Designer notes** — verbatim behavior specs
- **Component hierarchy** — expected DOM structure and file paths
- **Content order** per state — element positioning rules
- **Pages to verify** — routes mentioned in Codebase Research / Component Hierarchy

If page URLs weren't provided, ask the user:
> "The breakdown mentions these routes: [list]. Give me concrete URLs with test data to verify."

Validate the dev server is reachable (quick fetch to the base URL). If unreachable:
> "Dev server isn't running at [URL]. Start it with `pnpm dev` and invoke me again."

### Phase 2: Figma Baseline

**IMPORTANT:** Figma MCP tools are main-context only. Do not delegate to subagents.

For each Figma URL from the breakdown:
1. Call `get_design_context` with fileKey + nodeId
2. Call `get_screenshot` for visual reference
3. If the node is a section with variants, drill into key variant frames

Store screenshots and design context in memory as the "expected" baseline.

### Phase 3: Structural Verification

Read implementation source files for each component in the breakdown's component hierarchy. Check systematically using [references/verification-checks.md](references/verification-checks.md):

1. **Token compliance** — match each token table row against source CSS classes
2. **Content order** — verify state-dependent element ordering matches state matrix
3. **Designer notes compliance** — verify each note has corresponding implementation logic
4. **Dead code & cleanup** — find code behind unresolved blockers, stale i18n keys, unused props
5. **Cross-page consistency** — shared components render consistently across routes

Collect all findings with severity classification.

### Phase 4: Browser Verification

For each page URL, for each state in the state matrix:

#### 4a: Navigate and capture
- Open the page via Chrome MCP
- Capture a screenshot
- Read the page DOM

#### 4b: Interactive state transitions
Walk through the state matrix. For states requiring interaction:
- Click buttons (Book, Cancel), fill forms, scroll
- Wait for state changes, capture screenshots after each transition
- If an interaction fails (no data, API error), note "Could not reach state: [reason]" and continue

#### 4c: Visual comparison
Compare each browser screenshot against the Figma screenshot from Phase 2. Note:
- Layout misalignment (stacking vs inline, wrong flex direction)
- Missing visual elements (images, icons, gradients)
- Sizing issues (elements stretching, wrong dimensions)
- Spacing discrepancies

#### 4d: Behavioral checks
Verify interactive behaviors from designer notes:
- Scroll/sticky behavior
- Toggle interactions (MORE/LESS, expand/collapse)
- Sheet/drawer open/close
- Navigation (back button targets per state)

### Phase 5: Fix & Document

#### 5a: Classify findings

| Severity | Criteria |
|----------|----------|
| Critical | Core layout wrong, major visual element missing, broken interaction |
| High | Noticeable visual difference, behavior doesn't match spec |
| Medium | Minor visual mismatch, cross-page inconsistency, cleanup needed |
| Low | Cosmetic, nice-to-have, future improvement |

#### 5b: Fix immediately

For every fixable issue, apply the fix directly:
- Wrong CSS class → edit the component
- Wrong content order → restructure template logic
- Missing layout classes (`w-fit`, `truncate`, `flex-row`) → add them
- Stale i18n keys → remove from all locale files
- Unused props → remove from component and call sites

**Do NOT fix:**
- Issues requiring API/backend changes
- Issues requiring design/product decisions
- Issues where the correct fix is ambiguous

#### 5c: Write review document

Write findings to `docs/{feature-name}-design-review.md` using the template in [references/review-template.md](references/review-template.md).

Include:
- Summary table (severity counts, fixed vs remaining)
- Each finding with Figma expectation, current behavior, fix status
- "What matches correctly" table for completeness

## Key Behaviors

1. **Browser is required** — do not proceed without a running dev server. Code-only verification is insufficient.
2. **Fix first, document second** — apply all fixable changes before writing the review document.
3. **Structural before visual** — Phase 3 catches concrete mismatches; Phase 4 catches visual/behavioral issues.
4. **Graceful state fallback** — attempt interactive state transitions but continue if they fail.
5. **Figma in main context** — never dispatch Figma MCP calls to subagents.
6. **Preserve the review** — always write the review document even if all issues were fixed, as a record.
7. **Cross-page by default** — if the breakdown shows a shared component across routes, verify all routes.
