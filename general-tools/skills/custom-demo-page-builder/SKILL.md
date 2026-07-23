---
name: custom-demo-page-builder
description: >
  Research a cold-outreach prospect and seed a personalized TeliTask custom demo page at `/for/<slug>`,
  built around the routine calls the business already makes every day — confirmations, check-in rounds,
  follow-ups. End-to-end flow: light web research → interactive brainstorm of the page sections → write
  rows to Supabase (production or staging) via MCP. Triggers: "build a custom demo for", "seed a demo page for",
  "create a /for page for", "personalize a demo for", "prep a demo for [company]", "custom demo prospect".
  Only for the TeliTask custom-demos feature (table `custom_demo_pages` + `custom_demo_scenarios`).
---

# Custom Demo Page Builder

Research a prospect company and seed a personalized custom demo page at `/for/<slug>` for cold outreach. Walks the user through the page sections, applies TeliTask brand voice, and writes rows directly to Supabase via the Supabase MCP. Because these pages must be reachable by real prospects, the skill seeds **production by default** but asks before every write and lets you redirect to staging for test runs.

**Scope:** This skill only handles the TeliTask custom-demos feature. It does NOT handle the generic `/demo` page or `demo_scenarios` table.

## The wedge: routine calls they already make

Every page this skill produces answers one question: **which calls does this business make, over and over, every single day — and who is being paid to make them?**

Delivery confirmations before dispatch. A morning round of check-in calls to regional or field staff. Follow-ups after a delivery or visit that didn't land. Payment reminders. Appointment confirmations. These are structured, repeated, and someone's whole job. That is the demo: the AI makes one of those calls, and the prospect hears their own daily grind happen without anyone on their team doing it.

**Do not build the page around missed or after-hours calls.** That was the previous wedge and it has been rejected by three of three prospects in discovery — two of them emphatically, because evening cover is a solved problem for anyone big enough to feel it. Evidence: `Telitask/Marketing/strategy/discovery-call-log.md`. Only use the after-hours framing if this specific prospect has said the words themselves.

Good prospects have **five or more people employed to make calls**. Below that there is no volume to feel. If research suggests the business is smaller than that, say so to the user before building.

### The core mechanic (read before drafting scenarios)

The demo platform always **dials the prospect's phone**, which fits this wedge directly: these calls are outbound in real life too.

- **AI = the business's own line**, making one of its routine daily calls.
- **The prospect role-plays the person who normally receives it** — their customer, their driver, their regional rep.
- The AI behaves exactly as it would on the real call: one purpose, gets the information, confirms, ends.

Inbound framing (AI picks up a call the prospect places) is still supported and documented in `references/scenario-prompt-template.md` — use it only when the prospect has a genuine inbound problem they raised themselves.

### The objection to pre-empt

Prospects hear "AI phone line" and picture a pre-recorded IVR menu. The page's job is to get them to tap a scenario and hear a real conversation. Keep the founder note short and concrete so the call happens fast.

## When to use

The user asks to build, seed, prep, or personalize a `/for/<slug>` custom demo page for a specific company. Usually they hand over a company name and website, sometimes a contact name/email/role.

## When NOT to use

- Generic demo scenarios on `/demo` — that's the `demo_scenarios` table, different feature
- Marketing copy or landing pages unrelated to a specific prospect
- Already-existing demo pages — for edits, the user should use the admin surface at `/admin/custom-demos`

## Workflow

Execute these phases sequentially. Do **not** batch the brainstorm — walk the user through each section one at a time.

### Phase 0 — Intake (1 message)

Collect (use AskUserQuestion or accept what the user already provided):
- Company name + website URL (required)
- Prospect contact name + role + email (optional but recommended)
- Industry (if not obvious from the URL)
- Prospect country (drives the AI accent at call time — default "Kenya" if not given)
- Anything special the user already knows about this prospect (mutual connection, recent fundraise, specific pain they mentioned, etc.)

### Phase 1 — Light research, focused on off-hours exposure (2-5 fetches max)

WebFetch in this order. As you read, you're hunting for **the calls their operation runs on**, not a generic company profile:
1. Company homepage — what they sell or move, and to whom
2. About / Contact / Careers pages — the operational shape: branches, regions, fleet, field staff, and especially **call-centre, customer-care, dispatch, or tele-sales job listings** (the clearest signal that people are paid to make calls)
3. **One** optional WebSearch (last 90 days) only if the site is thin

