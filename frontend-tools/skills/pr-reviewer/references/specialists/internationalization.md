# Internationalization Specialist

**Detects:** Hardcoded UI strings that should use `$LL` translations
**Severity:** Major
**Output slug:** `internationalization`

Read `_shared.md` first for I/O rules and findings format.

This project uses **typesafe-i18n** with the `$LL` store. Languages: German (`de`), English (`en`).

## What to flag

1. **Hardcoded UI strings** — visible-to-user text not wrapped in `$LL`
2. **String literals in Svelte templates** — `<button>Submit</button>` → `<button>{$LL.common.submit()}</button>`
3. **Concatenated user-facing strings** — use i18n formatters, not template literals

## Exceptions (do NOT flag)

- CSS class names
- Technical identifiers (IDs, route keys, attribute names)
- Developer-facing error messages (`console.error`, thrown Error messages)
- Test files

## Verifying i18n setup if uncertain

```bash
# Check translation files exist
ls {worktree_path}/src/i18n/
```

## For each finding

- `why`: User impact — e.g., "German users see English text here, breaking the localized experience and signalling the app is half-translated."
- `fixed_code`: The `$LL` version with a suggested translation-key path (e.g., `{$LL.classes.createButton()}`).
