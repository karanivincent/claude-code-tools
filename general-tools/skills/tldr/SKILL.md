---
name: tldr
description: >
  Report the end of a substantial task as a scannable briefing instead of a wall of prose —
  a two-line verdict, then what the user must do, then what went wrong, then what shipped.
  Use at the end of any turn that merged a PR, applied a migration, changed infrastructure or
  a deployment, or produced findings from a multi-step investigation. Triggers: "/tldr",
  "tl;dr", "brief me", "wrap up", "recap", "summarise what you did", "what do I need to do",
  "give me the short version". Does NOT fire for questions, single trivial edits, or status
  checks — those stay conversational.
---

# TL;DR Briefing

A long, careful report is unreadable at the moment it is delivered. The reader wants one thing
first — what they personally have to do — and everything else is optional. Prose buries it, and
a report nobody can skim gets skipped entirely, including the line that mattered.

This skill replaces the end-of-task wall of text with four fixed blocks in a fixed order.

**Do not announce this skill.** Most skills open with "I'm using X to do Y." This one fires at
the end of nearly every substantial task, so announcing it is pure noise. The format is the
announcement.

## The template

````
## 📋 TL;DR
<One or two lines. The verdict first, then how many things need the user.>

## 🔴 Needs you
- <Verb first. One line each. "Nothing." when clear.>

```bash
<a command, when the action is one — the host renders a Run button on bash fences>
```

## ⚠️ Went wrong
- <Problems: caused, found, or still open. Each names its current state.>

## ✅ Done
- <One compressed line where possible: #588 `d180e5b0` · tests 76 → 89>

Full account: `path/to/artifact.md`
Anything not covered there, ask and I'll expand.
````

## Section rules

### 📋 TL;DR

The verdict in the first clause, before any context. If anything needs the user, say how many.

- Good: `Telephony snapshots now run daily. #586 closed, 2 PRs merged, 2 things need you.`
- Bad: `I have completed the implementation of the scheduling system as requested.`

Two lines maximum. If it takes three, the task needs decomposing, not more lines.

### 🔴 Needs you

**Always print this section, even when empty.** Its absence is ambiguous — the reader cannot
tell whether nothing is required or whether it was forgotten. `Nothing.` is a real signal and
takes under a second to read.

- Verb first. `Commit the snapshot output`, never `The snapshot output should be committed`.
- One line per item. No sub-bullets, no parenthetical justification. The why belongs in the
  linked artifact unless the why *is* the action.
- When the item is a command, give it its own ```bash fence — Claude Code renders a Run button
  on shell-tagged blocks, which turns a copy-paste into a click. One command per fence.
- Order by the consequence of not doing it, worst first.
- Five items maximum. Past five, the extras live in the linked artifact and the fifth line says
  so explicitly — never silently truncate.

### ⚠️ Went wrong

Problems, regardless of origin: bugs shipped, bugs found in passing, work still open, anything
that could not be verified. Ownership is not the sorting key; the reader's exposure is.

- Each line names the problem and its current state — fixed, filed, or open.
- Five maximum, worst first.
- Omit the whole section when genuinely empty. Never write "Nothing went wrong" — an absent
  section already says that, and a section that always appears stops carrying information.

### ✅ Done

- Prefer one compressed line to a bullet list: `#588 d180e5b0 · #590 7123c81a · tests 76 → 89`.
- Facts with identifiers — PR numbers, SHAs, counts, paths. Not adjectives.
- Claim `verified` only for something actually run, and say what was run.
- **Never put a required action here.** An action smuggled into a Done bullet is invisible.

### Tail

Link the artifact when one exists — a handover doc, a PR, an issue, a spec. Do not duplicate
its contents into the briefing; the whole point is that the depth lives elsewhere. Then offer
to expand anything the artifact does not cover.

## Ceilings

Without hard caps this degrades back into prose within a few turns.

| Element | Ceiling |
|---------|---------|
| Whole briefing | one screen, roughly 20 lines |
| TL;DR | 2 lines |
| Any bullet | 1 line, no sub-bullets |
| Needs you | 5 items |
| Went wrong | 5 items |
| Done | 1 line where the facts allow |

## Formatting constraints

- No asterisk emphasis inside the briefing. Many terminal clients render the literal `**` and
  `*` characters, so the markup adds noise rather than emphasis. Emoji, headings, tables and
  `backticks` carry the hierarchy instead. (This constraint governs the briefing you emit, not
  this file.)
- Emoji only at section headings, never sprinkled through bullets.
- File paths as clickable markdown links where the host supports it: `[foo.ts](src/foo.ts)`.
- Pull requests and issues as full markdown links, never bare `#123`, where the host expects it.

## Red flags

| Thought | Reality |
|---------|---------|
| "This needs context before the verdict" | Context after the verdict, or in the artifact. Never before. |
| "Both matter, I'll write a paragraph" | Two bullets. A paragraph between sections defeats the format. |
| "It's a small thing, I'll fold it into Done" | If they must act, it goes in Needs you. Every time. |
| "Nothing needs them, I'll drop the section" | Needs you always prints. `Nothing.` is the payload. |
| "This nuance is genuinely important" | Then it is worth a written artifact, not four extra lines here. |
| "Six items all matter" | Five, plus a line pointing at the rest. Never a silent truncation. |
| "I'll explain how I found it" | The finding is the deliverable. The hunt goes in the artifact. |
| "I should note this went smoothly" | Absence of a Went wrong section already says it. |

## Worked example

Before — the same information, unreadable:

> The schedule is three pieces, deliberately not one. The capture needs the SSH key, which lives
> on your Mac, and the Mac is the part that gets closed and carried around, so the thing that
> notices the capture stopped cannot also live there. That half runs on GitHub and needs no
> credentials. On most mornings nothing changes, so an unchanged run discards its own capture
> and stamps the snapshot it matched. Nothing in the scheduled path runs git commit or checkout
> — it works in a directory that usually has a session open in it, and a background job moving
> your branch is how work gets lost. The review turned up a security hole I had introduced…

After:

```
## 📋 TL;DR
Telephony snapshots now run daily at 08:20. #586 closed, 2 PRs merged, 2 things need you.

## 🔴 Needs you
- Commit whatever the 08:20 job leaves in `docs/infrastructure/snapshots/` — it never writes git history
- Two tracked files were deleted from your working dir, not by me. Worth finding what did it.

## ⚠️ Went wrong
- #588 shipped broken — it would have reported drift every single day. Fixed in #590.
- A live SIP password sat in an ungitignored temp file. Now ignored.
- `livekit.yaml` has never actually been captured; the pinned path does not exist. Issue filed.

## ✅ Done
- #588 `d180e5b0` · #590 `7123c81a` · tests 76 → 89 · LaunchAgent installed and verified

Full account: `docs/handovers/2026-08-26-telephony-snapshot-schedule-handover.md`
Anything not covered there, ask and I'll expand.
```

Same facts. Everything the reader must act on is above the fold, and the reasoning is one
click away instead of in their way.

## When to use

Fires when the turn involved any of:

- A commit, PR, merge, or release
- A migration, deployment, or infrastructure change
- A multi-step investigation that produced findings
- Roughly three or more files changed

## When NOT to use

- Answering a question. `What does this function do?` gets an answer, not a briefing.
- A single trivial edit — a typo, a rename, one config value.
- A status check. `Is staging up?` gets a sentence.
- Mid-conversation, before the work has reached a conclusion. A briefing marks an ending; using
  one halfway through implies the task is over when it is not.
- When the user explicitly asked for depth. They asked; give it to them.
