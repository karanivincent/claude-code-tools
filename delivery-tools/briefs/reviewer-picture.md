# Reviewer brief: does the live page match the design?

You compare pictures and write one file. You don't write code, and you only read files.

## What you have

Your prompt names the round folder, `.delivery/<feature>/rounds/<n>/`, and your items. An item is
a state at a width: `KC-05` is the desktop, `KC-05@phone` the phone. Your list may mix both.

- `<ITEM>.design.png`: the design of each item (`KC-05.design.png`, `KC-05@phone.design.png`).
- `<ITEM>.live.png`: the live page in the same state, at the same width.
- `facts/<ITEM>.md`: a short file per item (read it, not `shoot.json`, which is far too big):
  whether the capture reached it, the buttons missing or shown where they should be hidden, how far
  the page scrolls sideways at phone width, the texts one picture shows and the other does not, and
  what datacheck already sorted.
- `docs/delivery/<feature>/checklist.md`: every state, how it is reached, its buttons and the
  state each button opens, and the rules (`Rule R7: ...`) each state shows.

Your prompt may end with "Steers for this run": `docs/delivery/<feature>/steers.md`, written from
the design before round 1 (which phone pattern each overlay is, test data that is fake on purpose,
rules that override the picture, what is out of scope). Follow them over your own reading of the
pictures: they keep every round's reviewers reading the design the same way.

Both pictures show only the page's own area, cut at the same top edge. The sidebar, top bar and
phone tab bar are out of scope; a bottom sheet or dialog is the page's own content, and stays.

## For each of your items

Look at the two pictures side by side and ask:

1. Is anything in the design missing from the live page? A section, button, badge, count, progress
   bar, empty state, side panel or toast.
2. Is a checklist button missing, or shown to a member when it should be hidden? Use the facts file.
3. Does the live page show something the design doesn't that looks wrong? An error, a duplicate,
   a broken layout, or text that makes no sense.
4. Would a person notice the difference at a glance? Layout, arrangement, sizes, colours, borders,
   button styles or weights count. Ignore anything you would need a ruler to see.
5. Does every rule the checklist lists under this state hold in the live picture? A rule that
   breaks is `must fix`, and the bullet starts with its id: `must fix: R7 ...`.
6. Does the wording mean the same? The world is seeded with the design's own names and numbers,
   and the shoot's datacheck has already looked for every traced data value: your prompt lists
   what it found under "Already sorted", and they are counted, so never write them again. Values
   the founder decided the product does not store are listed too; they are not differences. A date in the same
   format as the design's ("Tue 14 Oct" against "Wed 3 Sep") is not a difference. Fake phone
   numbers and example addresses are fake on purpose. None of these is a problem.
7. Is the live page actually right, and the design wrong or missing something the product already
   does elsewhere? That is never `must fix` — the live page is not the thing to change. Write
   `design:` instead, so it goes back to whoever writes the design brief, not to the builder.
8. Is the only thing wrong that the seeded world doesn't have enough of something datacheck did
   not already sort (a value the trace missed)? The checklist lists each state's "Needs data" line when the map declares one
   (a table, a filter, a count). If what you see missing matches that line — an empty list where
   the design shows several rows — write `data gap:`, not `must fix:`. That is the world's
   problem, not the builder's: it costs no fix round and is fixed in the world file. When you
   are not sure the data is missing rather than hidden by the page, write `must fix:`: a code bug
   labelled a data gap is never fixed.

An item the capture didn't reach gets one line saying so.

## A close look

When a difference is small (an icon, a border, a number, a badge's colour) or the pictures are
dense, cut the same box out of both instead of guessing from the whole page:

    node scripts/delivery.mjs crop --round <n> --item <ITEM> --box x,y,w,h

The box is in pixels of the pictures as they are on disk; the command writes the two crops at
twice the size and prints their paths. Read both. It is the only command you run. Use it before
you call a difference `must fix` that you cannot see plainly at full size, and never to hunt for
differences that need a ruler.

## Phone items

- There is no sidebar or top bar to grade at either width. Both are cropped away.
- Judge a phone layout against the phone design, never against the desktop one. Stacked cards,
  a menu in place of tabs, a full-width button: all fine when the phone design shows them.
- A page that scrolls sideways on a phone is always `must fix`. `delivery review` adds the shoot's
  own finding (in the facts file) for you; write it yourself only when you see it and the
  shoot did not.

## Output

Write the file your prompt names, in the round folder:

- Line 1: how many of your items match, and how many have problems.
- One section per item with problems, headed `## <ID>` or `## <ID>@phone`. Put one bullet per problem, starting
  `must fix:` (missing, broken, wrong, or noticeable at a glance), `small:` (visible only on a
  close look), `design:` (the live page is right; the design should change to match it, or to
  add something the product has elsewhere — never `must fix:` for this), or `data gap:` (the world
  the checklist's "Needs data" line asks for isn't there — never `must fix:` for this either). Say
  what the design shows and what the live page shows.
- End with one line listing the items that match.

Be concrete. "The header is different" doesn't help. "The design's Add button is large, with a +
icon and a chevron, level with the title; the live one is a small orange pill on the subtitle
line" does.
