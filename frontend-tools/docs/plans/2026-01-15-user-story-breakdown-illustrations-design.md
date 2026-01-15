# User Story Breakdown Skill - Illustrations Enhancement

**Date:** 2026-01-15
**Status:** Design Complete

## Summary

Enhance the `user-story-breakdown` skill to generate visual ASCII illustrations by default when breaking down user stories. This provides developers with quick visual reference for page layouts, component structures, and state variations.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Illustration types | All four (layout, components, states, hierarchy) | Comprehensive visual documentation |
| File location | In `output-template.md` | Keep templates consolidated in one place |
| Structure level | Strict templates | Consistency across breakdowns |
| Placement | Integrated with components | More scannable than grouped section |

## Changes Required

### 1. Update SKILL.md - Phase 5

Add illustration requirements to the existing Phase 5:

```markdown
### Phase 5: Generate Breakdown

Generate breakdown using the template in [references/output-template.md].

**Required illustrations (when designs provided):**

| Illustration | Placement | Purpose |
|--------------|-----------|---------|
| Page Layout | After "Design Reference" | Overall structure at a glance |
| Component Diagrams | Inline with each new component | Visual spec for implementation |
| State Comparisons | With components that have multiple states | Show conditional rendering |
| Component Hierarchy | End of components section | Tree view of nesting |

**Illustration principles:**
- Use box-drawing characters (`┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼`)
- Keep diagrams ~45 chars wide
- Annotate with `←` arrows for context
- Show props below component diagrams

For complexity scoring, consult [references/complexity-factors.md](references/complexity-factors.md).

For SvelteKit-specific patterns, see [references/sveltekit-patterns.md](references/sveltekit-patterns.md).
```

### 2. Update output-template.md - Add Illustration Templates

Add the following sections to the output template:

#### A. Page Layout Template (after Design Reference)

```markdown
## Page Layout

```
┌─────────────────────────────────────────┐
│                                         │
│  [SECTION 1 NAME]                       │  ← [Component name]
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │  [Description of content]       │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [SECTION 2 NAME]                       │  ← [Component name]
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │  [Description of content]       │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ... continue for all sections ...      │
│                                         │
└─────────────────────────────────────────┘
```

**Guidelines:**
- Use box-drawing characters: `┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼`
- Annotate with `← Component/purpose` on the right
- Show nesting for parent-child relationships
- Keep width ~45 chars for readability
```

#### B. Component Diagram Template (inline with New Components)

```markdown
### New Components Needed

#### [ComponentName]

**Purpose:** [Description]
**Atomic level:** atom | molecule | organism

**Props:**
- `propName`: type - description

**Visual:**
```
┌─────────────────────────┐
│  [Icon] [Title]    [?]  │  ← Header row (optional badge)
├─────────────────────────┤
│                         │
│  [Content area]         │  ← Slot/children
│                         │
└─────────────────────────┘

Props:
- icon: ComponentType
- title: string
- badge?: string
- children: Snippet
```
```

#### C. State Comparison Template (for multi-state components)

```markdown
#### [ComponentName] States

```
STATE A:                    STATE B:
┌───────────────┐           ┌───────────────┐
│               │           │  [Content]    │
│  [Empty]      │           │  [More]       │
│               │           │               │
└───────────────┘           └───────────────┘
```
```

#### D. Component Hierarchy Template (end of components section)

```markdown
### Component Hierarchy

```
PageName
├── [ComponentA]
│   ├── [ChildComponent]
│   └── [ChildComponent]
│       ├── [SubChild]
│       └── [SubChild]
├── [ComponentB] (conditional)
│   └── [ChildComponent]
├── [ComponentC]
│   ├── [ReusedComponent] ←── @yond/ui
│   └── [NewComponent] ←── create
└── [ComponentD]
```

**Annotations:**
- `(conditional)` - rendered based on data
- `←── @yond/ui` - imported from shared library
- `←── create` - new component to build
- `←── extend` - existing component needs changes
```

## Files to Modify

| File | Change |
|------|--------|
| `skills/user-story-breakdown/SKILL.md` | Add illustration requirements table to Phase 5 |
| `skills/user-story-breakdown/references/output-template.md` | Add 4 illustration template sections |

## Example Output

See `/Users/vince/Documents/Projects/Ruleev/yond_monorepo/docs/plans/class-detail-page-breakdown.md` for a real-world example of these illustrations applied to a story breakdown.

## Verification

After implementation:
1. Run the skill on a sample user story with design screenshots
2. Verify all 4 illustration types are generated
3. Check illustrations are placed inline with relevant sections
4. Confirm box-drawing characters render correctly in markdown preview
