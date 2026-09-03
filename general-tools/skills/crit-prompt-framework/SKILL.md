---
name: crit-prompt-framework
description: Turns a rough problem, goal, or half-formed idea into a structured CRIT prompt (Context, Role, Interview, Task) that pulls high-impact, non-obvious strategy out of an AI instead of generic advice. Use this whenever the user asks to write, format, sharpen, or "make a better" prompt, mentions CRIT by name, says an AI keeps giving them obvious or surface-level answers, or brings a strategic problem — growth, pricing, positioning, hiring, launch, retention, fundraising — where a structured expert-advisor prompt would beat asking the question flat. Also use when the user wants to be interviewed before receiving recommendations.
---

# CRIT Prompting Framework

CRIT is a four-part prompt structure that reliably beats a plain question:

- **C**ontext — the landscape, constraints, and real numbers
- **R**ole — the expert personas the AI should reason as
- **I**nterview — force clarifying questions before any answer
- **T**ask — a narrow, high-leverage deliverable

The whole point is the **I**. Most prompts fail because the AI answers a question it doesn't understand yet, and generic input produces generic output. Making the model interview first turns one shot into a conversation, and the answers get sharper because the model is reasoning from specifics rather than filling in plausible defaults.

## Step 1 — Decide which mode you're in

Two things the user might want. Infer from how they asked; if it's genuinely unclear, ask in one line.

**Build mode** (default): the user wants the *prompt itself* — a block of text to copy into another tool or a fresh chat. Signals: "write me a prompt", "format this as CRIT", "turn this into a prompt".

**Run mode**: the user wants you to *be* the CRIT prompt — take on the role, interview them, deliver the strategies here. Signals: "use CRIT on my problem", "help me figure out X", or they describe a problem and ask for advice without mentioning prompts at all.

In Run mode, skip writing out the template. Adopt the personas, ask your first question, and go. In Build mode, produce the prompt block, then offer to run it.

## Step 2 — Extract what you actually need

Before writing anything, check whether you have:

- The **specific problem**, not the category ("free users don't convert after the trial ends" beats "growth")
- **Numbers** — current metrics, targets, timeline, budget, team size
- **Who it's for** — the customer, the audience, the stakeholder
- **What's already been tried** and why it didn't work
- **Constraints** — money, time, headcount, regulation, technical debt

You will rarely have all of this. Don't stall on it. Write the prompt with `[bracketed placeholders]` for the gaps so the user can see exactly what to fill in — a visible blank is more useful than a vague sentence that hides the missing information.

## Step 3 — Write each section well

**CONTEXT.** Vivid and specific. Two to four sentences minimum, written in the user's voice ("I run a...", "We're at..."). Include the numbers. Name the obstacle plainly. The test: could a competitor read this and recognize the situation as distinct from a hundred others? If not, it's too thin.

**ROLE.** Two or three complementary personas, not one and not five. Complementary means they'd disagree productively — a growth architect and a direct-response copywriter see the same funnel differently, which is the value. Anchor each to an outcome, not a job title: "a pricing strategist who has taken B2B SaaS products from freemium to $50K ACV" is a better persona than "a pricing expert."

**INTERVIEW.** Use this clause close to verbatim, since the one-at-a-time constraint is what makes it work:

> Interview me. Ask me one question at a time, up to 3 questions total, to gain deeper context before generating your recommendations. Wait for my answer before asking the next question.

**TASK.** One deliverable, bounded by a number. "3 high-impact, non-obvious strategies" is the default and it's a good one — "non-obvious" is doing real work there, because it rules out the advice the user could have gotten from a blog post. Adapt the noun to the job: 3 positioning angles, 3 pricing experiments, 5 subject lines, a 90-day sequenced plan. Add an output constraint if the shape matters ("for each, include the mechanism, the first step, and the main risk").

## Output template

Present Build-mode output in a code block so it's easy to copy:

```text
CONTEXT:
[Situation in vivid detail — current state, real metrics, target audience, what you've tried, the specific obstacle, and your constraints.]

ROLE:
Act as a world-class [expert 1] and [expert 2] who specialize in [specific domain and outcome].

INTERVIEW:
Interview me. Ask me one question at a time, up to 3 questions total, to gain deeper context before generating your recommendations. Wait for my answer before asking the next question.

TASK:
Then generate 3 high-impact, non-obvious strategies I can deploy to solve this problem. For each one, include the underlying mechanism, the first concrete step, and the biggest risk.
```

## Worked example

**User says:** "Help me write a prompt — nobody's signing up for my newsletter."

**Output:**

```text
CONTEXT:
I write a weekly newsletter for [audience] about [topic]. I currently have [X] subscribers and add roughly [Y] per week. My landing page converts at [Z]%, and my main traffic source is [source]. I've already tried [tactic 1] and [tactic 2]; [tactic 1] did nothing and [tactic 2] worked for about two weeks before flattening. I have no paid acquisition budget and about [N] hours a week to spend on growth.

ROLE:
Act as a world-class audience growth strategist and a direct-response copywriter who together have taken independent newsletters from a few hundred subscribers to six figures without paid acquisition.

INTERVIEW:
Interview me. Ask me one question at a time, up to 3 questions total, to gain deeper context before generating your recommendations. Wait for my answer before asking the next question.

TASK:
Then generate 3 high-impact, non-obvious strategies I can deploy to grow subscriptions. For each one, include the underlying mechanism, the first concrete step, and the biggest risk.
```

Note what happened: "nobody's signing up" became a bracketed conversion rate, a named traffic source, and a stated constraint. That conversion — vague complaint into fillable specifics — is most of the skill.

## Step 4 — Hand back the stress tests

A first answer is a draft, not a plan. After delivering the prompt (Build mode) or the strategies (Run mode), tell the user how to pressure-test the output. Keep this to a couple of lines, not a lecture:

- **Challenger pass:** "Now act as a skeptical challenger. Find the flaws, edge cases, and hidden assumptions in what you just proposed."
- **Customer pass:** "Now act as my ideal customer, [describe them]. React honestly to strategy #2 — what would make you ignore it?"
- **Constraint pass:** "Cut the budget in half and the timeline to three weeks. Which of these survives, and what replaces the ones that don't?"

## What makes these fail

- **Context that's a category, not a situation.** "I run an e-commerce store" tells the model nothing it doesn't already assume.
- **Personas that are one person twice.** "A marketing expert and a growth expert" collapses into a single voice.
- **A task with no number.** "Give me strategies" produces a list of twelve, all obvious. Numbers force ranking.
- **Dropping the interview to save time.** This is the most common mistake and it costs the most. The three questions are where the model finds the thing the user didn't think to mention.
- **Filling gaps with invented specifics.** If you don't know the user's numbers, bracket them. Never guess a metric into the CONTEXT block and let it look like fact.
