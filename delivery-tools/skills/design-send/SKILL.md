---
name: design-send
description: Use when sending a design brief or a review to Claude Design from a Claude Code session, in the in-app browser. Triggers - "send it to Claude Design", "brief the design", NEXT naming this skill.
---

# Design send

One tested way to hand the design project a brief or a batch of changes, so every session sends
it the same way: the brief travels as a file, never pasted text, and the message Claude Design
reads back is the composer's own text, checked before Send.

`delivery <command>` below means `node scripts/delivery.mjs <command>` (the repo's shim), or
`node "${CLAUDE_PLUGIN_ROOT}/bin/delivery.mjs" <command>` in a repo without one.

## Before sending

1. `delivery brief check <file>` must pass first — a leaked name, a screen missing its phone
   line, a component described in words instead of named, or an unnumbered behaviour stops here,
   not inside the design's chat. Then `delivery brief pack <file> [<image>...]` builds the pack
   folder: the checked brief as `00-brief.md`, plus every image numbered in the order given.

## Opening the design

2. Open the design project in the in-app browser: `preview_start` with its URL, then
   `tabs_select`. If it isn't signed in, ask the person running the session to sign in there —
   never type credentials into it yourself.
3. Start a new chat for every new batch of changes: the "Start a new chat" banner's New chat
   button when it shows (it carries a summary of what came before), otherwise the history menu's
   New chat. A small fix to the batch just built can stay in the chat that built it.

## Sending the pack

4. Attach the pack by publishing it as a private artifact whose supporting files are the pack
   folder's files. That artifact's own page fetches its files and posts them to its opener; in the
   artifact's tab, forward them over a `BroadcastChannel` to the design's tab; there, build `File`
   objects from them and dispatch `dragenter`, `dragover` and `drop` with a `DataTransfer` on the
   composer. Check the thumbnails before typing anything — a drop that silently failed leaves none.
5. Type one short message naming the attached files, with
   `document.execCommand('insertText', false, text)` on `[data-testid="chat-composer-input"]`
   (click the composer first if the pane is hidden and inserting does nothing). Compare the
   composer's whitespace-stripped `innerText` against the message before pressing Send — a
   mismatch means the insert silently dropped characters.

## After sending

6. Wait for the final edit line before reviewing — the checker can keep editing well after it
   first says "Out for review". Review with `delivery design review` on the new export, not with
   canvas screenshots: canvas screenshots lag and show one state at a time, while the export
   already renders headlessly.
7. `delivery brief sent <file> --chat <url>` records the send: the file, the chat link and the
   time, so a later session can tell what was sent, when, and whether the file has changed since.

## Rationalizations

| Thought | Reality |
|---|---|
| "I'll paste the brief as text" | The brief travels as a file, so what the design reads is byte for byte the one saved on disk. A pasted copy can drift, reflow, or lose a line, and nothing would catch it. |
| "One long chat is fine, it's the same batch" | A long chat bloats the design's context with everything said before it. A new chat per batch keeps each send focused on only what changed. |
| "The thumbnails will show up eventually" | A silent drop failure looks identical to a slow one until the message is already sent. Check before typing anything. |
| "Close enough, the composer shows most of it" | `insertText` can drop characters the eye skips past. Compare the stripped text against the file, not a glance at the pane. |
