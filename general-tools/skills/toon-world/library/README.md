# The asset library

Finished places, vehicles, props and costumes that stories copy and keep improving. A new story's budget goes on shots
and acting, not on building the world again (S2-32). Look here before writing a parts plan.

## How an entry is laid out

```
library/<kind>/<name>/
  entry.md        what it is, what it is good for, its known faults, where it came from, how to copy it in
  preview.jpg     one still from a render, 540 px wide
  code/           the files to copy, at the paths they had in the story (places/..., props/...)
  pictures/       its generated pictures (far bands, skies), copied to public/<slug>/pictures/
```

Kinds: `places/`, `vehicles/`, `props/`, `costumes/`. Code only: no `node_modules`, renders or sound.

## Copying one into a story

1. Read `entry.md`: its imports, the pictures it loads, and its known faults.
2. Copy `code/` into `src/stories/<slug>/` keeping the paths, and `pictures/` into `public/<slug>/pictures/`.
3. Fix the imports the entry names (the project's `src/look`, the story's own clock or marks), and rename the
   picture paths from the old slug to the new one.
4. Name each copied entry in the parts plan, with what this story changes (S2-32). The owner still approves the
   place's parts plan and its picture (S2-30, S2-33).
5. Change it freely in the story. It is the story's copy now.

## Giving improvements back

At hand-back, an entry the story made better goes back by PR to this repo (S6-17): copy the improved files over the
entry's `code/` and `pictures/`, take a new `preview.jpg`, update the known faults in `entry.md`, add a line to its
history, and bump the plugin version. A story-only change (a new prop that fits one story) stays in the story.

A new entry is added the same way, with a line in `index.md`.
