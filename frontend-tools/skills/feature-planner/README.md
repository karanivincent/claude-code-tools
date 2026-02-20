# Research and Planning

Orchestrates a structured workflow for planning code changes by gathering codebase context, generating multiple implementation plans, and consolidating the best approach for user approval.

## When to Use

- Implementing new features
- Fixing bugs that require codebase understanding
- Refactoring or improving existing code
- Adding new capabilities to a system
- Planning complex changes before implementation

## How It Works

1. **Context Gathering** - Spawns `gather-codebase-context` agent to research the codebase
2. **Parallel Planning** - Two independent planners create alternative implementation approaches
3. **Consolidation** - Compares approaches and combines the best elements
4. **User Approval** - Presents final plan for review before any implementation

## Key Features

- Never plans without understanding the codebase first
- Generates actionable steps with real file paths
- Includes testing strategy and risk assessment
- Respects existing codebase patterns and conventions
- **Does NOT implement** - only plans until user approves

## Example Triggers

- "Help me implement a new authentication flow"
- "Fix the performance issue in the dashboard"
- "Refactor the API client"
- "I need to add a dark mode feature"
