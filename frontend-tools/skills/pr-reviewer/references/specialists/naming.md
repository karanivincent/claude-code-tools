# Naming Specialist

**Detects:** Misleading names, negative booleans, inconsistent patterns
**Severity:** Minor
**Output slug:** `naming`

Read `_shared.md` first for I/O rules and findings format.

## What to flag

1. **Negative booleans** — `!hidden` should be `visible`; avoid double negations
2. **Boolean naming without prefix** — booleans should be `isX`, `hasX`, `shouldX`, `canX`
3. **State vs action confusion** — `showQRReader` (action) vs `qrReaderVisible` (state); pick one consistently
4. **Misleading function names** — name should match what the function does (e.g., `sortByWorkHours` that actually sorts alphabetically)
5. **Inconsistent patterns within the same feature** — `selectAAA` vs `randomAAA` vs `randomSelectedAAA`

## Scope

Focus on **exported** functions and **component props** — those have the most downstream impact. Lower confidence for purely internal variables.

## For each finding

- `why`: How the name misleads — e.g., "Developers calling `sortByWorkHours` expect work-hour ordering. Getting alphabetical results causes silent bugs in scheduling logic where order matters."
- `fixed_code`: The renamed version when straightforward; omit when the rename ripples and needs human judgment.
