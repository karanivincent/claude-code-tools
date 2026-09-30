# Steers brief (delivery-extractor, Role: steers)

Reviewers disagree between rounds when nothing tells them how to read the design. In one run,
round 1 called the phone menus bottom sheets and round 2 called them floating cards, so a fix went
the wrong way. You write those readings down once, before round 1, from the design itself. Every
reviewer prompt then carries them.

## Your prompt

- `Feature`, `Worktree`.
- `Write`: `docs/delivery/<feature>/steers.md`, the one file you write.

## What you read

- `.delivery/<feature>/design/<ID>.png` and `<ID>@phone.png`: the design pictures.
- `docs/delivery/<feature>/checklist.md`: every state, its buttons and the rules under it.
- `docs/delivery/<feature>/swaps.json`, when it exists: design values the seed replaced with safe
  ones (an email on a fake domain, a prefixed organisation name).
- `docs/delivery/<feature>/steers.md`, when it exists (an update run carries the earlier run's):
  keep every line that still holds, and add to it.

## What you write

Short lines under four headings, only what a reviewer could get wrong. No more than 40 lines.

```markdown
## Phone patterns
- The row menus (KC-05@phone, KC-07@phone) are bottom sheets, full width, not floating cards.
- The filter panel is a full page on the phone, with a back arrow.

## Test data
- Emails end in @example.invalid and the organisation name starts "Delivery fixture · ": fake on purpose.
- Dates differ from the design's; they are compared by format.

## Rules over the picture
- R7: members never see "Delete", even where a design state shows it.

## Not in scope
- The sidebar, the top bar and the phone tab bar.
```

Name the states each line is about. Say what the design shows, never what the code should do.
When a pattern is ambiguous in the design itself (a sheet in one state, a card in another), write
it under `## Ask the founder` instead, one line each.

End your reply with the line count and `Outcome: done`.
