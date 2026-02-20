# User Story Breakdown

Transform user stories into well-researched, actionable task breakdowns following vertical slicing principles.

## When to Use

- Breaking down a story/feature/task
- Planning implementation for a feature
- Estimating user stories
- Preparing task breakdown for sprint planning
- Analyzing what's needed to implement a feature

## Inputs

**Required:**
- User story text (formal "As a user..." or informal description)

**Optional:**
- Figma screenshots for UI analysis
- Context hints about related areas or constraints

## Workflow

1. **Input Analysis** - Extract core goal, acceptance criteria, implicit requirements
2. **Codebase Research** - Dispatch `gather-codebase-context` agent
3. **Component Assessment** - Categorize as Reuse/Extend/Rework/Create
4. **Generate Breakdown** - Apply vertical slicing (SPIDR method)
5. **Write Output** - Save to `./docs/{feature-name}-breakdown.md`

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

- Never generates breakdown without codebase context
- Asks for clarification on ambiguous requirements
- Flags blocking dependencies prominently
- Recommends splitting when complexity exceeds 13 points
