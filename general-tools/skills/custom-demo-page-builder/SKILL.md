---
name: custom-demo-page-builder
description: >
  Research a cold-outreach prospect and seed a personalized TeliTask custom demo page at `/for/<slug>`.
  End-to-end flow: light web research → interactive brainstorm of the 7 page sections → write rows to
  staging Supabase via MCP. Triggers: "build a custom demo for", "seed a demo page for",
  "create a /for page for", "personalize a demo for", "prep a demo for [company]", "custom demo prospect".
  Only for the TeliTask custom-demos feature (table `custom_demo_pages` + `custom_demo_scenarios`).
---

# Custom Demo Page Builder

Research a prospect company and seed a personalized custom demo page at `/for/<slug>` for cold outreach. Walks the user through 7 page sections, applies TeliTask brand voice, and writes rows directly to **staging** Supabase via the Supabase MCP.

**Scope:** This skill only handles the TeliTask custom-demos feature. It does NOT handle the generic `/demo` page or `demo_scenarios` table.

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
- Anything special the user already knows about this prospect (mutual connection, recent fundraise, specific pain they mentioned, etc.)

### Phase 1 — Light research (2-5 fetches max)

WebFetch in this order. Stop as soon as you have enough to write a brief:
1. Company homepage — pull positioning, what they sell, customer language
2. About / Careers page — pull team size signal, geography, hiring focus (proxy for growth stage)
3. **One** optional WebSearch for recent news (last 90 days): `"<company name>" news` — only if the homepage was thin

Hard cap: 5 fetches. Light research is the rule. If the prospect is opaque, surface that and ask the user what they know.

### Phase 2 — Research brief

Show the user a tight summary (under 200 words) covering:
- **Industry / what they do** — one sentence
- **Likely buyer persona** — who at this company would care about a voice assistant
- **3-5 candidate pain points** — phrased the way they'd say it, not the way TeliTask sells
- **Recent signal** (optional) — fundraise, expansion, hiring, news
- **Founder-note hook** — one personal-sounding angle that ties TeliTask to something specific you found

Ask: *"Anything to add or correct before we brainstorm the page?"*

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
- Reference something specific from research (e.g., "Saw you just opened your Lagos office")
- Connect to a TeliTask use case
- Sound like a human founder, not marketing copy
- **Avoid** the banned words (see `references/brand-voice.md`)

If research turned up nothing personal, draft a generic version and flag it: *"This is generic — got anything specific you want to lead with?"*

#### 3d. Pain points (`pain_points text[]`)

3-5 short bullets in the prospect's voice. Each one a single line, sentence case, no trailing punctuation. Frame as outcomes they want, not features TeliTask has.

#### 3e. Scenarios (3 rows in `custom_demo_scenarios`)

For each of 3 scenarios, collect:
- `slug` — kebab-case, unique within the page (e.g., `driver-checkin`, `eta-callbacks`)
- `title` — short label (3-5 words)
- `description` — one sentence the prospect reads on the card
- `icon` — a **lucide-react** icon name (e.g., `phone-call`, `truck`, `clock`, `users`, `bell`, `calendar-check`). Match the scenario semantically.
- `preview` — the one-line transcript hint shown on the card (e.g., *"Hi, this is your TeliTask assistant calling to confirm Driver 12's morning route…"*)
- `system_prompt` — the LLM system prompt that runs the call. Should set: who the AI is, who it's calling (the prospect role-playing as their customer/driver/etc.), what to ask, how to close.
- `sell_prompt` — a 1-2 sentence wrap the AI delivers at the end pitching how this same flow would work at the prospect's company
- `voice_id` — default `'Aoede'` (Gemini female voice). If the user wants a different voice, query `select voice_id from voices where is_default = true` against the staging project.
- `sort_order` — 0, 1, 2

When drafting `system_prompt`, lean on the patterns in `references/scenario-prompt-template.md`.

#### 3f. CTA

- `cta_label` — short, e.g., "Book a 15-min call", "Talk to Vincent" (default `"Book a call"`)
- `cta_url` — usually a Calendly link the user supplies; required, no default

#### 3g. Visibility & metadata

- `visibility` — leave as `'private'` (default). The user can flip to `'public'` from admin later.
- `expires_at` — optional. If the user wants the page to auto-expire (e.g., 30 days), capture as a timestamp.
- `industry` — capture for filtering/analytics
- `prospect_email` — capture if known, for follow-up tracking

### Phase 4 — Brand voice review

Before writing to the DB, re-read every piece of copy you drafted against `references/brand-voice.md`. Flag any rule violations and propose fixes inline. Common offenders:
- "Automate / automation" → "handles", "calls you"
- "Notification" → "phone call"
- "Workflow" → "things get done"
- Comparing against AI tools instead of human VAs

### Phase 5 — Seed via Supabase MCP

Use `mcp__plugin_supabase_supabase__execute_sql` against the **staging** project (`pbtvpbrdpgpopieghany`).

**Single transaction**: insert the page row, capture the returned id, then insert the 3 scenarios.

See `references/seed-sql-template.md` for the exact SQL pattern (uses `with inserted_page as (insert ... returning id)` to avoid two round-trips).

**Never** target the production project (`hffrgidrbrspqdqbmcqz`) — these are private/test pages, they go through staging→main like any other change.

After insert, verify by running a quick read:
```sql
select p.slug, p.company_name, p.visibility, count(s.id) as scenario_count
from custom_demo_pages p
left join custom_demo_scenarios s on s.page_id = p.id
where p.slug = '<slug>'
group by p.id;
```

### Phase 6 — Report

Give the user:
- The staging URL: `https://staging.telitask.com/en/for/<slug>`
- The admin URL: `https://staging.telitask.com/en/admin/custom-demos/<slug>`
- A 1-line summary of what was seeded
- A reminder: *"Page is `private` — flip to `public` from admin when ready to share."*

## Conventions

- **No new SQL migration files.** This is data, not schema. Seed via MCP `execute_sql`.
- **Staging only.** Never seed production.
- **Slug is the access token.** Make it unguessable (4-char random suffix).
- **One scenario brainstorm per turn.** Don't dump three scenarios at once — the user can't react meaningfully.
- **Reuse the research summary.** When drafting founder_note and scenarios, pull specific details from the brief — don't write generic copy and then "add personalization".

## Red flags

If you find yourself doing any of these, stop and reset:
- Researching more than 5 URLs — you're past the "light" budget
- Drafting all 3 scenarios before showing the user any of them
- Writing a generic founder_note without flagging it as generic
- Using "automate", "notification", "workflow", or "leverage" anywhere in copy
- About to call `apply_migration` instead of `execute_sql` — these are data rows, not schema
- About to seed against `hffrgidrbrspqdqbmcqz` (production)

## References

- `references/brand-voice.md` — Banned words, preferred phrases, anchoring rules
- `references/scenario-prompt-template.md` — system_prompt and sell_prompt patterns
- `references/seed-sql-template.md` — Exact SQL to run via Supabase MCP
