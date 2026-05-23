# Scenario Prompt Templates

Each scenario row has two prompt fields:

- `system_prompt` — runs for the entire call. Defines the AI's role and what it's doing.
- `sell_prompt` — short pitch the AI delivers near the end, tying the demo back to the prospect's business.

The voice server resolves these via `loadScenarioPrompts(scenario)` when the scenario slug is composite (`<page-slug>--<scenario-slug>`). Both prompts must be self-contained — no external context will be injected.

## system_prompt structure

Always cover these 5 elements:

1. **Who the AI is** — usually "the TeliTask AI assistant" or named for the prospect's context
2. **Who the AI is calling** — and who the prospect is role-playing (their customer, driver, vendor, etc.)
3. **Why the call exists** — the business reason for this specific scenario
4. **What information to gather or convey** — 2-4 concrete things
5. **How to close** — what the AI should do/say when the user wraps up the call

Keep it tight — 150-300 words. The LLM does not need flowery instructions, it needs concrete handles.

## Example: Logistics company, "Driver check-in" scenario

```
You are TeliTask, the AI assistant for Acme Logistics. You are calling Driver 12 to confirm
they have started their morning route. The person who answers will role-play as the driver.

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
You are TeliTask, calling on behalf of Acme Software. You are following up with a prospect
who attended a product demo yesterday. The person who answers will role-play as that prospect.

Your job:
1. Reintroduce yourself and reference yesterday's demo
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

The sell_prompt is **the AI talking to the prospect about their own business**, not a generic pitch. Use the company name. Tie it to the specific scenario the AI just ran.

## Tips

- Avoid scripting exact AI lines — give the LLM **goals** and **constraints**, not lines
- Don't tell the AI to "be helpful" or "be professional" — wasted tokens
- Include 1-2 sentences on tone if the scenario warrants a specific register (warm vs. transactional)
- If the prospect's customer language has specific terms (e.g., "shopper", "rider", "operator"), use those
