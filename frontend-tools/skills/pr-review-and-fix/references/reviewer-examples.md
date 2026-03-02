# Reviewer Examples

Real comments from Nicolas and Vincent (2,768 total). Use these as style and detection examples.

## Debug Code

**Vincent (direct style):**
> remove console.log

> clean up console.logs

> Looks like there's a leftover console.log

**Nicolas (with context):**
> no console.log statements before merging

---

## Type Safety

**Vincent:**
> Loss of type safety (was using enum)

> validationConfig should have a defined interface

**Nicolas:**
> return type missing

> type?

---

## Import Paths

**Nicolas:**
> use $lib

> $lib instead of $root

> would prefer starting with $lib as utils and stores are not directly related

> don't use relative imports if things are not really hard related

---

## Internationalization

**Nicolas:**
> i18n, also for other elements in this array

> Translation missing

> 'Select' should come from i18n, right?

**Vincent:**
> Add translations here and other places throughout the file

> translations here and several other places in this file

---

## Naming Conventions

**Nicolas:**
> would prefer if we rather use positive names like visible otherwise it ends in double negation

> naming convention needs to be agreed.. somethings I see selectAAA then randomAAA or randomSelectedAAA

> name is rather like a function due to naming verb + noun. Maybe rather qrReaderVisible - that is more a state?

**Vincent:**
> From the names doesn't feel like a boolean more like an array

> Misleading function name - it sorts alphabetically by name, not by work hours. Consider renaming to sortStaffAlphabetically

---

## Code Reuse / DRY

**Nicolas:**
> those 4 lines seem repeatedly used, maybe we put them in some cleanSearchResults() function

> Seeing a repeating pattern using: 1. convertLimitsObjectToArray 2. getValueLimitFieled 3. getLimitValue

**Vincent:**
> duplicated logic here and line 212-217. extract to a function

---

## Null/Undefined Handling

**Nicolas:**
> I think we had that discussion before, please use null

> that could be null / undefined, if we allow any string

> just use ==, example: if (value == null) return undefined;

**Vincent:**
> we use null rather than undefined

> Should use ?? instead of || here

---

## Security

**Nicolas:**
> secrets should not be in GIT

> this looks like an API key - should be in .env.secret

> be careful not to log sensitive user data

---

## Error Handling

**Nicolas:**
> let's please put a try / catch around.. arguments might not have a : inside

> JSON.stringify can throw exceptions. I think we recently implemented a function which has try/catch inside

> that could be null / undefined, if we allow any string

**Vincent:**
> Missing error handling for the API call

> What happens if this throws? Need a try/catch

---

## Magic Values

**Nicolas:**
> have the 150 as external variable with default = 150

> default language we should take from some global default

> wonder if the naming should be DEFAULT_COLOR_VALUE as it is a true const definition

**Vincent:**
> Hardcoded color should be a constant, either declaring what color it is or what's it's purpose

> Let's add the default number `12` to a more configurable location like the `defaults.ts` file

---

## Code Organization

**Nicolas:**
> put in separate function

> function should be not in generalUtils.. maybe financeUtils

> should be not within admin

**Vincent:**
> Add the mock data in an external `.ts` file and import

---

## Documentation

**Nicolas:**
> please add some JSDoc

> As mentioned earlier, we should have JSDoc for any export properties

**Vincent:**
> If this is meant to be a reusable utility function, please add some jsdoc

> Add a brief description of what this component does

---

## API Consistency

**Nicolas:**
> I wonder if we take it even from generated API directly?

> probably should talk to API as this seems inconsistent

> in Notion we say to check for contract.status === Status.INACTIVE why different rule here?

**Vincent:**
> shouldn't this just come from `StaffGetAllPaginatedParams` that has all the options, rather than adding one by one?

---

## Redundant Code

**Nicolas:**
> If we want to keep that commented code then we should add a reason why, otherwise delete

> why don't use the editDataPromises as defined below? Seems a bit redundant

**Vincent:**
> $formData.start_ts ?? $formData.start_ts is redundant - it checks the same value twice

---

## Synthesized Style

Combine Nicolas's educational depth with Vincent's direct actionability:

1. **State the issue clearly** (Vincent style)
2. **Explain why it matters** (Nicolas style)
3. **Provide a code example** (both styles)

**Example synthesized comment:**
> Remove console.log before merging. Debug code in production can expose sensitive data and clutters logs.
