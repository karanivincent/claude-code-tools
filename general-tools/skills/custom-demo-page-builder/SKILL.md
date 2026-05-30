---
name: custom-demo-page-builder
description: >
  Research a cold-outreach prospect and seed a personalized TeliTask custom demo page at `/for/<slug>`,
  built around the off-hours call-capture wedge — what happens when a customer calls this business after
  it closes. End-to-end flow: light web research → interactive brainstorm of the page sections → write
  rows to staging Supabase via MCP. Triggers: "build a custom demo for", "seed a demo page for",
  "create a /for page for", "personalize a demo for", "prep a demo for [company]", "custom demo prospect".
  Only for the TeliTask custom-demos feature (table `custom_demo_pages` + `custom_demo_scenarios`).
---

# Custom Demo Page Builder

Research a prospect company and seed a personalized custom demo page at `/for/<slug>` for cold outreach. Walks the user through the page sections, applies TeliTask brand voice, and writes rows directly to **staging** Supabase via the Supabase MCP.

**Scope:** This skill only handles the TeliTask custom-demos feature. It does NOT handle the generic `/demo` page or `demo_scenarios` table.

## The wedge: off-hours call capture

Every page this skill produces answers one question: **what happens when a customer calls this business after it closes?**

Today, for almost every small business: voicemail — and the caller is gone. Most callers who hit voicemail never call back; they ring the next business in the search results. With TeliTask, the line picks up after hours, captures the need, and books the next step.

That is the North Star. The founder note, pain points, and two of the three scenarios all live inside this after-hours moment. (Operator-facing stats that justify the wedge are in `references/off-hours-playbook.md` — they brief **you**, they do **not** go on the page.)

### The core mechanic (read before drafting scenarios)

The demo platform always **dials the prospect's phone**. But the story we want the prospect to feel is *inbound*: "a customer calls us at 9pm and a real voice picks up." So for the two inbound scenarios we flip the framing:

- **AI = the business's own after-hours line.**
- **The prospect role-plays a customer who just called the business after closing.**
- The AI behaves as if it **picked up that inbound call**.

Only the third scenario (missed-call auto-callback) is outbound — there the AI places the call. See `references/scenario-prompt-template.md` for the full inbound vs. outbound patterns.

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

WebFetch in this order. As you read, you're hunting for **off-hours exposure**, not a generic company profile:
1. Company homepage — what they sell, customer language, and any hours / "contact us" / booking signals
2. About / Contact page — opening hours, phone numbers, how customers are told to get in touch
3. **One** optional WebSearch (last 90 days) only if the site is thin

For every prospect, try to answer:
- **When do they close / stop answering?**
- **What kind of calls land after that** — and which are worth real money?
- **How urgent** are those calls (emergency vs. schedulable next-day)?
- **Per-call / per-customer value** (operator context — size the cost of one miss)

Use `references/off-hours-playbook.md` to map the industry to its off-hours signal. Hard cap: 5 fetches. If the prospect is opaque, surface that and ask the user what they know.

### Phase 2 — Research brief (off-hours exposure read)

Show the user a tight summary (under 200 words) covering:
- **Industry / what they do** — one sentence
- **Likely buyer persona** — who at this company loses money when an after-hours call is missed
- **Off-hours exposure** — when they close, the after-hours calls they're losing, and (operator-facing) the cost of one missed call
- **3-5 candidate pain points** — phrased the way they'd say it, centred on losing after-hours calls
- **Founder-note hook** — one personal-sounding angle tying TeliTask's after-hours line to something specific you found

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
- Lead with the prospect's specific after-hours moment ("when someone calls you at 9pm about X and gets voicemail…")
- Connect it to the TeliTask after-hours line
- Sound like a real DM, not marketing copy
- **No statistics** — keep it specific to them
- **Avoid** the banned words (see `references/brand-voice.md`)

If research turned up nothing specific, draft a generic version and flag it: *"This is generic — got anything specific you want to lead with?"*

#### 3d. Pain points (`pain_points text[]`)

3-5 short bullets in the prospect's voice, centred on losing after-hours calls. Each one a single line, sentence case, no trailing punctuation. Outcomes they want, not features TeliTask has. No statistics.

Example shape (car dealer): `Calls after 6pm go to voicemail` · `Weekend buyers can't reach anyone` · `Hot leads ring the next dealer instead`.

#### 3e. Scenarios (3 rows in `custom_demo_scenarios`)

Default mix: **two inbound after-hours + one outbound**.

1. **After-hours new-customer capture** (inbound) — someone calls wanting to buy/book after closing; the AI captures the need and books a next-day visit or callback.
2. **Urgent / emergency after-hours triage** (inbound) — the AI triages an urgent call and books or escalates. (Swap to a second capture/booking scenario if the industry has no real emergencies — use the per-industry menu in `references/scenario-prompt-template.md`.)
3. **Missed-call auto-callback** (outbound) — a call/message came in after hours and wasn't captured; the AI rings the person back first thing.

