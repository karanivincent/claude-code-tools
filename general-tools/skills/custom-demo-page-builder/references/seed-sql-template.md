# Seed SQL Template

Use `mcp__plugin_supabase_supabase__execute_sql` against **staging** (`pbtvpbrdpgpopieghany`). Never apply to production.

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
    cta_label,
    cta_url,
    expires_at
  ) values (
    'acme-x7k2',                                              -- slug
    'Acme Logistics',                                         -- company_name
    'Jane Doe',                                               -- contact_name (nullable)
    'Head of Operations',                                     -- contact_role (nullable)
    'jane@acme.example',                                      -- prospect_email (nullable)
    'logistics',                                              -- industry (nullable)
    array[                                                    -- pain_points text[]
      'Knowing every driver actually started their route on time',
      'Catching delays before customers call to complain',
      'Spending less of the morning chasing dispatchers'
    ],
    'Saw the Lagos expansion — congrats. Built a quick demo of how TeliTask could call your drivers each morning so your dispatchers stop chasing them. Three scenarios below, click any to ring your phone.',
    'Book a 15-min call',                                     -- cta_label
    'https://cal.com/vincent-telitask/15min',                 -- cta_url
    null                                                      -- expires_at (nullable)
  )
  returning id
)
insert into custom_demo_scenarios (
  page_id, slug, title, description, icon, preview,
  system_prompt, sell_prompt, voice_id, sort_order
)
select id, * from inserted_page,
(values
  (
    'driver-checkin',
    'Driver morning check-in',
    'AI calls each driver to confirm route start and capture delays',
    'truck',
    'Hi, this is your TeliTask assistant calling to confirm Driver 12 has started the morning route…',
    $prompt$You are TeliTask, calling Driver 12 to confirm route start. The user will role-play as the driver.

Your job:
1. Confirm they have started their route
2. Ask about delays or vehicle issues
3. Ask for ETA to first stop

Keep it warm but efficient. Drivers are busy.

End the call once you have the info.$prompt$,
    'That''s how every driver check-in could go at Acme Logistics — same call, same data, no dispatcher chasing.',
    'Aoede',
    0
  ),
  (
    'eta-callbacks',
    'Delay ETA callbacks',
    'AI calls customers proactively when a delivery slips by more than 30 min',
    'phone-call',
    'Hi, this is calling on behalf of Acme Logistics — wanted to let you know your delivery is running about 40 minutes late…',
    $prompt$You are TeliTask, calling on behalf of Acme Logistics. A delivery is running late and you need to proactively inform the customer. The user will role-play as that customer.

Your job:
1. Apologize for the delay
2. Give them a realistic new ETA window
3. Ask if anything changes for them about the delivery slot

Tone: warm, owning the issue, not defensive.

End the call once they have the info.$prompt$,
    'Every late delivery at Acme Logistics could trigger this call automatically — no more angry inbound calls.',
    'Aoede',
    1
  ),
  (
    'dispatcher-handoff',
    'Dispatcher escalation',
    'AI calls the on-call dispatcher when a delay exceeds the SLA threshold',
    'bell',
    'Hi, this is TeliTask — flagging that Route 7 has slipped past the 2-hour threshold and needs eyes…',
    $prompt$You are TeliTask, paging the on-call dispatcher because a route has crossed the SLA threshold. The user will role-play as the dispatcher.

Your job:
1. State which route and how long it has slipped
2. Tell them what the driver last reported
3. Ask if they want you to call the driver back for an update

Tone: brisk, just the facts. Dispatchers want signal, not friendliness.

End the call once they have decided next steps.$prompt$,
    'Acme Logistics dispatchers stop watching dashboards — they only get called when something is actually wrong.',
    'Aoede',
    2
  )
) as s(slug, title, description, icon, preview, system_prompt, sell_prompt, voice_id, sort_order);
```

## Verification query (run after insert)

```sql
select p.slug, p.company_name, count(s.id) as scenario_count
from custom_demo_pages p
left join custom_demo_scenarios s on s.page_id = p.id
where p.slug = 'acme-x7k2'
group by p.id, p.slug, p.company_name;
```

Expected: 1 row with `scenario_count = 3`.

## Notes on SQL gotchas

- **Dollar-quoted strings** (`$prompt$...$prompt$`) avoid escaping every apostrophe in scenario prompts. Use a unique tag (`$prompt$`, `$note$`) per field if needed.
- **Apostrophes in literals** (`'That''s'`) — use doubled single quotes, or switch the whole literal to dollar quoting.
- **`pain_points`** is `text[]` — use `array[...]` literal, not jsonb.
- **`expires_at`** accepts `null` (no expiry) or a `timestamptz` literal like `'2026-08-01 00:00:00+00'`.
- **`sample_call_*` columns** stay null at seed time — they get populated later via the admin "Promote to sample" action against a real recorded demo call.

## Updating an existing page

Don't re-insert with a new slug. Update by slug:

```sql
update custom_demo_pages
set founder_note = 'New version of the note',
    pain_points = array['updated', 'pain', 'points'],
    updated_at = now()
where slug = 'acme-x7k2';
```

Adding a 4th scenario:

```sql
insert into custom_demo_scenarios (page_id, slug, title, description, icon, preview, system_prompt, sell_prompt, voice_id, sort_order)
select id, 'new-scenario', '...', '...', 'calendar-check', '...', $prompt$...$prompt$, '...', 'Aoede', 3
from custom_demo_pages where slug = 'acme-x7k2';
```
