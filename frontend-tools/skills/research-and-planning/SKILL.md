---
name: research-and-planning
description: Orchestrates a comprehensive research and planning workflow for features, bugs, or improvements. Spawns context-gathering agent, then runs parallel planning agents, and consolidates into a final plan for user approval. Use when implementing features, fixing bugs, refactoring code, adding capabilities, or when the user needs help planning complex changes that require understanding the codebase first.
allowed-tools: Read, Grep, Glob, Task
---

# Research and Planning Workflow

## Purpose

This skill orchestrates a structured approach to planning code changes by:

1. Thoroughly researching the codebase context
2. Generating multiple independent implementation plans
3. Consolidating the best approaches
4. Presenting a final plan for user approval

**Important**: This skill plans but does NOT implement. Implementation happens only after user approval.

## Workflow Phases

### Phase 1: Context Gathering

Spawn the `gather-codebase-context` agent to research the codebase:

```
Use the agent at .claude/agents/gather-codebase-context.md to thoroughly research and document all codebase context related to: [USER'S REQUEST]

Focus on discovering:
- All files that will need to be modified
- Dependencies and relationships between components
- Existing patterns and conventions
- Test coverage for affected areas
- Configuration and documentation
```

Wait for the context gathering to complete before proceeding.

### Phase 2: Parallel Planning

After context is gathered, spawn TWO parallel planning tasks. Each planner works independently to create an implementation plan.

**Planner A Task:**

```
Based on the codebase context gathered above, create an implementation plan for: [USER'S REQUEST]

Your plan should include:
1. Step-by-step implementation approach
2. Files to create or modify (with brief description of changes)
3. Order of operations (what depends on what)
4. Testing strategy
5. Potential risks or edge cases
6. Estimated complexity (low/medium/high)

Be specific and actionable. Reference actual file paths from the context.
```

**Planner B Task:**

```
Based on the codebase context gathered above, create an ALTERNATIVE implementation plan for: [USER'S REQUEST]

Think differently from a typical approach. Consider:
- A different architectural approach
- Alternative patterns that might fit better
- Trade-offs between simplicity and extensibility
- Different ways to structure the changes

Your plan should include:
1. Step-by-step implementation approach
2. Files to create or modify (with brief description of changes)
3. Order of operations (what depends on what)
4. Testing strategy
5. Potential risks or edge cases
6. Estimated complexity (low/medium/high)

Be specific and actionable. Reference actual file paths from the context.
```

### Phase 3: Consolidation

After both plans are complete:

1. Compare the two approaches
2. Identify strengths and weaknesses of each
3. Determine if one plan is clearly superior, or if elements should be combined
4. Create a consolidated final plan

### Phase 4: User Approval

Present the consolidated plan to the user in this format:

```markdown
## Implementation Plan for: [Feature/Bug/Improvement]

### Summary

[Brief overview of the recommended approach]

### Why This Approach

[Explanation of why this plan was chosen over alternatives]

### Implementation Steps

1. **Step Name**
   - Files: `path/to/file.ts`
   - Changes: [Description]
   - Dependencies: [What must be done first]

2. **Step Name**
   ...

### Testing Strategy

[How to verify the implementation works]

### Risks and Mitigations

[Potential issues and how to handle them]

### Alternative Approach Considered

[Brief summary of the other plan and why it wasn't chosen]

---

**Ready to implement?** Please review this plan and let me know if you'd like to:

- Proceed with implementation
- Modify the approach
- Explore the alternative plan in more detail
- Ask questions about specific steps
```

## Instructions

1. **Receive the user's request** for a feature, bug fix, or improvement
2. **Spawn the context-gathering agent** using the Task tool with the agent file at `.claude/agents/gather-codebase-context.md`
3. **Wait for context gathering to complete** - this provides the foundation for planning
4. **Spawn two parallel planning tasks** that independently analyze the context and propose implementations
5. **Consolidate the plans** by comparing approaches and combining the best elements
6. **Present the final plan** to the user and await approval
7. **Do NOT implement** until the user explicitly approves

## Examples

### Example 1: New Feature

**User**: "Help me implement a new authentication flow with OAuth"

**Action**:

1. Spawn context agent to research existing auth code, user models, API routes, frontend login components
2. Planner A might propose extending the current auth system
3. Planner B might propose a separate OAuth service layer
4. Consolidate and present the best approach for user approval

### Example 2: Bug Fix

**User**: "Fix the performance issue in the dashboard"

**Action**:

1. Spawn context agent to research dashboard components, data fetching, state management, API calls
2. Planner A might identify specific bottlenecks and propose targeted fixes
3. Planner B might propose architectural changes for better performance
4. Consolidate findings and present prioritized fix recommendations

### Example 3: Refactoring

**User**: "Refactor the API client to use a new pattern"

**Action**:

1. Spawn context agent to map all API client usage, type definitions, error handling
2. Planner A might propose incremental refactoring
3. Planner B might propose a clean rewrite with migration path
4. Consolidate and present the safest, most effective approach

### Example 4: Adding Capability

**User**: "I need to add a dark mode feature"

**Action**:

1. Spawn context agent to research styling system, theme configuration, component patterns
2. Planner A might propose CSS variables approach
3. Planner B might propose a theme provider pattern
4. Consolidate based on existing codebase patterns

## Best Practices

- **Always gather context first** - Never plan without understanding the codebase
- **Keep plans actionable** - Each step should be clear enough to implement
- **Reference actual files** - Use real paths from the context gathering phase
- **Consider testing** - Every plan should include how to verify success
- **Identify dependencies** - Make clear what must be done in what order
- **Surface risks early** - Better to discuss concerns before implementation
- **Respect existing patterns** - Plans should align with codebase conventions
- **Wait for approval** - Never implement without explicit user confirmation

## Trigger Contexts

This skill should activate when users:

- Ask for help implementing a new feature
- Request help fixing a bug that requires codebase understanding
- Want to refactor or improve existing code
- Need to add new capabilities to the system
- Ask for a plan before making changes
- Mention needing to understand the codebase before changing it
- Use phrases like "help me implement", "I need to add", "fix the issue with", "refactor the"
