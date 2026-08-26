---
name: tldr
description: >
  Report the end of a substantial task as a scannable briefing instead of a wall of prose —
  a two-line verdict, then what the user must do ranked by escalation tier, then what went
  wrong, then what shipped. Use at the end of any turn that merged a PR, applied a migration,
  changed infrastructure or a deployment, or produced findings from a multi-step investigation.
  Triggers: "/tldr", "tl;dr", "brief me", "wrap up", "recap", "summarise what you did",
  "what do I need to do", "give me the short version". Does NOT fire for questions, single
  trivial edits, or status checks — those stay conversational.
---

# TL;DR Briefing

A long, careful report is unreadable at the moment it is delivered. The reader wants one thing
first — what they personally have to do — and everything else is optional. Prose buries it, and
a report nobody can skim gets skipped entirely, including the line that mattered.

This skill replaces the end-of-task wall of text with four fixed blocks in a fixed order, where
every required action carries an escalation tier and an optional detail line the reader can skip.

**Do not announce this skill.** Most skills open with "I'm using X to do Y." This one fires at
the end of nearly every substantial task, so announcing it is pure noise. The format is the
announcement.

## The template

````
## 📋 TL;DR
<One or two lines. The verdict first, then how many things need the user.>

## 🔴 Needs you
- 🔴 <Verb-first title. Stands alone without the detail below it.>

  <Optional detail: what breaks if this is skipped. Two lines maximum.>

- 🟠 <Title, with the triggering event named>

  ```bash
  <a command, when the action is one — the host renders a Run button on bash fences>
  ```

- 🔵 <Title. Low tiers rarely need a detail line.>

## ⚠️ Went wrong
- <Problems: caused, found, or still open. Each names its current state.>

## ✅ Done
- <One compressed line: #588 `d180e5b0` · tests 76 → 89>

Full account: `path/to/artifact.md`
Anything not covered there, ask and I'll expand.
````

## Section rules

### 📋 TL;DR

The verdict in the first clause, before any context. If anything needs the user, say how many
and whether any of it is urgent.

- Good: `Telephony snapshots now run daily. #586 closed, 2 PRs merged, 1 urgent thing needs you.`
- Bad: `I have completed the implementation of the scheduling system as requested.`

Two lines maximum. If it takes three, the task needs decomposing, not more lines.

### 🔴 Needs you

**Always print this section, even when empty.** Its absence is ambiguous — the reader cannot
tell whether nothing is required or whether it was forgotten. `Nothing.` is a real signal and
takes under a second to read.

#### Escalation tiers

Every item carries one. The tier is decided by consequence, never by how it feels.

| | Tier | The test |
|---|---|---|
| 🔴 | NOW | Something is broken, exposed, or blocked until they do it |
| 🟠 | SOON | Not broken yet, but it breaks or gets harder at a specific named event |
| 🔵 | LATER | Real, but nothing degrades if it waits |

Consistent circles, so the tiers form a scannable colour rail down the left margin. Never use
green in the ramp — green reads as "done" and would contradict the item's existence.

**A 🟠 item must name its triggering event.** "Before the next production release", "before
tomorrow's 08:20 run", "before the next deploy". Not "soon". Vague urgency is exactly what
makes items inflate to 🔴 and then get ignored wholesale — and a SOON with no named event is a
LATER that will be forgotten.

**The section header takes the highest tier present:** `## 🔴 Needs you` when anything is NOW,
otherwise `## 🟠 Needs you`, otherwise `## 🔵 Needs you`, and `## ✅ Needs you` with the body
`Nothing.` when the block is empty. The reader learns the worst thing in the block before
reading a single item.

Sort by tier, worst first. Five items maximum. Past five, the extras live in the linked
artifact and the fifth line says so explicitly — never silently truncate.

#### Carried-over items

An item repeated from an earlier briefing is marked with `↺` and its count:

```
- 🔴 ↺ Apply the migration to production (3rd time asking)
```

By the third briefing, force a decision: either the detail line justifies why it still matters,
or the item is demoted to 🔵. Never silently drop it, and never nag at the same volume forever.
This is the mechanism that catches "we discovered much later that a crucial step was missed".

#### Titles

- Verb first. `Commit the snapshot output`, never `The snapshot output should be committed`.
- One line. The title must stand alone — if the item only makes sense after reading its detail,
  the title is written wrong. That is a title bug, not a reason to add detail.
- When the item is a command, give it its own indented ```bash fence — Claude Code renders a Run
  button on shell-tagged blocks, which turns a copy-paste into a click. One command per fence.

### ⚠️ Went wrong

Problems, regardless of origin: bugs shipped, bugs found in passing, work still open, anything
that could not be verified. Ownership is not the sorting key; the reader's exposure is.

- Each line names the problem and its current state — fixed, filed, or open.
- Detail sub-lines are allowed here under the same rules as `Needs you`, since "what is my
  actual exposure" is the same question.
- Five maximum, worst first.
- Omit the whole section when genuinely empty. Never write "Nothing went wrong" — an absent
  section already says that, and a section that always appears stops carrying information.

### ✅ Done

- One compressed line wherever the facts allow: `#588 d180e5b0 · #590 7123c81a · tests 76 → 89`.
- Facts with identifiers — PR numbers, SHAs, counts, paths. Not adjectives.
- Claim `verified` only for something actually run, and say what was run. Anything shipped but
  unverified belongs in `Went wrong`, not here behind a green check.
