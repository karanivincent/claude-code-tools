---
name: story-breakdown
description: Transform user stories into actionable frontend task breakdowns with automatic codebase research. Use when (1) user asks to "break down this story/feature/task", (2) planning implementation for a feature, (3) estimating user stories, (4) preparing task breakdown for sprint planning, or (5) analyzing what's needed to implement a feature in SvelteKit.
---

# User Story Breakdown

Transform user stories into well-researched, actionable task breakdowns following vertical slicing principles.

## Inputs

**Required:**
- User story text (formal "As a user..." or informal description)

**Optional:**
- Figma URL — triggers full design extraction for token tables, icons, states, layout
- Context hints — related areas or constraints ("involves calendar", "must use existing API")

## Workflow

### Phase 1: Input Analysis

Parse the user story to extract:
- Core user goal and value
- Explicit acceptance criteria (if provided)
- Implicit requirements (error handling, loading states, validation)
- **Figma URL detection** — check if the user provided a Figma URL (figma.com/design/...)

### Phase 1.5: Refresh Generated Types

Before dispatching research agents, ensure locally generated API files are fresh:

```bash
cd apps/selfservice && pnpm generate:api-types
```

This fetches the latest OpenAPI spec and regenerates:
- `src/lib/generated/api.ts` — TypeScript API client with types
- `static/generated/route-details.json` — endpoint tags, operationIds, query params
- `static/generated/schemas.json` — response/request type schemas

**Why here:** Both `gather-codebase-context` (reads `api.ts`) and `technical-spec-generator` (reads `route-details.json` + `schemas.json`) depend on these files being current.

### Phase 2: Figma Design Extraction (conditional)

**Only if** a Figma URL was provided. **Skip entirely** if no Figma URL.

Dispatch the `figma-design-extractor` agent:

```
Extract a full design specification from this Figma design.

Figma URL: [URL]
Story context: [USER'S STORY summary]

Token Mapping Reference:
[Read and paste contents of figma-design-extractor skill's references/token-map.md]
```

Wait for extraction to complete before proceeding. The output provides:
- **Component list** — named components found in the design (Button, Card, Avatar, icons, etc.)
- **Designer notes** — behavior specs from annotation frames
- **State matrix** — what changes between design variants
- **Token tables** — mapped Figma tokens to project utility classes
- **Icon inventory** — exact Tabler icon names
- **Layout measurements** — spacing, dimensions
- **Screenshots** — per variant

### Phase 3: Codebase Research

Dispatch the `gather-codebase-context` agent.

**If Figma extraction completed (Phase 2):**

```
Research the codebase for implementing: [USER'S STORY]

Components identified from Figma design:
[List each component from Phase 2 output with its specs, e.g.:]
- Button (full-width, 48px height, yond-text-m-bold)
- Card/Appointment list (existing instance in design)
- Avatar (24px, stacked variant for multiple items)
- [Icon imports: IconMapPin, IconExclamationCircle, etc.]

For each component:
1. Search src/lib/components/ and @yond/ui for existing match
2. Check if existing component matches the Figma spec (size, tokens, variants)
3. Flag gaps: missing variants, wrong tokens, needs new props

Also search for:
4. Similar page implementations in src/routes/
5. API endpoints in src/lib/api/services/
6. Types from src/lib/generated/api.ts
7. E2E test patterns in e2e/
```

**If no Figma URL (fallback to original behavior):**

```
Research the codebase for implementing: [USER'S STORY]

Focus on:
1. Components in src/lib/components/ - identify reusable atoms/molecules/organisms
2. Similar implementations - search for comparable features/patterns
3. API endpoints in src/lib/api/services/ - check existing vs needed
4. Types from src/lib/generated/api.ts - map data models
5. E2E tests - find patterns to follow in e2e/
```

Wait for research to complete before proceeding.

### Phase 4: Parallel Generation

After research completes, dispatch work in parallel across three streams:

#### 4a: Technical Spec (conditional)

**Only dispatch if** codebase research found API dependencies (endpoints in `src/lib/api/services/`, types from `api.ts`, or the story involves data fetching/mutations). **Skip entirely** for pure UI stories (styling, layout, static content).

Dispatch the `technical-spec-generator` agent:

```
Generate a Technical Spec section for this story breakdown.

Story: [USER'S STORY]
UI Steps: [extracted from Phase 1]

Codebase Research Findings:
[paste relevant sections from gather-codebase-context output — API endpoints, types, services found]

Design Context:
[If Figma extraction available: paste State Matrix + Designer Notes — these identify which states need API data and what interactions trigger API calls]
[If no Figma: "No designs provided"]
```

