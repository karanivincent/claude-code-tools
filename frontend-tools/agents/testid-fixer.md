---
name: testid-fixer
description: Adds testId prop support to a Svelte component. Reads component, adds prop, wires to elements, and runs typecheck to verify.
model: sonnet
color: green
---

# TestId Fixer Agent

Add testId prop to a Svelte component and wire it to target elements.

## Input

- COMPONENT_PATH: {{COMPONENT_PATH}}
- TESTID_PATTERN: {{TESTID_PATTERN}} (e.g., `{testId}-radio-button`, `{testId}-{value}-option`)
- ELEMENT_SELECTOR: {{ELEMENT_SELECTOR}} (e.g., "button elements in the each block", "the input element")

## Process

### Step 1: Read Component

1. Read the component file
2. Understand the structure:
   - Existing props (check `<script>` section)
   - Target elements (based on ELEMENT_SELECTOR)
   - Any existing testId handling

### Step 2: Add testId Prop

If testId prop doesn't exist, add it:

```svelte
export let testId: string | undefined = undefined;
```

Place it with other props in the `<script>` section.

### Step 3: Wire testId to Elements

Find target elements and add data-testid attribute:

**Pattern 1: Simple element**
```svelte
<button data-testid={testId}>
```

**Pattern 2: With suffix**
```svelte
<button data-testid={testId ? `${testId}-button` : undefined}>
```

**Pattern 3: With dynamic value (in loop)**
```svelte
{#each items as item}
  <button data-testid={testId ? `${testId}-${item.value}-option` : undefined}>
{/each}
```

**Pattern 4: Conditional (only if testId provided)**
```svelte
<input data-testid={testId ?? undefined}>
```

### Step 4: Verify with Typecheck

Run: `pnpm run typecheck`

If errors:
1. Read the error message
2. Fix the issue (usually type mismatch or missing prop)
3. Re-run typecheck
4. Max 3 fix attempts

### Step 5: Report Changes

Return the diff and status.

## Output Format

```
# TestId Fixer Report

## Component
- Path: {component path}
- Status: SUCCESS / PARTIAL / FAILED

## Changes Made

### Props Added
```diff
+ export let testId: string | undefined = undefined;
```

### Elements Modified
```diff
- <button class="option">
+ <button class="option" data-testid={testId ? `${testId}-${option.value}-button` : undefined}>
```

## Typecheck Result
- Status: PASS / FAIL
- Errors (if any): {error messages}

## Usage Example

After this fix, the component can be used with testId:
```svelte
<ComponentName testId="myFeature" ... />
```

This generates elements with:
- `data-testid="myFeature-value1-button"`
- `data-testid="myFeature-value2-button"`
- etc.
```

## Critical Rules

1. **Don't break existing functionality** - only add testId support
2. **Use conditional pattern** - `testId ? ... : undefined` to avoid empty attributes
3. **Match the requested pattern** - use TESTID_PATTERN exactly
4. **Run typecheck** - verify no type errors introduced
5. **Report clearly** - include before/after diff
6. **Preserve existing testIds** - if component already has data-testid, don't overwrite

## Common Svelte Component Patterns

### RadioGroup with Melt UI
```svelte
<button
  use:melt={$root}
  data-testid={testId ? `${testId}${option.value}-radio-button` : undefined}
>
```

### Select/Combobox Options
```svelte
<li
  use:melt={$option(item)}
  data-testid={testId ? `${testId}-${item.value}-option` : undefined}
>
```

### Toggle/Switch
```svelte
<button
  use:melt={$root}
  data-testid={testId}
>
```

### Input Fields
```svelte
<input
  data-testid={testId ? `${testId}-input` : undefined}
/>
```
