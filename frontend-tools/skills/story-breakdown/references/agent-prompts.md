# Agent Prompt Templates

## Codebase Research

### With Figma Context

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

### Without Figma

```
Research the codebase for implementing: [USER'S STORY]

Focus on:
1. Components in src/lib/components/ - identify reusable atoms/molecules/organisms
2. Similar implementations - search for comparable features/patterns
3. API endpoints in src/lib/api/services/ - check existing vs needed
4. Types from src/lib/generated/api.ts - map data models
5. E2E tests - find patterns to follow in e2e/
```

## Technical Spec

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

## ASCII Diagrams

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
