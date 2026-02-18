# Review Output Template

Produce the review in this exact structure. Omit structural quality sections that are all "Pass" — only include sections with findings.

```markdown
# Skill Review: [skill-name]

## Session Summary
[1-2 sentences: what the skill was used for and the overall outcome]

## Runtime Effectiveness

### Workflow Completeness — [Pass/Needs improvement/Missing]
[Evidence from session + specific recommendation]

### Tool Availability — [Pass/Needs improvement/Missing]
[Evidence + recommendation]

### Edge Case Handling — [Pass/Needs improvement/Missing]
[Evidence + recommendation]

### Output Quality — [Pass/Needs improvement/Missing]
[Evidence + recommendation]

### Decision Points — [Pass/Needs improvement/Missing]
[Evidence + recommendation]

### Context Efficiency — [Pass/Needs improvement/Missing]
[Evidence + recommendation]

### Automation Opportunities
- [Opportunity 1]: [what was done manually] → [how to automate]
- [Opportunity 2]: [skill chain suggestion]
- [Opportunity 3]: [repeated pattern → new skill or skill step]

## Structural Quality

### Frontmatter — [Pass/Needs improvement]
[Finding if not Pass]

### Token Efficiency — [Pass/Needs improvement]
[Finding if not Pass]

### Progressive Disclosure — [Pass/Needs improvement]
[Finding if not Pass]

### Degrees of Freedom — [Pass/Needs improvement]
[Finding if not Pass]

## Priority Improvements
1. [Highest impact change — specific and actionable]
2. [Second highest]
3. [Third]

## Verdict
[One-line summary: "Effective but missing X and Y" or "Well-structured, main gap is Z"]
```

## Rules

- **Evidence-based:** Every finding must cite specific evidence from the conversation or skill files. No generic observations.
- **Actionable:** Each recommendation must be specific enough to act on. Not "improve error handling" but "add a Step 3.5 for diagnosing Sentry gaps when no errors are found."
- **Concise:** Keep each category section to 2-4 sentences. The review should be scannable.
- **Priority matters:** The Priority Improvements list is the most important section. Rank by impact, not by category order.
- **Pass is fine:** Not every category needs improvement. If it worked well, score it Pass and move on. Only elaborate on findings.
- **Automation opportunities are always included:** Even if everything else passes, there are usually automation opportunities to identify.
