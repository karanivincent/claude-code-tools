---
name: skill-reviewer
description: >
  Review and analyze skills after real-world usage to identify improvement opportunities.
  Evaluates runtime effectiveness (workflow gaps, tool issues, edge cases, automation opportunities)
  and structural quality (token efficiency, progressive disclosure, frontmatter).
  Produces a scored review report with prioritized, actionable recommendations.
  Triggers: "review this skill", "review the skill I just used", "what can we improve about this skill",
  "skill review", "how did that skill perform", "analyze skill", "/skill-reviewer [skill-name]".
  Use after completing a task that involved a skill, while the session context is fresh.
---

# Skill Reviewer

Review skills after real-world usage. Produce a scored report with actionable improvement recommendations.

**This skill reviews only. It does NOT edit skill files or implement changes.**

## Workflow

### Step 1: Identify the Skill

Determine which skill to review:
- **Named explicitly:** User says "/skill-reviewer issue-documenter" → read that skill
- **Implicit:** User says "review the skill I just used" → scan conversation for skill invocations

Read the skill's SKILL.md and list its reference files (read references only when evaluating structural quality).

### Step 2: Analyze Session Context

Scan the current conversation for evidence. Look for:
- Which skill steps were followed, skipped, or reordered
- Actions improvised outside the skill's workflow (these are the gaps)
- Tool failures, retries, fallback paths taken
- Manual actions the user performed after the skill finished
- Edge cases encountered and how they were handled
- Decisions made without skill guidance

### Step 3: Evaluate Runtime Effectiveness

Read [references/analysis-framework.md](references/analysis-framework.md) for detailed criteria per category.

Score each category as **Pass / Needs improvement / Missing**:

1. **Workflow completeness** — Steps match reality? Gaps or improvised steps?
2. **Tool availability** — Assumed tools available? Fallbacks? Discovery guidance?
3. **Edge case handling** — Unexpected situations covered? Dead ends?
4. **Output quality** — Template matched need? Missing or unused sections?
5. **Decision points** — Guided decisions or improvised?
6. **Context efficiency** — Loaded only what was needed?
7. **Automation opportunities** — Manual steps that could be automated? Skill chains? Repeated patterns deserving their own skill?

Every finding must cite specific evidence from the conversation.

### Step 4: Evaluate Structural Quality

Read the skill's SKILL.md and reference files. Score each:

1. **Frontmatter** — Description comprehensive? Clear triggers?
2. **Token efficiency** — Under 500 lines? Proper split between SKILL.md and references?
3. **Progressive disclosure** — References loaded on demand? Clear guidance on when to read?
4. **Degrees of freedom** — Rigid where fragile? Flexible where context-dependent?

### Step 5: Produce Review

Read [references/review-template.md](references/review-template.md) for the exact output format.

Compile findings into the template. Rules:
- Cite specific conversation evidence for every runtime finding
- Rank Priority Improvements by impact, not category order
- Keep each section to 2-4 sentences — the review should be scannable
- Always include Automation Opportunities, even if everything else passes
- Omit structural sections that are all "Pass"
