---
name: custom-demo-page-builder
description: >
  Research a prospect and seed a personalized TeliTask custom demo page at `/for/<slug>`, built around
  the calls that specific business actually makes or takes. End-to-end flow: light web research →
  interactive brainstorm of the page sections → write rows to Supabase (production or staging) via MCP.
  Triggers: "build a custom demo for", "seed a demo page for", "create a /for page for",
  "personalize a demo for", "prep a demo for [company]", "custom demo prospect".
  Only for the TeliTask custom-demos feature (table `custom_demo_pages` + `custom_demo_scenarios`).
---

# Custom Demo Page Builder

Research a prospect company and seed a personalized custom demo page at `/for/<slug>`. Walks the user through the page sections, applies TeliTask brand voice, and writes rows directly to Supabase via the Supabase MCP. Because these pages must be reachable by real prospects, the skill seeds **production by default** but asks before every write and lets you redirect to staging for test runs.

**Scope:** This skill only handles the TeliTask custom-demos feature. It does NOT handle the generic `/demo` page or `demo_scenarios` table.

## These pages are discovery instruments, not closes

TeliTask is in customer discovery. The point of a `/for/` page is to get a specific person to hear a call and then tell you what it got wrong. It is not to book them.

That changes what a good page looks like:

- The page ends by asking a question, not by pitching. The prospect's correction is the deliverable.
- **Never put a price on the page.** Pricing for the current direction is unset. No figures, no ranges, no "starting from".
- Don't oversell what TeliTask does. Overpromising buys a polite yes, which teaches you nothing.
- Statistics stay off the page entirely — they brief you, not the prospect.

## Start from what you actually know

**This skill has no built-in wedge, and you should not invent one.** Positioning is changing month to month; anything hardcoded here would be stale by the time you used it. Build each page around what is true of *this* prospect.

Order of evidence, strongest first:

1. **What the prospect said in conversation.** If the user has notes or a quote, that is the page. Nothing else comes close.
2. **What the user knows about them** — the industry, a mutual connection, something they observed.
3. **What research turns up** about how the business operates.
4. **Inference from the operating model.** Weakest. Label it as a guess and check it with the user.

If you have nothing beyond a company name and a URL, say so plainly and ask the user what they know before you research. A page built on invented pain reads as invented.

For background on the calls different businesses make and take, and how prior prospects have reacted to each framing, see `references/call-patterns.md`. It is a menu to choose from, not a template to apply.

### The core mechanic (read before drafting scenarios)

The demo platform always **dials the prospect's phone**. Each scenario then picks one of two framings:

- **Outbound** — the AI is the business's own line placing one of its real calls. The prospect role-plays whoever normally receives it: their customer, their driver, their regional rep. The framing matches reality, so it needs no reversal.
- **Inbound** — the AI is the business's own line *answering* a call. The prospect role-plays the person who rang in. The platform still dials them, so the prompt must state clearly that the AI has picked up.

Pick per scenario, based on which calls matter to this business. Neither is the default. See `references/scenario-prompt-template.md` for both structures.

### The objection to pre-empt

Prospects hear "AI phone line" and picture a pre-recorded IVR menu. The page's job is to get them to tap a scenario and hear a real conversation as fast as possible. Keep the founder note short and the call obvious.

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
- **Anything the user already knows about this prospect** — a conversation they've had, a specific complaint, a mutual connection. Ask for this explicitly; it outranks everything you can research.
- Prospect contact name + role + email (optional but recommended)
- Industry (if not obvious from the URL)
- Prospect country (drives the AI accent at call time — default "Kenya" if not given)

### Phase 1 — Light research (2-5 fetches max)

WebFetch in this order:
1. Company homepage — what they sell or do, and for whom
2. About / Contact / Careers pages — the operating shape: hours, branches, regions, fleet, field staff, and any job listings that involve phones (customer care, dispatch, tele-sales, front desk)
3. **One** optional WebSearch (last 90 days) only if the site is thin

You are trying to answer: **which phone calls does this business depend on?** Both directions count.

- Who calls them, and what happens to those calls?
- Who do they call, how often, and who is paid to do it?
- What breaks when one of those calls doesn't happen — a wasted trip, a lost customer, a stalled decision?

Hard cap: 5 fetches. Websites rarely reveal internal call workflows, so expect to infer and then **ask the user**. If the prospect is opaque, say so plainly rather than inventing a workflow.

### Phase 2 — Research brief

Show the user a tight summary (under 200 words) covering:
- **Industry / what they do** — one sentence
- **Likely buyer persona** — who at this company owns the phone problem
- **The calls that matter** — which calls you believe this business lives on, in or out, and why. Label every guess as a guess.
- **3-5 candidate pain points** — phrased the way they'd say it
- **Founder-note hook** — one specific angle, ideally something the user heard directly

