# Seed SQL Template

Use `mcp__plugin_supabase_supabase__execute_sql` against **staging** (`pbtvpbrdpgpopieghany`). Never apply to production.

The example below shows the default off-hours mix: **two inbound after-hours scenarios + one outbound missed-call callback**. See `scenario-prompt-template.md` for the prompt patterns.

## One-shot insert (page + 3 scenarios in a single CTE)

```sql
with inserted_page as (
  insert into custom_demo_pages (
    slug,
    company_name,
    contact_name,
    contact_role,
    prospect_email,
    industry,
    pain_points,
    founder_note,
    cta_phone,
    cta_whatsapp,
    cta_email,
    country,
    expires_at
  ) values (
    'carsoko-k3p9',                                          -- slug
    'Carsoko',                                               -- company_name
    'Patrick',                                               -- contact_name (nullable)
    'Head of Sales',                                         -- contact_role (nullable)
    'info@carsoko.net',                                      -- prospect_email (nullable)
    'automotive',                                            -- industry (nullable)
    array[                                                   -- pain_points text[]
      'Calls after 6pm go to voicemail',
      'Weekend buyers can''t reach anyone',
      'Hot leads ring the next dealer instead'
    ],
    $note$Hi Patrick — when someone calls Carsoko at 9pm about a Land Cruiser and gets voicemail, they just ring the next dealer. I built you a line that picks up after hours and books them in instead. Tap any scenario below to have it call you now.$note$,
    '+254704985136',                                         -- cta_phone (renders as the tel: CTA)
    '+254704985136',                                         -- cta_whatsapp (renders as the wa.me CTA)
    null,                                                    -- cta_email (nullable)
    'Kenya',                                                 -- country — REPLACE with the prospect's actual country; it drives the AI accent at call time
    null                                                     -- expires_at (nullable)
  )
  returning id
)
insert into custom_demo_scenarios (
  page_id, slug, title, description, icon, preview,
  system_prompt, sell_prompt, voice_id, sort_order
)
select ip.id, s.slug, s.title, s.description, s.icon, s.preview,
       s.system_prompt, s.sell_prompt, s.voice_id, s.sort_order
from inserted_page ip
cross join (values
  (
    'after-hours-enquiry',
    'After-hours buyer call',
    'A buyer calls after closing — the line picks up, qualifies, and books a visit',
    'phone-incoming',
    'Carsoko''s after-hours line — you''re calling about a car this evening, and a real voice picks up…',
    $prompt$You are Carsoko's after-hours sales line. For this call you do NOT mention TeliTask — you are Carsoko's own line, not a third-party tool. Introduce yourself simply, e.g. "Carsoko's after-hours line".

It is after the showroom has closed. Someone has just called about a car and you picked up. The person who answers is role-playing that caller — a buyer browsing in the evening who expected voicemail.

Your job:
1. Greet them warmly — they're pleasantly surprised a real voice picked up
2. Find out which car or type of car they're interested in
3. Ask 2-3 quick qualifying questions: budget range, trade-in, how soon
4. Book them a showroom visit or a morning callback and capture their number

Tone: warm, confident, never pushy — this is a high-value purchase.

When a visit or callback is booked, confirm the details back to them and end the call.

TURN-TAKING RULES (non-negotiable):
1. Maximum 2 sentences per turn. If you need to say more, stop and wait.
2. ONE question per turn. Never stack questions.
3. After giving information, STOP. Do not follow up with a question in the same turn.
4. After asking a question, STOP. Wait for the answer before saying anything else.
5. When the caller answers, acknowledge briefly (1 sentence max) before your next point.

BAD (info dump + stacked questions):
'Great news, your vehicle is ready for pickup at our Limuru Road showroom. We have completed the full inspection and detailing. Would morning or afternoon work better? And will you be paying the balance by bank transfer?'

GOOD (one thing, then wait):
'Your vehicle is ready for pickup at our Limuru Road showroom. When works best for you to come by?'
[Wait for answer]
'Morning works. Will you be paying the balance by transfer or at the showroom?'$prompt$,
    'That''s how every after-hours call to Carsoko could go — picked up, qualified, and booked, instead of going to voicemail.',
    'Aoede',
    0
  ),
  (
    'urgent-callback',
    'Urgent buyer, ready now',
    'A serious buyer calls after hours ready to move — the line captures and fast-tracks them',
    'siren',
    'Carsoko''s after-hours line — you''ve got cash ready for an SUV and need someone tonight…',
    $prompt$You are Carsoko's after-hours sales line. For this call you do NOT mention TeliTask — you are Carsoko's own line. Introduce yourself simply, e.g. "Carsoko's after-hours line".

It is after closing. A serious, ready-to-buy customer has called and you picked up. The person who answers is role-playing that caller — they want to move quickly, maybe today or tomorrow.

Your job:
1. Greet them and acknowledge they've reached the after-hours line
2. Find out exactly what they want and how ready they are (financing, cash, trade-in)
3. Treat this as hot — lock in the earliest possible visit or a first-thing callback from a salesperson
4. Capture their name, number, and the car of interest

Tone: warm and responsive — match their urgency without being pushy.

Once the next step is locked in, confirm it and end the call.

TURN-TAKING RULES (non-negotiable):
1. Maximum 2 sentences per turn. If you need to say more, stop and wait.
2. ONE question per turn. Never stack questions.
3. After giving information, STOP. Do not follow up with a question in the same turn.
4. After asking a question, STOP. Wait for the answer before saying anything else.
5. When the caller answers, acknowledge briefly (1 sentence max) before your next point.

BAD (info dump + stacked questions):
'Great news, your vehicle is ready for pickup at our Limuru Road showroom. We have completed the full inspection and detailing. Would morning or afternoon work better? And will you be paying the balance by bank transfer?'

GOOD (one thing, then wait):
'Your vehicle is ready for pickup at our Limuru Road showroom. When works best for you to come by?'
[Wait for answer]
'Morning works. Will you be paying the balance by transfer or at the showroom?'$prompt$,
    'A buyer this ready won''t wait — Carsoko''s line catches them tonight instead of losing them to the next dealer by morning.',
    'Aoede',
    1
  ),
  (
    'missed-call-callback',
    'Missed-call auto-callback',
    'A call came in after hours and wasn''t answered — the line rings them back first thing',
    'phone-missed',
    'Carsoko, returning your call — sorry we missed you last night, what were you after?…',
    $prompt$You are Carsoko's sales line. For this call you do NOT mention TeliTask — you are Carsoko's own line. Introduce yourself simply, e.g. "Carsoko, returning your call".

Someone called or messaged Carsoko after hours and no one picked up. You are calling them back first thing. The person who answers is role-playing that customer.

Your job:
1. Apologise warmly for missing their call
2. Find out what they were after
3. Qualify briefly (which car, budget, timeline) and book a visit or hold the car
4. Capture anything the showroom should have ready

Tone: warm, a little apologetic, eager to help — you don't want to lose them.

Once the next step is booked, confirm it and end the call.

TURN-TAKING RULES (non-negotiable):
1. Maximum 2 sentences per turn. If you need to say more, stop and wait.
2. ONE question per turn. Never stack questions.
3. After giving information, STOP. Do not follow up with a question in the same turn.
4. After asking a question, STOP. Wait for the answer before saying anything else.
5. When the caller answers, acknowledge briefly (1 sentence max) before your next point.

BAD (info dump + stacked questions):
'Great news, your vehicle is ready for pickup at our Limuru Road showroom. We have completed the full inspection and detailing. Would morning or afternoon work better? And will you be paying the balance by bank transfer?'

GOOD (one thing, then wait):
'Your vehicle is ready for pickup at our Limuru Road showroom. When works best for you to come by?'
[Wait for answer]
'Morning works. Will you be paying the balance by transfer or at the showroom?'$prompt$,
    'Every missed call at Carsoko could get this callback first thing — no buyer left for the competitor overnight.',
    'Aoede',
    2
  )
) as s(slug, title, description, icon, preview, system_prompt, sell_prompt, voice_id, sort_order);
```

