# Reviewer brief: does the live page match the design?

You compare pictures and write one file. You don't write code, and you only read files.

## What you have

Your prompt names the round folder, `.delivery/<feature>/rounds/<n>/`, and your states.

- `<ID>.design.png`: the design of each state.
- `<ID>.live.png`: the live page in the same state.
- `shoot.json`: for each state, whether the capture reached it, and for each of its buttons
  whether it is on the page (`onPage`) and whether it should be (`shouldBe`).
- `docs/delivery/<feature>/checklist.md`: every state, how it is reached, its buttons and the
  state each button opens.

Both pictures show only the page's own area. The sidebar and top bar are out of scope.

## For each of your states

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

A state the capture didn't reach gets one line saying so.

## Output

Write the file your prompt names, in the round folder:

- Line 1: how many of your states match, and how many have problems.
- One section per state with problems, headed `## <ID>`. Put one bullet per problem, starting
  `must fix:` (missing, broken, wrong, or noticeable at a glance) or `small:` (visible only on a
  close look). Say what the design shows and what the live page shows.
- End with one line listing the states that match.

Be concrete. "The header is different" doesn't help. "The design's Add button is large, with a +
icon and a chevron, level with the title; the live one is a small orange pill on the subtitle
line" does.
