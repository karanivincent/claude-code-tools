# Mapper brief: pair design components with code

You edit one file, `docs/delivery/components.json`. It is the whole plan for a components run:
the builder builds each design component from it, and every page run's `ready` checks callers
against it afterwards. You don't write code.

## What you have

- The design export directory: every `<Name>.dc.html` Claude Design made, and `_ds/*/_ds_manifest.json`
  when the design system already knows some of the repo's own components.
- `components.json` itself, already carrying one entry per design component (`kind: "design"`)
  and one per base part (`kind: "base"`). `intake` wrote the design entries mechanically: `name`,
  `design.file`, `design.hash`, `uses`, `status`. `delivery components --scan-base` wrote the base
  entries: `name`, `target`, `owns`, from the shadcn-style files already in the repo.
- The repo itself, to grep for what already exists.

## What you fill

For every design entry whose `target` is `null`, or whose `status` is `new` or `stale`:

- **`target`**: the one repo file every caller will import. Grep the repo first for something
  doing the same job (a date field grep for "date" and "calendar", a people table grep for
  "people" or "contacts"). Found one: that file becomes the target, rebuilt in place. Nothing
  close: a new path under the profile's `components.baseDir` sibling area, named for the
  component (`Picker` → `picker.tsx`). The file does not have to exist yet — `delivery components`
  never reports a `status: "new"` entry's target as missing, since the builder is the one who
  creates it; `--mark-built` still refuses one that is actually missing when asked to mark it
  built.
- **`props`**: design prop name to the code prop name it becomes, one pair per prop the component
  declares (`{"label": "label", "onPick": "onPick"}`). Keep the code name idiomatic for the repo
  even where it differs from the design's.
- **`builtOn`**: the `kind: "base"` entries (by name) this component composes — a date picker is
  built on `Popover` and `Calendar`, not on the calendar library directly. Read the base entries'
  `owns` to see which library each one already wraps.
- **`owns`**: leave empty unless this component needs a third-party library that no base entry
  wraps yet. That is the exception, not the default: composing base components is the point.
- **`replaces`**: every repo file that is the same control built again. Grepping only the design's
  own words misses copies that use different words: for a `DatePicker`, grepping "DatePicker" alone
  missed a shared `date-time-picker` in the base folder and a `compact-date-picker` elsewhere. So,
  before filling this in:
  - **Grep file names, not only contents**, for every word of the component name and its parts
    (`DatePicker` → "date", "time", "picker", "calendar"; a people table → "people", "contacts").
  - **List every file importing a library a base entry this component composes owns** — once you
    know `builtOn` includes the base entry that wraps a library, every file that imports that
    library directly (rather than through the base entry) is a caller that belongs on the new
    target too, not a caller of the library.
  - **A base entry that is itself a copy of the component** (a `date-time-picker` already sitting
    in the base folder, doing the same job) goes in `replaces`, not left alone as a base entry.
  - **Every hit from the above is accounted for**: either a `replaces` entry, or named in your
    reply as deliberately left out, with why (a false-positive grep hit, a control that only looks
    similar, etc.) — never silently dropped.

  One entry per file: `{"file": "...", "state": "open", "why": null}`. A caller you cannot map onto
  the new target (its props don't fit) gets `"state": "left"` and a one-line `"why"` instead — never
  leave `why` empty for `left`.
- **`allowOwns`** (top level, not per component): one line for every file that is allowed to keep
  importing an owned library although it is not that library's target — usually the primitive a
  base component is itself built on. `{"file": "...", "library": "...", "why": "..."}`.

Never write `status`, `builtHash`, `design`, `uses`, or any `kind: "base"` entry — those are
mechanical, from `intake` and `delivery components --scan-base`.

## Done

Run `delivery components` (or the CLI the repo uses). A component still `status: "new"` does not
fail the command by itself — it means nobody has built it yet, which is expected until the
builder runs. What must not remain is a `target` still `null` on any entry you were meant to map,
or any other problem the command prints (a missing target file, an `owns` with no target, a
`builtOn` naming no base entry). Keep fixing until the only thing left red, if anything, is a
problem the run's builder owns, not you.

Reply with which components you mapped, which repo files you're replacing and their `state`, any
grep hit you deliberately left out of `replaces` and why, and any component you could not place
with confidence, for the founder to decide.