End with: *"How much of this is guesswork I should check with you before we build?"*

### Phase 3 — Brainstorm the page

Walk through these sections **one at a time** — propose a draft, get the user's reaction, refine, lock it in, move on.

#### 3a. Slug

Generate: `<company-kebab>-<4-char-random>` (e.g., `acme-x7k2`, `northwind-h4q9`). The random suffix makes the URL unguessable so the slug itself acts as the access token. Confirm with the user before locking.

#### 3b. Hero

- `company_name` — exactly as the prospect uses it (preserve casing, drop "Inc." unless they use it)
- `contact_name` (if known) — used for the on-page greeting only, never for the call itself
- `contact_role` (if known)

#### 3c. Founder note (`founder_note`)

A 2-4 sentence message from Vincent. Should:
- Lead with something specific and true about *their* calls
- Say plainly that tapping a scenario will call them
- Sound like a real DM, not marketing copy
- **No statistics**
- **No price**
- **Avoid** the banned words (see `references/brand-voice.md`)

If the user has told you something the prospect said in conversation, use their words.

If research turned up nothing specific, draft a generic version and flag it: *"This is generic — got anything specific you want to lead with?"*

#### 3d. Pain points (`pain_points text[]`)

3-5 short bullets in the prospect's voice. Each one a single line, sentence case, no trailing punctuation. Outcomes they want, not features TeliTask has. No statistics.

A concrete number the prospect gave you is the single strongest line on the page. An invented one is the weakest — if you don't have a real number, stay qualitative.

#### 3e. Scenarios (3 rows in `custom_demo_scenarios`)

Pick the three calls that matter most to *this* business, from `references/call-patterns.md` or from what the prospect described. Mix inbound and outbound freely — choose by what's true, not by a template.

Sanity check before locking: would this prospect recognise all three as calls their business actually involves? If one is there to show off a capability rather than because they'd recognise it, cut it.

For each scenario collect:
- `slug` — kebab-case, unique within the page
- `title` — short label (3-5 words)
- `description` — one sentence the prospect reads on the card
- `icon` — a **lucide-react** icon name (e.g. `phone-outgoing`, `phone-incoming`, `phone-call`, `calendar-clock`, `package-check`, `clipboard-check`, `truck`, `clock`). Match the scenario semantically.
- `preview` — the one-line transcript hint shown on the card
- `system_prompt` — the LLM system prompt. **MUST** open with an identity override framing the AI as the prospect's own line (NOT TeliTask) and telling it not to mention TeliTask during the call. State the direction explicitly — the AI is placing this call, or has answered it. **Every** `system_prompt` MUST include the verbatim turn-taking block — see `references/scenario-prompt-template.md`. Never bake a "speak with X accent" line into the prompt; accent comes from the page `country` column.
- `sell_prompt` — **not used at call time.** The voice server selects the column but never injects it. It is `not null`, so write a short neutral close ("Wrap up naturally, thank them for their time, and end the call.") and move on. Do not craft a pitch here.
- `voice_id` — default `'Aoede'` (Gemini female voice). If the user wants a different voice, query `select voice_id from voices where is_default = true` against the project you're about to seed (see Phase 5).
- `sort_order` — 0, 1, 2

**Do not write anything about the caller's name into a prompt.** The page asks whoever is testing for their own name and passes that to the call; if they leave it blank the AI greets them anonymously. Naming anyone in the prompt overrides that and breaks the demo for whoever the link got forwarded to.

#### 3f. CTA

