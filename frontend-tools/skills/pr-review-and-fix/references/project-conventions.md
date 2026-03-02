# Yond Project Conventions

## Path Aliases

| Alias | Maps to |
|-------|---------|
| `$lib` | `src/lib` |
| `$components` | `src/lib/components` |
| `$utils` | `src/lib/utils` |
| `$models` | `src/lib/models` |
| `$i18n` | `src/i18n` |
| `$routes` | `src/routes` |
| `$root` | project root |

**Rule:** Never use `$root/src/lib` - use `$lib` instead.

## Internationalization

- Uses **typesafe-i18n** with `$LL` store
- All user-facing strings must use translations
- Languages: German (de), English (en)

```svelte
<!-- Wrong -->
<button>Submit</button>

<!-- Correct -->
<button>{$LL.common.submit()}</button>
```

## Null vs Undefined

- Use `null` for explicit absent values
- Use `??` instead of `||` for null/undefined fallbacks
- `||` treats `0`, `''`, `false` as falsy

```typescript
// Wrong
const name = value || '';

// Correct
const name = value ?? '';
```

## Boolean Naming

- Prefer positive names: `visible` not `hidden`
- Use prefixes: `isX`, `hasX`, `shouldX`, `canX`
- State vs action: `qrReaderVisible` (state) not `showQRReader` (action)

## Function Naming

- verbs for functions: `fetchUser`, `validateInput`, `formatDate`
- Match name to behavior: `sortByName` not `sortByWorkHours` if sorting alphabetically

## Constants

- SCREAMING_SNAKE_CASE for true constants
- Extract magic numbers: `MAX_ITEMS`, `DEFAULT_PAGE_SIZE`
- Use `DEFAULT_COLOR_VALUE` for fallback colors

## File Organization

| Type | Location |
|------|----------|
| API services | `src/lib/api/services/` |
| Form schemas | `src/lib/formSchemas/` |
| Utility functions | `src/lib/utils/` (by domain: `financeUtils`, `dateUtils`) |
| Stores | `src/lib/stores/` |
| Components | `src/lib/components/` (atoms/molecules/organisms) |

## Component Patterns

- Y-prefixed: Form-integrated (`YTextField`, `YForm`)
- Meltui-prefixed: Melt UI wrappers
- Cell suffix: Table cells (`TextCell`, `DateCell`)

## Type Safety

- Explicit return types on exported functions
- Use generated types from `$lib/generated/api.ts`
- Use enums over string literals: `AppointmentStatus.DECLINED` not `'DECLINED'`
- Add JSDoc for exported functions

## Existing Utilities

Before creating new utilities, check for existing ones:

| Utility | Location |
|---------|----------|
| `defaultEmptyValue` | `$utils/selectUtils` |
| `classNames` | `$utils/controlUtils` |
| `formatDate` | `$utils/dateUtils` |
| `goBack` | `$utils/generalUtils` |
| `defaultGlobalSuccess` | `$utils/messageUtils` |

## Generated Code

- API types: `pnpm run generate:api-types`
- Zod schemas: `pnpm run generate:zod-schemas`
- Combined: `pnpm run generate:api-types-and-zod-schemas`
