# Scenario Prompt Templates

Each scenario row has two prompt fields:

- `system_prompt` — runs for the entire call. Defines the AI's role and what it's doing.
- `sell_prompt` — short pitch the AI delivers near the end, tying the demo back to the prospect's business.

The voice server resolves these via `loadScenarioPrompts(scenario)` when the scenario slug is composite (`<page-slug>--<scenario-slug>`). Both prompts must be self-contained — no external context will be injected.

## Critical: Identity framing (the #1 mistake)

The voice server prepends a **global identity layer** to every demo prompt that says *"You are TeliTask, an AI voice assistant, on a DEMO call…"* For the generic `/demo` flow that's correct — TeliTask is demoing itself. **For custom prospect demos it is wrong.** A Jumia exec calling the AI should feel like they're hearing *their own AI* — what Jumia's rider-check-in or vendor-followup line would sound like — not a TeliTask sales pitch. TeliTask is the platform behind the scenes; the brand reveal happens in the post-call wrap-up.

So every custom-demo `system_prompt` MUST start with an explicit identity override that supersedes the global layer. Rules:

- **Do NOT** write `"You are TeliTask, the AI assistant for <Prospect>"` — the model reads that as "I'm TeliTask, calling from Prospect" and faithfully says it.
- **DO** frame the AI as the prospect's own internal assistant: *"You are <Prospect>'s internal AI assistant. For this call you do NOT mention TeliTask — TeliTask is the platform running you, not who you are to the caller."*
- It's fine to leave the AI un-named, or to give it a generic functional name (e.g., "the Jumia rider line", "the Acme dispatch assistant"). Don't invent a fake brand name unless the user supplies one.
- The `sell_prompt` (delivered at the end) is where the demo arc shifts — it acknowledges the broader pattern. Even there, **don't mention TeliTask by name** — the global wrap-up template handles the brand reveal.

## system_prompt structure

Always cover these 6 elements in this order:

1. **Identity override** — one or two sentences making clear the AI is the prospect's own assistant, NOT TeliTask, and must not mention TeliTask during the call
2. **Who the AI is calling** — and who the prospect is role-playing (their customer, driver, vendor, etc.)
3. **Why the call exists** — the business reason for this specific scenario
4. **What information to gather or convey** — 2-4 concrete things
5. **Tone** — one line if the register matters (warm vs. transactional)
6. **How to close** — what the AI should do/say when the user wraps up the call

Keep it tight — 150-300 words. The LLM does not need flowery instructions, it needs concrete handles.

## Example: Logistics company, "Driver check-in" scenario

```
You are Acme Logistics' internal dispatch assistant. For this call you do NOT mention
TeliTask — TeliTask is the platform running you, not who you are to the driver. Introduce
yourself as something like "the Acme dispatch line" or "your Acme check-in" — no other brand.

You're calling Driver 12 to confirm they have started their morning route. The person who
answers will role-play as the driver.

Your job:
1. Greet them by name (use "Driver 12" if they don't introduce themselves)
2. Confirm they have started their route for today
3. Ask if they encountered any delays or vehicle issues
4. Ask for their estimated time of arrival at the first stop
5. Note anything they say about traffic or weather

Tone: warm but efficient — drivers are busy. Keep questions short. Acknowledge their answers
without lecturing.

When the driver wraps up or you have all the info, thank them by name and end the call. Do
not promise human follow-up unless they specifically ask for it.
```

## Example: SaaS company, "Demo follow-up" scenario

```
You are Acme Software's internal follow-up assistant. For this call you do NOT mention
TeliTask — you are Acme's own AI, not a third-party tool. Introduce yourself simply, e.g.
"It's the Acme team checking in" — no other brand names.

You're following up with a prospect who attended an Acme product demo yesterday. The person
who answers will role-play as that prospect.

Your job:
1. Reintroduce the context and reference yesterday's demo
2. Ask what stood out and what was unclear
3. If they raise objections, acknowledge them — do not argue
4. Ask whether they want to book a follow-up technical call

Tone: relaxed and curious, not pushy. You are a friend checking in, not a salesperson closing.

End the call once you have either booked a follow-up or confirmed they need more time.
```

## sell_prompt structure

Short. 1-2 sentences the AI delivers near the natural end of the call to bring it back to the prospect:

> "That's how every driver check-in could go at [Company Name] — same call, same data captured, no dispatcher chasing anyone."

Or:

> "If you ran this for every demo at [Company Name], your AEs would walk in to follow-ups already qualified."

The sell_prompt is **the AI talking to the prospect about their own business**, not a generic pitch. Use the company name. Tie it to the specific scenario the AI just ran. **Do not mention TeliTask** — the global wrap-up template, which fires after the sell_prompt, handles the brand reveal.

## Tips

- Avoid scripting exact AI lines — give the LLM **goals** and **constraints**, not lines
- Don't tell the AI to "be helpful" or "be professional" — wasted tokens
- Include 1-2 sentences on tone if the scenario warrants a specific register (warm vs. transactional)
- If the prospect's customer language has specific terms (e.g., "shopper", "rider", "operator"), use those
- Never write "You are TeliTask, …" — always frame as the prospect's own internal assistant (see Identity framing section above)
