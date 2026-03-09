# Verification Checks

Detailed structural checks for Phase 3. For each check, collect findings with severity.

## 1. Token Compliance

For each row in the breakdown's token tables (`Property | Figma Token | Project Class`):

1. Read the component source file
2. Search for the expected `Project Class` value
3. If not found, check for:
   - A different class that serves the same purpose (wrong token)
   - A hardcoded value where a token should be (e.g., `text-slate-700` instead of `text-toned-accent-bold`)
   - The property not being set at all (missing)

**Severity:**
- Critical: wrong typography utility, wrong background/text color token
- Medium: wrong spacing class (off by one step)
- Low: equivalent but non-canonical class used

## 2. Content Order

For each state in the state matrix that specifies element positioning:

1. Read the component template
2. Trace the rendering order of elements
3. Check for conditional reordering logic (e.g., `{#if isBooked}` blocks that change element sequence)
4. Verify the order matches the state matrix for EACH state

**Common pattern to check:** Elements that swap positions between states. For example, if the state matrix says:
- Default: `CTA → Description`
- Booked: `Description → CTA`

Then the template must have conditional rendering that changes the order, not just show/hide.

**Severity:**
- Critical: elements in wrong order for any state
- High: conditional ordering logic exists but is inverted

## 3. Designer Notes Compliance

For each designer note in the breakdown:

1. Parse the note into a testable assertion
2. Find the corresponding code

**Examples of note → assertion:**

| Designer Note | Code Assertion |
|---|---|
| "Notes: always displayed in full, never truncated" | No `line-clamp`, `truncate`, or `overflow-hidden` on notes element |
| "Location: one-line only, truncated" | Has `truncate` or `line-clamp-1` on location text |
| "CTA font-weight changed from semibold to bold" | Uses `yond-text-m-bold` not `yond-text-m-semibold` |
| "If location is both: displayed on one line" | Parent uses `flex-row` not `flex-col`, child text has `truncate` |
| "Cancel CTA at bottom of content, NOT sticky/floating" | No `sticky` or `fixed` class on cancel button |
| "Once user clicks Book, status changes to Booked" | Mutation handler invalidates query / updates state |

**Severity:**
- Critical: behavior contradicts the note entirely
- High: partially implemented (e.g., truncation exists but is character-based instead of line-based)
- Low: spirit matches but minor detail differs

## 4. Dead Code & Cleanup

### 4a: Code behind unresolved blockers

Check the breakdown's "Dependencies > Blocking" and "Risks" sections for unresolved items. Then search the implementation for code that depends on those unresolved items.

**Example:** If the breakdown says "Hero image — API field does not exist yet" and the component has a hero image section that renders conditionally on a prop that's never passed — that's dead code.

**Severity:** Medium (not broken, but adds maintenance burden)

### 4b: Stale i18n keys

When a component was "Reworked":

1. Read `messages/en.json` and find keys with the component's prefix (e.g., `classDetail_*`)
2. For each key, grep all `.svelte` files for usage
3. Keys not referenced anywhere are stale

**Severity:** Medium

### 4c: Unused props

Check for props declared in the component that are:
- Never read in the template or script
- Passed by parent components but marked with eslint-disable comments

**Severity:** Low

## 5. Cross-Page Consistency

When the breakdown's component hierarchy shows a shared component used in multiple routes:

1. Read each route file that uses the shared component
2. Compare the props passed from each route
3. Check for inconsistencies:

| Check | What to compare |
|---|---|
| Props passed | Are the same props used? Are any missing from one route? |
| CTA styling | Same button variant, colors, sizes across routes? |
| Data derivation | Same field mapping from API response to display values? |
| State handling | Same loading/error/empty states? |

**Severity:**
- High: visually noticeable inconsistency (different button style, missing data)
- Medium: functional inconsistency (different error handling)
- Low: prop naming or derivation differences