- **No detail sub-lines here.** These are facts with identifiers; there is nothing to elaborate.
- **Never put a required action here.** An action smuggled into a Done bullet is invisible.

### Tail

Link the artifact when one exists — a handover doc, a PR, an issue, a spec. Do not duplicate
its contents into the briefing; the whole point is that the depth lives elsewhere. Then offer
to expand anything the artifact does not cover.

## Detail sub-lines

The affordance that lets the reader take the title and move on, or drop into the reasoning —
their choice, per item, without either one costing them anything.

```
- 🔴 Apply migration `20260825170000_record_how_calls_ended.sql` to production

  Staging has it, production does not. Every prod call ending through the new path writes
  a null, and the dashboard reports the reason as "unknown".
```

- **Optional, and absent more often than present.** 🔴 items almost always earn one; 🔵 items
  almost never do.
- **Answers what breaks if this is skipped** — never how to do it. How belongs in the artifact.
- Two lines maximum. Never a nested bullet list; a list under a list is the wall of text
  reassembling itself.
- Blank line between title and detail, so the two read as separate objects rather than one
  wrapped sentence.
- `Needs you` and `Went wrong` only.

## Ceilings

Without hard caps this degrades back into prose within a few turns.

| Element | Ceiling |
|---------|---------|
| Whole briefing | roughly 30 lines |
| TL;DR | 2 lines |
| Any title line | 1 line |
| Any detail sub-line | 2 lines, optional |
| Needs you | 5 items |
| Went wrong | 5 items |
| Done | 1 line where the facts allow, no sub-lines |

## Formatting constraints

- No asterisk emphasis inside the briefing. Many terminal clients render the literal `**` and
  `*` characters, so the markup adds noise rather than emphasis. Emoji, headings, tables and
  `backticks` carry the hierarchy instead. (This constraint governs the briefing you emit, not
  this file.)
- Emoji at section headings and as tier markers only. Never sprinkled through prose.
- File paths as clickable markdown links where the host supports it: `[foo.ts](src/foo.ts)`.
- Pull requests and issues as full markdown links, never bare `#123`, where the host expects it.

## Red flags

| Thought | Reality |
|---------|---------|
| "This needs context before the verdict" | Context after the verdict, or in the artifact. Never before. |
| "Everything here is urgent" | If all of them are 🔴, none of them are. Re-test each against the tier definition. |
| "I'll say soon without naming the event" | A 🟠 with no event is a 🔵 that will be forgotten. Name it or demote it. |
| "The title makes sense once you read the detail" | Title bug. Rewrite the title — the detail is optional by definition. |
| "The detail should explain how to do it" | Detail says what breaks if skipped. How belongs in the artifact. |
| "They ignored it twice, I'll quietly drop it" | Mark the repeat count, then justify or demote. Never silently drop. |
| "Both points matter, I'll write a paragraph" | Two bullets. A paragraph between sections defeats the format. |
| "It's small, I'll fold it into Done" | If they must act, it goes in Needs you at a tier. Every time. |
| "Nothing needs them, I'll drop the section" | Needs you always prints. `✅ Needs you / Nothing.` is the payload. |
| "Six items all matter" | Five, plus a line pointing at the rest. Never a silent truncation. |
| "I'll explain how I found it" | The finding is the deliverable. The hunt goes in the artifact. |
| "I should note that this went smoothly" | Absence of a Went wrong section already says it. |

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
Telephony snapshots now run daily at 08:20. #586 closed, 2 PRs merged, 3 things need you —
one of them urgent.

## 🔴 Needs you

- 🔴 ↺ Apply `20260825170000_record_how_calls_ended.sql` to production (2nd time asking)

  Staging has it, production does not. Every prod call ending through the new path writes
  a null, and the dashboard reports the reason as "unknown".

- 🟠 Commit whatever the 08:20 job leaves in `docs/infrastructure/snapshots/`

  Before tomorrow's run. Nothing in the scheduled path writes git history, so an
  uncommitted capture is silently replaced the next morning.

- 🔵 Find out what deleted two tracked files from your working directory

## ⚠️ Went wrong
- #588 shipped broken — it would have reported drift every single day. Fixed in #590.
- A live SIP password sat in an ungitignored temp file. Now ignored.
- `livekit.yaml` has never actually been captured; the pinned path does not exist. Issue filed.

## ✅ Done
- #588 `d180e5b0` · #590 `7123c81a` · tests 76 → 89 · LaunchAgent installed and verified

Full account: `docs/handovers/2026-08-26-telephony-snapshot-schedule-handover.md`
Anything not covered there, ask and I'll expand.
```

Same facts. The urgent item is visually separated from the merely real ones, every title reads
alone, and the reasoning is opt-in per item rather than mandatory prose.

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