#### 4b: ASCII Diagrams

Dispatch the `ascii-diagram-generator` agent:

```
Generate ASCII diagrams for this story breakdown.

Story: [USER'S STORY]

Codebase Research Findings:
[paste component inventory, similar implementations from gather-codebase-context output]

Component Assessment:
[list each component with its status: reuse/extend/rework/create]

Design Context:
[If Figma extraction available: paste the component tree structure, layout measurements, and component names from the Figma design — use these for accurate diagram labels and nesting]
[If no Figma: "No designs provided"]
```

#### 4c: Slices + Assessment (main context)

While subagents work, generate in the main context:

**Component Assessment** — categorize discovered components:

| Status | Description | Effort Impact |
|--------|-------------|---------------|
| **Reuse** | Exists, fits exactly | Baseline |
| **Extend** | Needs new props/variants | x1.2 |
| **Rework** | Significant changes needed | x1.5-2.0 |
| **Create** | Build from scratch | Per complexity |

**Note:** Rework often exceeds create complexity due to backwards compatibility constraints.

When Figma data is available, the component assessment is enriched:
- Match each Figma component to codebase findings
- Check if existing components match Figma token specs (typography, colors, sizes)
- Designer notes inform whether a component needs rework (e.g., "CTA font-weight changed from semi bold to bold" = Extend)

**Vertical Slicing** — apply SPIDR method:
- **S**pike: Technical uncertainty requiring investigation
- **P**ath: Happy path vs alternative flows
- **I**nterface: User interaction variations
- **D**ata: Different data scenarios
- **R**ules: Business rule variations

When Figma data is available:
- Each design variant is a slice candidate
- Designer notes with behavior specs become acceptance criteria
- State matrix entries map to specific slices

Sequence by "Make it Run, Right, Fast":
1. Run: Happy path working end-to-end
2. Right: Error handling, edge cases, validation
3. Fast: Optimization, polish, accessibility

**Also generate:** test scenarios, risks & mitigations, dependencies, effort drivers.

For complexity scoring, consult [references/complexity-factors.md](references/complexity-factors.md).

For SvelteKit-specific patterns, see [references/sveltekit-patterns.md](references/sveltekit-patterns.md).

### Phase 5: Assemble & Write Document

Wait for all parallel streams to complete, then combine outputs into the final document using the template in [references/output-template.md](references/output-template.md).

**Assembly order:**
1. Summary (from Phase 1 + 4c)
2. Technical Spec (from 4a — omit section entirely if skipped)
3. Design Specification (from Phase 2 — omit if no Figma URL)
4. Page Layouts (from 4b)
5. Codebase Research Findings (from Phase 3 — excluding API Endpoints and Key API Types which moved to Technical Spec)
6. New Component Visuals (from 4b)
7. Component Hierarchy (from 4b)
8. Vertical Slices (from 4c)
9. Test Scenarios (from 4c)
10. Risks & Mitigations (from 4c)
11. Dependencies (from 4c)
12. Effort Drivers (from 4c)

**Write to file:**

**Location:** `./docs/`

**Filename format:** `{feature-name}-breakdown.md`
- Convert feature name to kebab-case
- Examples:
  - "Class Overview Filters" -> `class-overview-filters-breakdown.md`
  - "User Authentication" -> `user-authentication-breakdown.md`
  - "Add dark mode toggle" -> `add-dark-mode-toggle-breakdown.md`

**Required:** Always write the final breakdown to this file. Do not skip this step.

## Story Point Reference

| Points | Scope |
|--------|-------|
| 1 | Text change, styling tweak, config update |
| 2 | Simple component with props, basic API integration |
| 3 | New component with state, form with validation |
| 5 | Feature with multiple components, complex form + API |
| 8 | New page/route, multiple API calls, complex interactions |
| 13+ | Needs breakdown into smaller stories |

## Key Behaviors

1. **Wait for research** - Never generate breakdown without codebase context
2. **Figma before research** - When Figma URL provided, extract design first so research is targeted
3. **Ask if ambiguous** - Clarify unclear requirements before proceeding
4. **Flag blockers** - Prominently surface blocking dependencies (e.g., "API not built")
5. **Recommend splitting** - When complexity exceeds 13 points
6. **Call out rework** - Explicitly note rework items with effort multiplier impact
7. **Always write to file** - Save the final breakdown to `./docs/{feature-name}-breakdown.md`
8. **Conditional Technical Spec** - Only generate when the story involves API dependencies
9. **Conditional Design Spec** - Only generate when a Figma URL is provided
10. **Parallel dispatch** - Run Phase 4 subagents concurrently to minimize wall-clock time
