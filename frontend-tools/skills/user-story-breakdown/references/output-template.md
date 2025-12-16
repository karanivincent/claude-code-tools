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

- [ComponentName] - [purpose, atomic level: atom/molecule/organism]

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
