# Off-Hours Playbook (operator-facing) — LEGACY

> **Superseded (July 2026).** The off-hours missed-call wedge this file supports has been rejected by three of three discovery prospects. The current wedge is the routine outbound calls a business already makes daily — see SKILL.md, "The wedge: routine calls they already make". Use this file only when a specific prospect raises an inbound problem themselves. Evidence: `Telitask/Marketing/strategy/discovery-call-log.md`.


Everything in this file is to brief **you, the operator** while you build the
page. **None of these statistics go on the prospect-facing page** — page copy
stays specific and qualitative (see SKILL.md → Phase 3). Use the numbers to size
the prospect's pain, pick the right scenarios, and sound credible when you talk
to the user, not to dress up the page.

Source: `Telitask/telitask-development/docs/reports/off-hours-call-businesses-research.md`.

## The core argument

When a customer calls a small business after it closes, almost nothing happens —
voicemail, and the caller is gone. The numbers that anchor the wedge:

- 40–50% of inbound calls arrive outside standard 9-to-5 hours.
- ~62% of small-business inbound calls go unanswered.
- 80–86% of callers who hit voicemail hang up and immediately call the next
  business in the search results. They do not leave a message and do not call
  back.
- Service businesses lose ~$126,000/year on average to missed calls.

The takeaway that drives every page: a missed after-hours call is not "a missed
call," it's a customer handed directly to a competitor. The page's job is to make
the prospect feel that one specific lost call.

## Per-industry off-hours archetypes

Pick the prospect's industry, use the "after-hours call that matters" to frame
the brief and scenarios. Per-call values are operator context only.

| Industry | Off-hours signal | The call that matters | Per-call value |
|---|---|---|---|
| Veterinary | ~40% of calls after-hours (highest measured); 65% won't leave voicemail | Panicked owner: poisoning, trauma, "is this an emergency?" — triage + book/escalate | Client for the life of the pet |
| Restaurant | ~34% of calls missed; 43% of misses in 7–9pm rush; 20% of reservations after-hours | Reservation, large party, catering enquiry | Catering = tens of thousands |
| Home services (plumbing/HVAC/electrical/roofing) | 27–62% miss rate; 31% of HVAC calls after-hours | Emergency: burst pipe, AC out, no heat — book first available slot | Plumbing $275, emergency $450, HVAC $350–1,200, replacement $3,500+ |
| Real estate | ~40% of calls missed; 62% of enquiries after-hours; response decays 10× after 1hr | Buyer from a late-night listing browse — capture + book a viewing | $7,500+ lost commission per missed lead |
| Salon / spa / medspa | 46–50% of bookings happen outside business hours | After-hours booking / reschedule | ~$164/visit |
| Dental / medical | Peak after-hours 6–9pm; ~50% of rebookings after-hours | Rebooking, new-patient enquiry | Hygiene ~$290, crown $1,000+ |
| Law firm | ~40% after-hours; 80% of those unanswered | Post-crisis call: accident, arrest — capture + book consult | $4,500+ avg case value |
| Hotel / lodging / B&B | Structurally 24/7, time-zone driven | Late check-in, last-minute booking, lockout | Per-night + repeat |

If the prospect doesn't fit cleanly, reason from first principles: when do they
close, who calls after that, and what does losing that call cost?

## Default scenario mapping

Two inbound after-hours + one outbound (see SKILL.md → Phase 3e):

1. **After-hours new-customer capture** (inbound) — someone calls wanting to
   buy/book after closing; the AI captures the need and books a next-day visit or
   callback.
2. **Urgent / emergency after-hours triage** (inbound) — the AI triages an urgent
   call and books or escalates.
3. **Missed-call auto-callback** (outbound) — a call/message came in and was not
   captured; the AI rings the person back.

## Kenya / WhatsApp note (internal only)

In Kenya, many customers start on WhatsApp rather than a voice call (~85–97% of
Kenyan internet users are on WhatsApp daily). The TeliTask demo is always a voice
call, so:

- Keep the page voice-only. Do not promise WhatsApp handling on the page.
- Be honest with the **user** (Vincent), not the prospect: for a WhatsApp-heavy
  Kenyan business, a pure voice demo may underweight the channel where their
  customers actually start. Flag it when it's relevant so expectations are set
  before outreach.
