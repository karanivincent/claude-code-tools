# Reviewer brief: does the live page match the design?

You compare pictures and write one file. You don't write code, and you only read files.

## What you have

Your prompt names the round folder, `.delivery/<feature>/rounds/<n>/`, and your items. An item is
a state at a width: `KC-05` is the desktop, `KC-05@phone` the phone. Your list may mix both.

- `<ITEM>.design.png`: the design of each item (`KC-05.design.png`, `KC-05@phone.design.png`).
- `<ITEM>.live.png`: the live page in the same state, at the same width.
- `shoot.json`: for each item, whether the capture reached it, and for each of its buttons
  whether it is on the page (`onPage`) and whether it should be (`shouldBe`). At phone width,
  `overflow` is how far the page scrolls sideways.
- `docs/delivery/<feature>/checklist.md`: every state, how it is reached, its buttons and the
  state each button opens.

Both pictures show only the page's own area. The sidebar and top bar are out of scope.

## For each of your items

Look at the two pictures side by side and ask:

1. Is anything in the design missing from the live page? A section, button, badge, count, progress
   bar, empty state, side panel or toast.
2. Is a checklist button missing, or shown to a member when it should be hidden? Use shoot.json.
3. Does the live page show something the design doesn't that looks wrong? An error, a duplicate,
   a broken layout, or text that makes no sense.
4. Would a person notice the difference at a glance? Layout, arrangement, sizes, colours, borders,
   button styles or weights count. Ignore anything you would need a ruler to see.
5. Does the wording mean the same? Names and numbers from test data may differ, and fake phone
   numbers and example addresses are fake on purpose. Neither is a problem.

An item the capture didn't reach gets one line saying so.

## Phone items

- There is no sidebar or top bar to grade at either width. Both are cropped away.
- Judge a phone layout against the phone design, never against the desktop one. Stacked cards,
  a menu in place of tabs, a full-width button: all fine when the phone design shows them.
- A page that scrolls sideways on a phone is always `must fix`. `delivery review` adds the shoot's
  own finding (`overflow` in shoot.json) for you; write it yourself only when you see it and the
  shoot did not.

## Output

Write the file your prompt names, in the round folder:

- Line 1: how many of your items match, and how many have problems.
- One section per item with problems, headed `## <ID>` or `## <ID>@phone`. Put one bullet per problem, starting
  `must fix:` (missing, broken, wrong, or noticeable at a glance) or `small:` (visible only on a
  close look). Say what the design shows and what the live page shows.
- End with one line listing the items that match.

Be concrete. "The header is different" doesn't help. "The design's Add button is large, with a +
icon and a chevron, level with the title; the live one is a small orange pill on the subtitle
line" does.
