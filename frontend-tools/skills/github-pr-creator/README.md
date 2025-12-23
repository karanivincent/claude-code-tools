# GitHub PR Creator

Create professional pull requests with focused descriptions, CI status monitoring, and Slack announcement generation.

## When to Use

- Creating a new pull request
- Pushing changes and opening a PR
- Writing PR descriptions
- Announcing PRs to the team

## Workflow

1. **Check for Existing PR** - Updates description if new commits exist
2. **Analyze Changes** - Reviews commits and changed files
3. **Write Focused Description** - Main changes only, no minor fixes
4. **Create PR** - Uses `gh pr create` targeting the `dev` branch
5. **Wait for CI** - Monitors build status with `gh pr checks --watch`
6. **Generate Slack Message** - Uses `slack-pr-message` skill for announcement

## What to Include

- Primary feature being added
- Main bug being fixed
- Key architectural changes
- Breaking changes (if any)

## What NOT to Include

- Minor bug fixes encountered during development
- Typo fixes
- Small refactors made along the way
- Debug commits

## Best Practices

- Use imperative mood for titles ("Add feature" not "Added feature")
- Be concise but complete in descriptions
- Include specific testing instructions