For every prospect, try to answer:
- **What has to be confirmed, chased, or checked before work happens?** (deliveries, appointments, dispatch, stock, payment)
- **Who do they call every day** — customers, drivers, field agents, branch or regional staff, suppliers?
- **Roughly how many such calls a day**, and how many people are employed to make them
- **What breaks when a call doesn't happen** — a wasted trip, a missed dispatch, a stalled decision

Hard cap: 5 fetches. Websites rarely reveal internal call workflows, so expect to infer from the operating model and then **ask the user** — anything they heard directly from the prospect beats anything you can find. If the prospect is opaque, say so plainly rather than inventing a workflow.

`references/off-hours-playbook.md` is retained only for the legacy inbound framing — do not use it as the default lens.

### Phase 2 — Research brief (operational calling read)

Show the user a tight summary (under 200 words) covering:
- **Industry / what they do** — one sentence
- **Likely buyer persona** — the person who owns the team making these calls (ops lead, branch or regional manager, owner)
- **Their daily calling round** — the specific repeated calls you believe they make, and your rough estimate of volume and headcount. Label estimates as estimates.
- **3-5 candidate pain points** — phrased the way they'd say it, centred on the volume of routine calls their people carry
- **Founder-note hook** — one personal-sounding angle tying the demo to a specific call they make

Keep statistics in the brief for **the user only** — they do not go on the page. Ask: *"Anything to add or correct before we brainstorm the page?"*

### Phase 3 — Brainstorm the page

Walk through these sections **one at a time** — propose a draft, get the user's reaction, refine, lock it in, move on.

#### 3a. Slug

Generate: `<company-kebab>-<4-char-random>` (e.g., `acme-x7k2`, `northwind-h4q9`). The random suffix makes the URL unguessable so the slug itself acts as the access token. Confirm with the user before locking.

#### 3b. Hero

- `company_name` — exactly as the prospect uses it (preserve casing, drop "Inc." unless they use it)
- `contact_name` (if known)
- `contact_role` (if known)

#### 3c. Founder note (`founder_note`)

A 2-4 sentence message from Vincent. Should:
- Lead with the specific round of calls their team makes ("every morning someone on your team rings each customer to confirm the drop…")
- Say plainly that the demo will call them so they can hear one of those calls happen
- Sound like a real DM, not marketing copy
- **No statistics** — keep it specific to them
- **No price** — pricing is unset for this direction; never put a figure on the page
- **Avoid** the banned words (see `references/brand-voice.md`)

If the user has told you something the prospect said in conversation, use their words. That beats anything from research.

If research turned up nothing specific, draft a generic version and flag it: *"This is generic — got anything specific you want to lead with?"*

#### 3d. Pain points (`pain_points text[]`)

3-5 short bullets in the prospect's voice, centred on the weight of the calls their team makes. Each one a single line, sentence case, no trailing punctuation. Outcomes they want, not features TeliTask has. No statistics.

Example shape (delivery operation): `Three hundred confirmation calls before the day even starts` · `Orders land overnight with no address confirmed yet` · `Every failed delivery means calling the customer back to rebook` · `Ten people on the phones and still not enough`.

Naming a concrete number they gave you is the single strongest line on the page.

#### 3e. Scenarios (3 rows in `custom_demo_scenarios`)

Default mix: **three outbound calls from their daily round.** Pick the three that carry the most volume for this specific business. Common shapes:

1. **Pre-work confirmation** — calling ahead to confirm the details before anything ships, dispatches, or starts: exact location, time window, who will receive it.
2. **Retry after a failed attempt** — the delivery or visit didn't land; the AI calls to find out what happened and rebook.
3. **Status round with their own staff** — calling each driver, field agent, or regional rep to collect what happened today and flag anything escalating.

Other options as the business warrants: post-delivery check, appointment reminder, payment follow-up, stock or availability check with a supplier.

Legacy inbound scenarios (after-hours capture, urgent triage, missed-call callback) are still documented in `references/scenario-prompt-template.md`. Use them only when the prospect has raised an inbound problem themselves — not as a default.

