# delivery-tools: state (released 2026-09-23)

Released from `main` of this marketplace after the seeded-defect rehearsal of spec section 20.5.
How to install, start a run and keep it current: `docs/OPERATING.md`.

This directory is a public repository. No consuming project's name, numbers or UI text goes into
it: `tests/core/ownership.test.mjs` fails on any that do. A project's own values belong in its
profile, in that project's repository (spec section 18).

## Where things are

| What | Where |
|---|---|
| The code | this folder, on `main` |
| The normative spec (`SPEC-v2.md`), its decisions page and four reviews | the first consuming project's repository, `docs/delivery/plugin-record/spec/`, because they cite that project's pages |
| The build record: briefs, slice reports, pressure-test records, the rehearsal log | the same repository, `docs/delivery/plugin-record/build/` |
| The private replay set (real artefacts of one build that went wrong; never commit it here) | the same repository, `docs/delivery/replay/scripts-build/`, driven by its `scripts/delivery/replay.mjs` |

## Test state, 2026-09-23

```
node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'
```

554 tests: 540 pass, 0 fail, 14 skipped (the replay tests, which need the private replay set).
One run in five on 2026-09-23 showed a single failure that did not reproduce and did not name
itself in the summary; recorded, not explained.

## The Trust rule

- **20.2 passed on 2026-09-21**: ten rows, each a test against a real recorded artefact
  (`tests/core/spec-20-2.test.mjs` ties the spec's table to them).
- **20.5 passed on five of seven defects on 2026-09-23.** Defects 4 (a stale base) and 7 (a removed
  capability) need a baseline, which only a redesign has, so they are proven on the first real run
  that is a redesign, when its request asks for them. The rehearsal found 57 bugs across the CLI,
  the checks, the capture harness and the protocol between the session and its agents; each is
  fixed with a test, and each is in the rehearsal log.

M5 and M6 stay advisory until they are replayed on DOM captures of an old preview.

## Known defects, not yet fixed

- **The raw-seed guard fires on any inline code containing the word.** `lib/run/hook-match.mjs`
  classifies `node -e <code>` as a seed whenever the program text contains the substring `seed`
  anywhere: a filename, a unit id, a comment, a quoted string, or a plan field such as `seeded`.
  The module's own header promises the opposite ("quoted text ... never counts"). It is a safety
  guard, so it is narrowed only in its own commit, with a test pinning the case it should no longer
  catch. Until then, put inline code that mentions it in a file and run the file.

## How to continue cheaply

At most three or four agents at once, sonnet for narrow tasks. Every fix needs a version bump and a
release before any session sees it (`docs/OPERATING.md`).
