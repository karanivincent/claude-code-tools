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
- Figma screenshots - analyze for UI components, states, responsive considerations
- Context hints - related areas or constraints ("involves calendar", "must use existing API")

## Workflow

### Phase 1: Input Analysis

Parse the user story to extract:
- Core user goal and value
- Explicit acceptance criteria (if provided)
- Implicit requirements (error handling, loading states, validation)

If screenshots provided, analyze for:
- Visual components and design system elements
- UI states visible in designs
- Responsive layout patterns

### Phase 2: Codebase Research

Dispatch the `gather-codebase-context` agent:

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

### Phase 3: Parallel Generation

After research completes, dispatch work in parallel across three streams:

#### 3a: Technical Spec (conditional)

**Only dispatch if** codebase research found API dependencies (endpoints in `src/lib/api/services/`, types from `api.ts`, or the story involves data fetching/mutations). **Skip entirely** for pure UI stories (styling, layout, static content).

Dispatch the `technical-spec-generator` agent:

```
Generate a Technical Spec section for this story breakdown.

Story: [USER'S STORY]
UI Steps: [extracted from Phase 1]

Codebase Research Findings:
[paste relevant sections from gather-codebase-context output — API endpoints, types, services found]

Design Context:
[screenshot analysis if available, or "No designs provided"]
```

#### 3b: ASCII Diagrams

Dispatch the `ascii-diagram-generator` agent:

```
Generate ASCII diagrams for this story breakdown.

Story: [USER'S STORY]

Codebase Research Findings:
[paste component inventory, similar implementations from gather-codebase-context output]

Component Assessment:
[list each component with its status: reuse/extend/rework/create]

Design Context:
[screenshot analysis if available, or "No designs provided"]
```

#### 3c: Slices + Assessment (main context)

While subagents work, generate in the main context:

**Component Assessment** — categorize discovered components:

| Status | Description | Effort Impact |
|--------|-------------|---------------|
| **Reuse** | Exists, fits exactly | Baseline |
| **Extend** | Needs new props/variants | x1.2 |
| **Rework** | Significant changes needed | x1.5-2.0 |
| **Create** | Build from scratch | Per complexity |

**Note:** Rework often exceeds create complexity due to backwards compatibility constraints.

**Vertical Slicing** — apply SPIDR method:
- **S**pike: Technical uncertainty requiring investigation
- **P**ath: Happy path vs alternative flows
- **I**nterface: User interaction variations
- **D**ata: Different data scenarios
- **R**ules: Business rule variations

Sequence by "Make it Run, Right, Fast":
1. Run: Happy path working end-to-end
2. Right: Error handling, edge cases, validation
3. Fast: Optimization, polish, accessibility

**Also generate:** test scenarios, risks & mitigations, dependencies, effort drivers.

For complexity scoring, consult [references/complexity-factors.md](references/complexity-factors.md).

For SvelteKit-specific patterns, see [references/sveltekit-patterns.md](references/sveltekit-patterns.md).

### Phase 4: Assemble & Write Document

Wait for all parallel streams to complete, then combine outputs into the final document using the template in [references/output-template.md](references/output-template.md).

**Assembly order:**
1. Summary (from Phase 1 + 3c)
2. Technical Spec (from 3a — omit section entirely if skipped)
3. Design Reference (from Phase 1 screenshots)
4. Page Layouts (from 3b)
5. Codebase Research Findings (from Phase 2 — excluding API Endpoints and Key API Types which moved to Technical Spec)
6. New Component Visuals (from 3b)
7. Component Hierarchy (from 3b)
8. Vertical Slices (from 3c)
9. Test Scenarios (from 3c)
10. Risks & Mitigations (from 3c)
11. Dependencies (from 3c)
12. Effort Drivers (from 3c)

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
2. **Ask if ambiguous** - Clarify unclear requirements before proceeding
3. **Flag blockers** - Prominently surface blocking dependencies (e.g., "API not built")
4. **Recommend splitting** - When complexity exceeds 13 points
5. **Call out rework** - Explicitly note rework items with effort multiplier impact
6. **Always write to file** - Save the final breakdown to `./docs/{feature-name}-breakdown.md`
7. **Conditional Technical Spec** - Only generate when the story involves API dependencies
8. **Parallel dispatch** - Run subagents concurrently to minimize wall-clock time
