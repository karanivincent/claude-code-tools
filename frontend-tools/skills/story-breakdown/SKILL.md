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
- Figma URL(s) — triggers full design extraction for token tables, icons, states, layout
- Context hints — related areas or constraints ("involves calendar", "must use existing API")

## Workflow

### Phase 1: Input Analysis

Parse the user story to extract:
- Core user goal and value
- Explicit acceptance criteria (if provided)
- Implicit requirements (error handling, loading states, validation)
- **Figma URL detection** — check if the user provided one or more Figma URLs (figma.com/design/...)

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

**IMPORTANT: Figma MCP tools (`get_design_context`, `get_screenshot`, `get_variable_defs`) are only available in the main context. Do NOT dispatch figma-design-extractor as a background subagent — it will fail.**

Perform extraction in the main context:

1. Read the token mapping reference from figma-design-extractor skill's references/token-map.md
2. For each Figma URL provided:
   a. Call `get_design_context` with the fileKey and nodeId
   b. If the response is a section node (sparse metadata), drill into individual variant frames
   c. Call `get_design_context` on key variant frames for detailed code + tokens
   d. Call `get_screenshot` on key variants for visual reference
3. Extract from the responses:
   - Component list, Designer notes (from annotation frames), State matrix
   - Token tables (map Figma tokens to project utilities using token-map.md)
   - Icon inventory (exact Tabler icon data-names)
   - Layout measurements (spacing, dimensions)

**Screenshot limitation:** Figma MCP renders screenshots inline in the conversation. They cannot be saved to disk as files. Reference Figma URLs in the breakdown document instead of local file paths.

**Multiple Figma URLs:** If the user provides multiple URLs (e.g., detail page + cancellation flow), extract each sequentially. Merge all results into a single Design Specification section with sub-headings per design area.

### Phase 3: Codebase Research

Dispatch the `gather-codebase-context` agent using the prompt template in [references/agent-prompts.md](references/agent-prompts.md#codebase-research). Use the "With Figma Context" variant if Phase 2 completed, otherwise use the "Without Figma" variant.

Wait for research to complete before proceeding.

**Agent completion:** When using `run_in_background: true`, you will be notified automatically when the agent completes. Do NOT poll with sleep loops or check output files — simply continue with other work or wait for the notification.

### Phase 4: Parallel Generation

After research completes, dispatch work in parallel across three streams:

#### 4a: Technical Spec (conditional)

**Only dispatch if** codebase research found API dependencies (endpoints in `src/lib/api/services/`, types from `api.ts`, or the story involves data fetching/mutations). **Skip entirely** for pure UI stories (styling, layout, static content).

Dispatch the `technical-spec-generator` agent using the prompt template in [references/agent-prompts.md](references/agent-prompts.md#technical-spec).

#### 4b: ASCII Diagrams

Dispatch the `ascii-diagram-generator` agent using the prompt template in [references/agent-prompts.md](references/agent-prompts.md#ascii-diagrams).

**Agent completion:** When using `run_in_background: true`, you will be notified automatically when agents complete. Do NOT poll with sleep loops or check output files — simply continue with other work or wait for the notification.

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

### Phase 6: Post-Workflow (optional)

Offer to commit the breakdown document and any regenerated API types if the user wants to save progress before implementation.

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
3. **Figma in main context** - Never dispatch Figma extraction as a subagent (MCP tools unavailable to agents)
4. **Ask if ambiguous** - Clarify unclear requirements before proceeding
5. **Flag blockers** - Prominently surface blocking dependencies (e.g., "API not built")
6. **Recommend splitting** - When complexity exceeds 13 points
7. **Call out rework** - Explicitly note rework items with effort multiplier impact
8. **Always write to file** - Save the final breakdown to `./docs/{feature-name}-breakdown.md`
9. **Conditional Technical Spec** - Only generate when the story involves API dependencies
10. **Conditional Design Spec** - Only generate when a Figma URL is provided
11. **Parallel dispatch** - Run Phase 4 subagents concurrently to minimize wall-clock time
12. **No agent polling** - Wait for automatic completion notifications, never sleep-loop