For each scenario collect:
- `slug` — kebab-case, unique within the page (e.g., `after-hours-enquiry`, `urgent-triage`, `missed-call-callback`)
- `title` — short label (3-5 words)
- `description` — one sentence the prospect reads on the card
- `icon` — a **lucide-react** icon name (e.g., `phone-outgoing`, `phone-call`, `calendar-clock`, `package-check`, `clipboard-check`, `truck`, `clock`). Match the scenario semantically.
- `preview` — the one-line transcript hint shown on the card
- `system_prompt` — the LLM system prompt. **MUST** open with an identity override framing the AI as the prospect's own line (NOT TeliTask) and telling it not to mention TeliTask during the call. Outbound scenarios frame the AI as **placing** the call, with the prospect role-playing whoever normally receives it. **Every** `system_prompt` MUST also include the verbatim turn-taking block — see `references/scenario-prompt-template.md` → "Mandatory: turn-taking rules". Never bake a "speak with X accent" line into the prompt; accent comes from the page `country` column. **Every** `system_prompt` MUST also carry the verbatim no-assumed-name rule — see `references/scenario-prompt-template.md` → "Mandatory: never assume the answerer's name".
- `sell_prompt` — a 1-2 sentence wrap the AI delivers at the end, tying this same flow to the prospect's business. Don't mention TeliTask.
- `voice_id` — default `'Aoede'` (Gemini female voice). If the user wants a different voice, query `select voice_id from voices where is_default = true` against the project you're about to seed (see Phase 5).
- `sort_order` — 0, 1, 2

#### 3f. CTA

