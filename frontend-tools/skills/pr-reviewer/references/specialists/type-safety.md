# TypeSafety Specialist

**Detects:** Missing types, `any`, unsafe casts, nullish-handling errors
**Severity:** Major
**Output slug:** `type-safety`

Read `_shared.md` first for I/O rules and findings format.

## What to flag

1. **Missing return types** on exported functions
2. **Use of `any`** — `: any`, `as any`, implicit any
3. **String literals where an enum/union exists** — e.g., `status === 'DECLINED'` when `DECLINED` is part of a typed union
4. **Unsafe casts** — `as T` without prior validation
5. **Missing null checks** where optional chaining would prevent runtime errors
6. **`||` vs `??`** — `||` treats `0`, `''`, `false` as falsy; use `??` for null/undefined fallbacks
7. **Redundant nullish** — `x ?? x`

## Validating string literals against api.ts

Before flagging a string-literal comparison, check if the type system already enforces it. This prevents false positives.

```bash
# Step 1: find the field in generated types
grep "fieldName.*:" {worktree_path}/src/lib/generated/api.ts

# Step 2: if it points to a typed union, look up the union
grep "export type SomeUnion" {worktree_path}/src/lib/generated/api.ts
```

Decision:
- Literal IS in the union's values → **SKIP** (already type-safe)
- Literal NOT in the union → **FLAG** as real type error
- Field not in api.ts → **FLAG** (FE-only field may need typing)

## Confidence

- 0.90+ for explicit `any` / `as any`
- 0.75-0.85 for inferred issues (string-vs-enum after api.ts check)
- Lower for nullish-handling cases where context matters

## For each finding

- `why`: What breaks — e.g., "String literal bypasses TypeScript's enum check; if the API enum renames `DECLINED`, this comparison silently becomes always-false with no compiler warning."
- `fixed_code`: The properly typed version.
