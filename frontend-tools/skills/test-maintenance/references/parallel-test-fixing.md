# Parallel Test Fixing with Git Worktrees

Fix multiple independent failing tests concurrently using agents in isolated worktrees.

## When to Use

- 3+ tests failing with independent root causes
- Tests don't share state or modify same files

## Workflow

1. Create worktree per test: `git worktree add .worktrees/fix-<name> -b fix/<name>`
2. Dispatch agent per worktree (max 3 parallel)
3. Each agent: diagnose → fix → verify → commit
4. Merge successful fixes, cleanup worktrees

## Agent Prompt Template

```
You are fixing a failing E2E test in an isolated git worktree.

WORKTREE PATH: <worktree-path>
TEST FILE: <test-file-path>
BRANCH: <branch-name>

WORKFLOW:
1. cd <worktree-path>
2. pnpm install
3. Run failing test: pnpm run test:e2e:staff -- <test-file-path>
4. Diagnose failure (read error, check component)
5. Fix the test
6. Verify: pnpm run test:e2e:staff -- <test-file-path>
7. If passing: git add -A && git commit -m "Fix <test-name>"
8. If failing after 2 attempts: Report FAILURE, don't commit

Work ONLY in worktree directory. See references/patterns.md for utilities.
```

## Cleanup

**Success:**
```bash
git merge fix/<name> --no-ff
git worktree remove .worktrees/<name>
git branch -d fix/<name>
```

**Failure:**
```bash
git worktree remove .worktrees/<name> --force
git branch -D fix/<name>
```

## Limits

| Constraint | Value |
|------------|-------|
| Max parallel agents | 3 |
| Max fix attempts | 2 |
| Worktree location | `.worktrees/` |
