# Cold read: the brief

The cold read runs before the first critic round and the gate refuses without its result in `out/<slug>/coldread.json`
(S4-13). A reader who knows the story sees what it meant to draw; a reader who knows nothing sees what is
drawn. The misreads it was made for (hail as fire, fear as cheering) are in `why.md`.

## What gets a read

Each new place, prop, effect (fire, smoke, hail, dust, a glow), material (stone, snow, water, cloth, metal) and face
(each expression the story uses) (S4-13). One still each, rendered from the real build at phone size (1080 wide or a
0.3 scale), framed as a shot would frame it. A thing that changes (a fire catching, a door opening) gets one still of
each state.

Stills carry no captions and no labels: render them clean with `stills.mjs --clean` (S4-14). A burned-in word or frame
label tells the reader the story, and the read is worthless.

## Who reads

A fresh, cheap agent (Sonnet or Haiku), one per batch of about ten stills, that has not seen the script, the plan or
the meaning sheet. Give it the stills and the prompt below, and nothing else: no story, no period, no name for what a
thing is meant to be.

## The prompt

```text
You are looking at stills from a short cartoon. You know nothing else about it.
For each picture, answer in three short lines:
1. What is this thing (or place)? Name it in a few plain words. If you are not sure, say what else it could be.
2. What is happening in the picture?
3. If there is a face: what does the person feel? One word, then why you think so.
Do not guess a story. Say only what you see.
```

## Reading the answers

- A thing is read right when the agent's first name for it is the intended one, or a near synonym (stones: "rocks",
  "boulders"; not "posts", "stumps", "pillars").
- A face is read right when the feeling is the intended one or next to it (fear: "scared", "worried"; not "excited").
- Anything misread is redrawn (shape, colour, size, material, a detail that says what it is) and read again by a new
  fresh agent until it reads; "cannot tell" is a miss (S4-15). Record each miss and its fix in `coldread.json`.

Cost: a few cents and a few minutes a batch, against a render, a critique and a fix round.