## Verification query (run after insert)

```sql
select p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country, count(s.id) as scenario_count
from custom_demo_pages p
left join custom_demo_scenarios s on s.page_id = p.id
where p.slug = 'carsoko-k3p9'
group by p.id, p.slug, p.company_name, p.cta_phone, p.cta_whatsapp, p.country;
```

Expected: 1 row with `scenario_count = 3`, and `cta_phone` / `cta_whatsapp` / `country` set as intended.

## Notes on SQL gotchas

- **Dollar-quoted strings** (`$prompt$...$prompt$`, `$note$...$note$`) avoid escaping every apostrophe in prompts and the founder note. Use a unique tag per field if a value itself contains the tag.
- **Apostrophes in array literals** (`'can''t'`) — double the single quote, since `array[...]` elements are plain quoted strings.
- **`pain_points`** is `text[]` — use `array[...]` literal, not jsonb.
- **`expires_at`** accepts `null` (no expiry) or a `timestamptz` literal like `'2026-08-01 00:00:00+00'`.
- **`sample_call_*` columns** stay null at seed time — they get populated later via the admin "Promote to sample" action against a real recorded demo call.
- **CTA columns** — the public page renders the CTA only from `cta_phone`, `cta_whatsapp`, and `cta_email`. `cta_url` / `cta_label` are **deprecated** and NOT rendered on the public page; leave them out (or null) and never use them as the visible CTA.
- **`country`** drives the AI accent at call time — the voice server reads it and speaks with that country's accent. So never write a "speak with X accent" line into a `system_prompt`; set `country` instead.

## Updating an existing page

Don't re-insert with a new slug. Update by slug:

```sql
update custom_demo_pages
set founder_note = $note$New version of the note$note$,
    pain_points = array['updated', 'pain', 'points'],
    cta_phone = '+254704985136',
    cta_whatsapp = '+254704985136',
    country = 'Kenya',  -- set the prospect's actual country; drives the AI accent
    updated_at = now()
where slug = 'carsoko-k3p9';
```

Adding a 4th scenario:

```sql
insert into custom_demo_scenarios (page_id, slug, title, description, icon, preview, system_prompt, sell_prompt, voice_id, sort_order)
select id, 'new-scenario', '...', '...', 'calendar-check', '...', $prompt$...$prompt$, '...', 'Aoede', 3
from custom_demo_pages where slug = 'carsoko-k3p9';
```
