# Output Template

Use this structure for the breakdown document.

---

# Story Breakdown: [Feature Name]

## Summary

- **User Story**: [Original story text]
- **Goal**: [What user achieves]
- **Complexity**: Low | Medium | High | Very High
- **Estimated Effort**: [X] story points

## Design Reference

[Embedded screenshots if provided, or "No designs provided"]

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

## Codebase Research Findings

### Existing Components to Reuse

- `ComponentName` at `src/lib/components/...` - [purpose]

### Components to Extend

- `ComponentName` - [current state] → [needed changes] (×1.2)

### Components to Rework

- `ComponentName` - [why rework needed, impact] (×1.5-2.0)

### Similar Implementations Found

- [Feature X] in `src/routes/app/...` - [relevance]

### API Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /api/... | Exists | [notes] |
| POST /api/... | Needs creation | [backend dependency] |

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
```

#### [ComponentName] with States

Show side-by-side comparison for multi-state components:

```
STATE A:                    STATE B:
┌───────────────┐           ┌───────────────┐
│               │           │  [Content]    │
│  [Empty]      │           │  [More]       │
│               │           │               │
└───────────────┘           └───────────────┘
```

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

## Vertical Slices

### Slice 1: [Name] - Happy Path

**Description**: [What this slice delivers]

**Components**: [List with status: reuse/extend/rework/create]

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

### Slice 2: [Name] - Error Handling

**Description**: [What this slice delivers]

**Components**: [List]

**Acceptance Criteria**:
- [ ] Error states handled
- [ ] User feedback provided

### Slice 3: [Name] - Edge Cases

[Continue pattern...]

## Test Scenarios

### [Feature/Happy Path]

**Given** [precondition]
**When** [action]
**Then** [expected result]

### [Error Scenario]

**Given** [precondition]
**When** [action that fails]
**Then** [error handling behavior]

### [Edge Case]

**Given** [unusual condition]
**When** [action]
**Then** [expected behavior]

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Description] | High/Med/Low | [How to address] |

## Dependencies

### Blocking (must complete first)

- [ ] [Dependency description]

### Non-blocking (can work in parallel)

- [ ] [Dependency description]

## Effort Drivers

[What makes this complex: state management, responsive requirements, rework items, API dependencies, etc.]

---

## Output Notes

- Keep bullet points concise
- Use actual file paths from research
- Include component status (reuse/extend/rework/create) with every component
- Flag any blocking dependencies prominently
- Test scenarios should be directly convertible to Playwright specs