For each scenario collect:
- `slug` — kebab-case, unique within the page (e.g., `after-hours-enquiry`, `urgent-triage`, `missed-call-callback`)
- `title` — short label (3-5 words)
- `description` — one sentence the prospect reads on the card
- `icon` — a **lucide-react** icon name (e.g., `phone-incoming`, `phone-call`, `phone-missed`, `clock`, `bell`, `calendar-check`, `siren`). Match the scenario semantically.
- `preview` — the one-line transcript hint shown on the card
- `system_prompt` — the LLM system prompt. **MUST** open with an identity override framing the AI as the prospect's own after-hours line (NOT TeliTask) and telling it not to mention TeliTask during the call. Inbound scenarios (1 & 2) frame the AI as **answering** an inbound after-hours call (prospect role-plays the caller). The outbound scenario (3) frames the AI as **placing** the callback. **Every** `system_prompt` MUST also include the verbatim turn-taking block — see `references/scenario-prompt-template.md` → "Mandatory: turn-taking rules". Never bake a "speak with X accent" line into the prompt; accent comes from the page `country` column.
- `sell_prompt` — a 1-2 sentence wrap the AI delivers at the end, tying this same flow to the prospect's business. Don't mention TeliTask.
- `voice_id` — default `'Aoede'` (Gemini female voice). If the user wants a different voice, query `select voice_id from voices where is_default = true` against the staging project.
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
- Inbound scenario prompts read as the AI **answering**, not placing, the call
- No `system_prompt` says "You are TeliTask…"
- **Every** `system_prompt` includes the verbatim turn-taking block
- No `system_prompt` bakes in an accent line — accent comes from the page `country`
- The CTA uses `cta_phone` / `cta_whatsapp` (not the deprecated `cta_url` / `cta_label`)

Common offenders: "automate" → "handles"/"calls you"; "notification" → "phone call"; "workflow" → "things get done"; comparing against AI tools instead of human VAs.

### Phase 5 — Seed via Supabase MCP

Use `mcp__plugin_supabase_supabase__execute_sql` against the **staging** project (`pbtvpbrdpgpopieghany`).

**Single transaction**: insert the page row, capture the returned id, then insert the 3 scenarios. See `references/seed-sql-template.md` for the exact SQL pattern.

**Never** target the production project (`hffrgidrbrspqdqbmcqz`).

After insert, verify (includes the CTA + `country` columns so you can confirm they were set):
```sql
select p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country, count(s.id) as scenario_count
from custom_demo_pages p
left join custom_demo_scenarios s on s.page_id = p.id
where p.slug = '<slug>'
group by p.id, p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country;
```

### Phase 6 — Report

Give the user:
- The staging URL: `https://staging.telitask.com/en/for/<slug>`
- The admin URL: `https://staging.telitask.com/en/admin/custom-demos/<slug>`
- A 1-line summary of what was seeded
- The CTA fields set (`cta_phone`, `cta_whatsapp`, and `cta_email` if any) and the `country` value (so the user can confirm the accent)
- For WhatsApp-heavy Kenyan prospects: a one-line honest caveat that the demo is voice-only and may underweight WhatsApp (see `off-hours-playbook.md` → Kenya note). Tell the **user**, never put it on the page.

## Conventions

- **Off-hours is the angle.** Two of three scenarios live in the after-hours moment; the founder note and pain points centre on it.
- **No stats on the page.** Statistics brief the operator only.
- **No new SQL migration files.** This is data — seed via MCP `execute_sql`.
- **Staging only.** Never seed production.
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
- About to seed against `hffrgidrbrspqdqbmcqz` (production)
- Writing `"You are TeliTask, …"` in any scenario `system_prompt` — must be `"You are <Prospect>'s after-hours line. Do NOT mention TeliTask…"`
- A `system_prompt` **missing the turn-taking block** — every prompt must carry it verbatim
- **Baking an accent line** ("speak with a Kenyan accent") into a `system_prompt` instead of setting the page `country`
- Using `cta_url` / `cta_label` as the visible CTA — they're deprecated; set `cta_phone` / `cta_whatsapp`

## References

- `references/off-hours-playbook.md` — Off-hours stats (operator-facing), per-industry archetypes, Kenya/WhatsApp note
- `references/brand-voice.md` — Banned words, preferred phrases, anchoring rules
- `references/scenario-prompt-template.md` — Inbound (after-hours) + outbound system_prompt patterns, per-industry menu
- `references/seed-sql-template.md` — Exact SQL to run via Supabase MCP

The canonical cross-path conventions for this feature live at `docs/custom-demo-conventions.md` in the telitask-development repo — the dashboard AI generator follows the same rules (CTA columns, `country`-driven accent, turn-taking block). Keep this skill in sync with that doc.