The public page renders the CTA only from these dedicated columns:
- `cta_phone` — the tel: CTA. Default to `+254704985136` (Vincent's contact number).
- `cta_whatsapp` — the wa.me CTA. Default to `+254704985136` as well.
- `cta_email` — optional mailto CTA. Leave null unless the user wants it.

`cta_url` / `cta_label` are **deprecated** and NOT rendered on the public page.

The closing copy above these buttons asks the prospect what the demo got wrong. It is hardcoded in `ClosingCta.tsx`, not per-page — you don't write it, but don't undercut it by writing a closing pitch elsewhere on the page.

#### 3g. Metadata

- `country` — free text, e.g. "Kenya" (default "Kenya"). The voice server reads it and makes the AI speak with that country's accent at call time, so set it accurately. Never encode the accent in a `system_prompt`.
- `expires_at` — optional. If the user wants the page to auto-expire (e.g., 30 days), capture as a timestamp.
- `industry` — capture for filtering/analytics
- `prospect_email` — capture if known, for follow-up tracking

Access control: there is none beyond the slug. Anyone with the link can view the page and trigger a demo call. The unguessable 4-char suffix IS the access token.

### Phase 4 — Review before seeding

Re-read every piece of copy against `references/brand-voice.md`. Flag any rule violations and propose fixes inline. Also confirm:
- **No price** anywhere on the page
- **No statistics** in the founder note or pain points
- Every claim on the page traces back to something the user or the research actually established — nothing invented
- Each scenario states its direction, and inbound prompts read as the AI **answering**
- No `system_prompt` says "You are TeliTask…"
- **Every** `system_prompt` includes the verbatim turn-taking block
- No `system_prompt` bakes in an accent line — accent comes from the page `country`
- No `system_prompt` names the person who will answer
- The CTA uses `cta_phone` / `cta_whatsapp` (not the deprecated `cta_url` / `cta_label`)

Common offenders: "automate" → "handles"/"makes the calls"; "notification" → "phone call"; "workflow" → "the round of calls"; quoting a price; anchoring against human VAs or against other AI tools.

### Phase 5 — Seed via Supabase MCP

**First, pick the target.** Ask the user which database to seed — use AskUserQuestion with two options, **default/recommended: production** (so the page is reachable by real prospects):
- **Production** → `hffrgidrbrspqdqbmcqz` — the live page real prospects will visit. Recommend this.
- **Staging** → `pbtvpbrdpgpopieghany` — for test runs only; not reachable by prospects.

Do **not** seed until the user has confirmed the target in this run. A prior run's choice does not carry over — ask every time. Set `project_id` on every `execute_sql` call to the confirmed project, and remember it for the voice query (Phase 3e) and the verification + report.

Then use `mcp__plugin_supabase_supabase__execute_sql` against the confirmed project.

**Single transaction**: insert the page row, capture the returned id, then insert the 3 scenarios. See `references/seed-sql-template.md` for the exact SQL pattern.

After insert, verify against the **same project**:
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
- The CTA fields set and the `country` value (so the user can confirm the accent)
- **What on the page is a guess.** List the assumptions the page rests on, so the user knows what to listen for when the prospect reacts. This is the discovery payload.
- For WhatsApp-heavy Kenyan prospects: a one-line honest caveat that the demo is voice-only and may underweight WhatsApp (see `call-patterns.md` → Kenya note). Tell the **user**, never put it on the page.

## Conventions

- **Build from evidence, not from a wedge.** What the prospect said beats what you inferred.
- **No price, ever.** Pricing is unset.
- **No stats on the page.** Statistics brief the operator only.
- **No new SQL migration files.** This is data — seed via MCP `execute_sql`.
- **Ask which database every run.** Default to production, but confirm before any write.
- **Slug is the access token.** Make it unguessable (4-char random suffix).
- **One scenario brainstorm per turn.** Don't dump three scenarios at once.
- **Reuse the research brief.** Pull specific details into founder_note and scenarios — don't write generic copy and then "add personalization".

## Red flags

If you find yourself doing any of these, stop and reset:
- **Inventing a pain point** the prospect never mentioned and the research never showed — say "I don't know" instead
- Applying a wedge because a previous page used it, rather than because it fits this prospect
- Putting a **price** or a **statistic** on the page
- Writing a **closing pitch** — these pages ask a question, they don't close
- An inbound scenario whose prompt has the AI *placing* the call, or vice versa
- Researching more than 5 URLs — past the "light" budget
- Drafting all 3 scenarios before showing the user any of them
- Writing a generic founder_note without flagging it as generic
- Using "automate", "notification", "workflow", or "leverage" anywhere in copy
- About to call `apply_migration` instead of `execute_sql` — these are data rows, not schema
- Seeding **without asking** which database in this run
- Reporting URLs on the wrong host — production seeds get `telitask.ai`, staging seeds get `staging.telitask.com`
- Writing `"You are TeliTask, …"` in any scenario `system_prompt`
- A `system_prompt` **missing the turn-taking block** — every prompt must carry it verbatim
- A `system_prompt` that **names the person who answers** — the page collects that from whoever is actually testing
- **Baking an accent line** into a `system_prompt` instead of setting the page `country`
- Using `cta_url` / `cta_label` as the visible CTA

## References

- `references/call-patterns.md` — menu of inbound and outbound call shapes by industry, what discovery has shown about each, Kenya/WhatsApp note
- `references/brand-voice.md` — banned words, preferred phrases, anchoring rules
- `references/scenario-prompt-template.md` — inbound and outbound `system_prompt` structures with examples
- `references/seed-sql-template.md` — exact SQL to run via Supabase MCP

The canonical cross-path conventions for this feature live at `docs/custom-demo-conventions.md` in the telitask-development repo — the dashboard AI generator follows the same rules. Keep this skill in sync with that doc.
