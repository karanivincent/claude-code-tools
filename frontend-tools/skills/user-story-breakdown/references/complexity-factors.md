# Complexity Factors

## Factor Matrix

| Factor | Low | Medium | High |
|--------|-----|--------|------|
| **Components** | All reuse as-is | Some extend/create | Rework existing |
| **API** | Existing endpoints | New endpoints (contract defined) | Undefined/pending |
| **State** | Local only | Stores/context | Cross-component sync |
| **Responsive** | No changes | Minor adjustments | Layout restructuring |
| **Testing** | Pattern exists | New patterns needed | Untested area |
| **Dependencies** | None | Non-blocking | Blocking (backend, design) |

## Complexity Ratings

- **Low** (0-2 high factors): Straightforward implementation
- **Medium** (3-4 high factors): Requires careful planning
- **High** (5-6 high factors): Consider splitting
- **Very High** (7+ or blockers): Must split into smaller stories

## Rework Effort Multipliers

| Rework Type | Multiplier | Examples |
|-------------|------------|----------|
| Minor | ×1.2 | Add prop, new variant, additional CSS |
| Moderate | ×1.5 | New states, behavior changes, new slots |
| Major | ×2.0 | Refactor structure, breaking changes, API redesign |

### Why Rework is Often Harder Than Creating

1. **Backwards compatibility** - Must not break existing usage
2. **Test updates** - Existing tests may need modification
3. **Documentation** - Must update existing docs
4. **Consumer migration** - Other components depend on current API
5. **Hidden assumptions** - Existing code may have implicit behaviors

## Risk Assessment

| Risk Level | Indicators |
|------------|------------|
| **Low** | Clear requirements, existing patterns, no dependencies |
| **Medium** | Some unknowns, new patterns needed, non-blocking deps |
| **High** | Major unknowns, blocking dependencies, new territory |

### Common Risks

- **API not ready** - Backend endpoint doesn't exist yet
- **Design incomplete** - Missing states, edge cases, responsive views
- **Data model changes** - Requires database migrations
- **Third-party integration** - External service dependencies
- **Performance concerns** - Large data sets, complex calculations