The public page renders the CTA only from these dedicated columns:
- `cta_phone` — the tel: CTA. Default to `+254704985136` (Vincent's contact number).
- `cta_whatsapp` — the wa.me CTA. Default to `+254704985136` as well.
- `cta_email` — optional mailto CTA. Leave null unless the user wants it.

`cta_url` / `cta_label` are **deprecated** and NOT rendered on the public page — do not use them as the visible CTA.

#### 3g. Metadata

- `country` — free text, e.g. "Kenya" (default "Kenya"). The voice server reads it and makes the AI speak with that country's accent at call time, so set it accurately. Never encode the accent in a `system_prompt`.
- `expires_at` — optional. If the user wants the page to auto-expire (e.g., 30 days), capture as a timestamp.
- `industry` — capture for filtering/analytics
- `prospect_email` — capture if known, for follow-up tracking

Access control: there is none beyond the slug. Anyone with the link can view the page and trigger a demo call. The unguessable 4-char suffix IS the access token.

### Phase 4 — Brand voice review

Before writing to the DB, re-read every piece of copy against `references/brand-voice.md`. Flag any rule violations and propose fixes inline. Also confirm:
- **No statistics** snuck into founder note or pain points
- **No price** anywhere on the page
- The page is built on calls they **make**, not calls they might be **missing** — unless the prospect raised the inbound problem themselves
- Any inbound scenario prompts read as the AI **answering**, not placing, the call
- No `system_prompt` says "You are TeliTask…"
- **Every** `system_prompt` includes the verbatim turn-taking block
- No `system_prompt` bakes in an accent line — accent comes from the page `country`
- **Every** `system_prompt` includes the no-assumed-name rule, and no prompt greets the answerer by name or hardcodes the contact's name
- The CTA uses `cta_phone` / `cta_whatsapp` (not the deprecated `cta_url` / `cta_label`)

Common offenders: "automate" → "handles"/"makes the calls"; "notification" → "phone call"; "workflow" → "the round of calls"; quoting a price; anchoring against human VAs (that framing belongs to the old personal-assistant product — the anchor now is the staff currently making these calls).

### Phase 5 — Seed via Supabase MCP

**First, pick the target.** Ask the user which database to seed — use AskUserQuestion with two options, **default/recommended: production** (so the page is reachable by real prospects):
- **Production** → `hffrgidrbrspqdqbmcqz` — the live page real prospects will visit. Recommend this.
- **Staging** → `pbtvpbrdpgpopieghany` — for test runs only; not reachable by prospects.

Do **not** seed until the user has confirmed the target in this run. A prior run's choice does not carry over — ask every time. Set `project_id` on every `execute_sql` call to the confirmed project, and remember it for the voice query (Phase 3e) and the verification + report.

Then use `mcp__plugin_supabase_supabase__execute_sql` against the confirmed project.

**Single transaction**: insert the page row, capture the returned id, then insert the 3 scenarios. See `references/seed-sql-template.md` for the exact SQL pattern.

After insert, verify against the **same project** (includes the CTA + `country` columns so you can confirm they were set):
```sql
select p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country, count(s.id) as scenario_count
from custom_demo_pages p
left join custom_demo_scenarios s on s.page_id = p.id
where p.slug = '<slug>'
group by p.id, p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country;
```

### Phase 6 — Report

Use the host that matches the project you seeded in Phase 5:
- Production (`hffrgidrbrspqdqbmcqz`) → `https://telitask.ai`
- Staging (`pbtvpbrdpgpopieghany`) → `https://staging.telitask.com`

Give the user:
- The public URL: `<host>/en/for/<slug>`
- The admin URL: `<host>/en/admin/custom-demos/<slug>`
- Which environment it was seeded to (production or staging)
- A 1-line summary of what was seeded
- The CTA fields set (`cta_phone`, `cta_whatsapp`, and `cta_email` if any) and the `country` value (so the user can confirm the accent)
- For WhatsApp-heavy Kenyan prospects: a one-line honest caveat that the demo is voice-only and may underweight WhatsApp (see `off-hours-playbook.md` → Kenya note). Tell the **user**, never put it on the page.

## Conventions

- **Off-hours is the angle.** Two of three scenarios live in the after-hours moment; the founder note and pain points centre on it.
- **No stats on the page.** Statistics brief the operator only.
- **No new SQL migration files.** This is data — seed via MCP `execute_sql`.
- **Ask which database every run.** Default to production (the page must be live for prospects), but confirm production vs staging before any write — never assume.
- **Slug is the access token.** Make it unguessable (4-char random suffix).
- **One scenario brainstorm per turn.** Don't dump three scenarios at once.
- **Reuse the research brief.** Pull specific details into founder_note and scenarios — don't write generic copy and then "add personalization".

## Red flags

If you find yourself doing any of these, stop and reset:
- An **inbound** scenario where the AI *places* a call to a lead — you've reverted to the old outbound model. Only slot 3 is outbound.
- Putting **statistics** in the founder note or pain points — stats are operator-facing only
- Researching more than 5 URLs — past the "light" budget
- Drafting all 3 scenarios before showing the user any of them
- Writing a generic founder_note without flagging it as generic
- Using "automate", "notification", "workflow", or "leverage" anywhere in copy
- About to call `apply_migration` instead of `execute_sql` — these are data rows, not schema
- Seeding **without asking** which database in this run, or assuming a prior run's target — always confirm production vs staging first (default production)
- Reporting URLs on the wrong host — production seeds get `telitask.ai`, staging seeds get `staging.telitask.com`; don't mix them
- Writing `"You are TeliTask, …"` in any scenario `system_prompt` — must be `"You are <Prospect>'s after-hours line. Do NOT mention TeliTask…"`
- A `system_prompt` **missing the turn-taking block** — every prompt must carry it verbatim
- A `system_prompt` that **names the person who answers** (e.g. "greet Maureen warmly") or is missing the no-assumed-name rule — the page link gets forwarded, so the answerer is often not the contact on the page
- **Baking an accent line** ("speak with a Kenyan accent") into a `system_prompt` instead of setting the page `country`
- Using `cta_url` / `cta_label` as the visible CTA — they're deprecated; set `cta_phone` / `cta_whatsapp`

## References

- `references/off-hours-playbook.md` — Off-hours stats (operator-facing), per-industry archetypes, Kenya/WhatsApp note
- `references/brand-voice.md` — Banned words, preferred phrases, anchoring rules
- `references/scenario-prompt-template.md` — Inbound (after-hours) + outbound system_prompt patterns, per-industry menu
- `references/seed-sql-template.md` — Exact SQL to run via Supabase MCP

The canonical cross-path conventions for this feature live at `docs/custom-demo-conventions.md` in the telitask-development repo — the dashboard AI generator follows the same rules (CTA columns, `country`-driven accent, turn-taking block). Keep this skill in sync with that doc.
