# Design: Pivot custom-demo-page-builder to off-hours call capture

Date: 2026-05-30
Skill: `general-tools/skills/custom-demo-page-builder`
Status: Approved, pending implementation plan

## Problem

The skill currently frames TeliTask custom demo pages around outbound, "manage
your calls" scenarios (lead callback, visit confirmation, post-sale check-in).
Vincent reports friction selling that angle: most prospects do not see managing
outbound calls as urgent. The easier wedge is off-hours / after-hours inbound
call capture — most small businesses do nothing about calls that arrive after
they close, and the cost of losing those calls is concrete and high.

Backing research: `telitask-development/docs/reports/off-hours-call-businesses-research.md`.
Key facts that motivate the pivot (used to brief the skill operator, not the
prospect-facing page): ~40-50% of inbound calls arrive outside 9-5; ~62% of
small-business calls go unanswered; 80-86% of callers who hit voicemail never
call back and immediately call the next business.

## Goal

Rebuild the skill so off-hours inbound call capture is the core angle, while
keeping one outbound scenario slot. Deep restructure (not a patch): the off-hours
mental model runs through research, brief, copy, scenarios, and prompt templates.

## Decisions (locked with user)

1. Pivot scope: off-hours is the lead angle. Default scenario mix is 2 inbound
   after-hours + 1 outbound.
2. Outbound default: Missed-call auto-callback (ties tightest to the off-hours
   "don't lose the lead" story).
3. Stats in page copy: keep prospect-facing copy specific and qualitative, no
   statistics on the page. Stats live in a reference file to brief the operator
   only.
4. Kenya / WhatsApp: voice-only on the page (the demo is always a voice call).
   Keep an internal note reminding the operator that voice may underweight the
   real Kenyan channel (WhatsApp), so expectations are set honestly with the
   user — never on the prospect page.
5. Edit strategy: deep restructure of the skill, organised around the off-hours
   model end to end.

## Core mechanic (the spine)

Today's demo is outbound-shaped: TeliTask dials the prospect's phone and the AI
plays the caller; the prospect role-plays the recipient.

For off-hours capture, flip the framing. The AI is the prospect's own after-hours
line. When a scenario fires, the platform still dials the prospect's phone (that
is how the demo works), but:

- The prospect role-plays a customer who just called the business after closing.
- The AI answers as if it picked up that inbound call.

Story the prospect should feel: "a customer calls my business at 9pm and, instead
of voicemail, a real, helpful voice picks up and books them in."

This reversal — AI = the business's after-hours line; prospect = the customer
calling in — is the spine of the restructure. Every inbound scenario
`system_prompt` must encode it. The outbound slot (missed-call auto-callback)
keeps the original outbound framing (AI places the call, prospect is the
recipient).

## Changes

### 1. SKILL.md — new opening positioning section

Add a section near the top, "The wedge: off-hours call capture", that states the
North Star: every custom demo page must answer one question — what happens when a
customer calls this business after hours? Today: voicemail, and most callers
never call back. With TeliTask: the line picks up, captures the need, and books
the next step. All downstream phases serve this question.

### 2. Phase 1 — research reoriented to off-hours exposure

Reframe research guidance to surface:
- Closing hours / when staff stop answering.
- What kinds of calls arrive after hours and which are worth money.
- Urgency (emergencies vs. schedulable next-day).
- Per-call / per-customer value (to size the cost of a miss — operator-facing).

### 3. Phase 2 — brief swaps generic pain points for off-hours exposure read

Replace the generic "candidate pain points" brief element with an off-hours
exposure read: closing hours, the after-hours calls being lost, the cost of one
missed call. Stats from the playbook brief the operator here; they never reach
the page.

### 4. Phase 3 — copy guidance (founder note + pain points)

Rewrite to the "specific, no stats" style, centred on the after-hours moment.
Founder note leads with the concrete after-hours scenario for that business; pain
points are short, prospect-voice outcomes about losing after-hours calls. No
industry statistics in either. Continue to honour `references/brand-voice.md`
(banned words, anchor against human VAs).

### 5. Phase 3e — default scenarios replaced

New default archetypes:
1. After-hours new-customer capture (inbound) — someone calls wanting to
   buy/book after closing; AI captures the need and books a next-day visit or
   callback.
2. Urgent / emergency after-hours triage (inbound) — AI triages an urgent call
   and books or escalates (e.g. vet poisoning, AC out, burst pipe, legal
   arrest).
3. Missed-call auto-callback (outbound) — a call/message came in and was not
   captured; the AI rings the person back. Keeps the outbound framing.

### 6. references/scenario-prompt-template.md — add inbound after-hours pattern

- Add the inbound after-hours `system_prompt` pattern: identity override (the
  business's own after-hours line, never name TeliTask) + "the person who answers
  is role-playing a customer who just called after closing; you picked up."
- Keep the existing outbound pattern for the missed-call-callback slot.
- Add a per-industry scenario menu drawn from the research doc: veterinary,
  restaurant, home services (plumbing/HVAC/electrical/roofing), real estate,
  salon/spa, dental/medical, law, hotel/lodging. Each entry: the after-hours
  call that matters and a scenario seed.
- Preserve the existing identity-framing rule (never write "You are TeliTask…").

### 7. references/off-hours-playbook.md — new file

- Missed-call / off-hours statistics per industry, labelled operator-facing
  (brief the operator, never the page).
- Per-industry off-hours archetypes (what after-hours call to demo).
- Internal Kenya / WhatsApp note: voice-only on the page; reminder that voice may
  underweight WhatsApp, so set expectations honestly with the user.

### 8. Red flags updated

Add: an inbound scenario where the AI places a call to a lead = reverted to the
old outbound model (only the third slot is outbound). Plus existing red flags
retained (never seed production, never `apply_migration`, never "You are
TeliTask…").

### 9. Repo housekeeping (claude-code-tools conventions)

- Edit source files only (`general-tools/skills/...`), never the plugin cache.
- Bump `general-tools/.claude-plugin/plugin.json` 1.13.2 → 1.14.0 (minor: new
  capability + reference file).
- Update `README.md` if the skill listing references its angle.
- Commit and push to `main` (per repo CLAUDE.md auto-commit rule).

## Out of scope

- No changes to the custom-demos database schema or the `/for/<slug>` rendering.
- No changes to the generic `/demo` flow or `demo_scenarios`.
- No new outbound archetypes beyond missed-call auto-callback as the default
  (the menu may list others but the default is fixed).
- No WhatsApp/channel changes — the demo stays voice.

## Acceptance criteria

- Running the skill produces a page whose founder note, pain points, and two of
  three scenarios are off-hours inbound, with the third an outbound missed-call
  callback.
- Inbound scenario `system_prompt`s frame the AI as the business's after-hours
  line and never name TeliTask.
- No statistics appear in any prospect-facing copy.
- Plugin version bumped, README updated, changes committed and pushed.
