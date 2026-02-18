# Analysis Framework

Detailed evaluation criteria for all 11 review categories.

## Runtime Effectiveness (7 categories)

### 1. Workflow Completeness

**Score: Pass / Needs improvement / Missing**

Check the conversation for:
- Steps the skill prescribed that were actually followed
- Steps that were skipped as irrelevant
- Actions improvised that weren't in the skill (these are the gaps)
- Steps followed in a different order than prescribed

**Evidence pattern:** "The skill prescribes steps A, B, C. In this session, step B was skipped and step D was improvised between A and C."

**Common findings:**
- Missing preparatory steps (tool checks, code reading, context gathering)
- Missing post-workflow steps (creating issues, notifying, committing)
- Steps that assume prior context the user doesn't have

### 2. Tool Availability

**Score: Pass / Needs improvement / Missing**

Check for:
- Tools the skill references that weren't available (MCP servers, CLI tools, browser extensions)
- Whether the skill has fallback paths for unavailable tools
- Whether the skill guides tool discovery or assumes tools are ready
- Wasted attempts on unavailable tools before falling back

**Evidence pattern:** "The skill references Vercel CLI as primary tool, but it wasn't authenticated. No fallback was suggested until the user mentioned the Vercel MCP."

### 3. Edge Case Handling

**Score: Pass / Needs improvement / Missing**

Check for:
- Unexpected situations encountered during the session
- Whether the skill's edge case table covered what happened
- Dead ends — situations where the skill gave no guidance
- Workarounds the user or Claude improvised

**Evidence pattern:** "Sentry returned no errors for a confirmed bug. The skill says 'report no errors found and move on' but the absence of errors was itself significant."

### 4. Output Quality

**Score: Pass / Needs improvement / Missing**

Check for:
- Whether the template/format matched the actual need
- Sections in the template that weren't used
- Information that was needed but had no template section
- Output that needed significant manual editing after the skill produced it

**Evidence pattern:** "The bug report template lacked a Code Analysis section. The report had to include code findings in a custom format."

### 5. Decision Points

**Score: Pass / Needs improvement / Missing**

Check for:
- Moments where Claude or the user had to make a judgment call
- Whether the skill provided guidance for those decisions
- Decisions that were improvised (when to ask user, when to split, when to skip)
- Whether the skill's decision guidance was too rigid or too vague

**Evidence pattern:** "When investigation revealed a second bug, the skill had no guidance on whether to file it separately or include it in the primary report."

### 6. Context Efficiency

**Score: Pass / Needs improvement / Missing**

Check for:
- References that were loaded but not used
- Information in SKILL.md that could be in a reference file (loaded on demand)
- Large blocks of context that added no value to the session
- Missing context that had to be gathered manually

**Evidence pattern:** "The env-vars.md reference was loaded at the start but the browser fallback URLs were never needed because MCP tools were available."

### 7. Automation Opportunities

**No score — list findings.**

Check for:
- Manual steps the user performed after the skill finished (e.g., "create these in Linear", "commit this")
- Repeated patterns across sessions that could become skill steps
- Multiple skills used in sequence that could be chained (e.g., skill → brainstorming → skill-creator)
- Steps where the user made a decision that could be automated with a default + override

**Output format:**
```
- [What was done manually] → [How to automate it]
- [Skill A then Skill B pattern] → [Suggest chain or combined skill]
- [Repeated user action] → [Add as optional post-workflow step]
```

---

## Structural Quality (4 categories)

### 8. Frontmatter Quality

**Score: Pass / Needs improvement**

Check:
- Is `description` comprehensive enough for Claude to know when to trigger?
- Does it list specific trigger phrases/keywords?
- Does it describe both what the skill does AND when to use it?
- Is the name clear and discoverable?

### 9. Token Efficiency

**Score: Pass / Needs improvement**

Check:
- Is SKILL.md under 500 lines?
- Is information split between SKILL.md (workflow) and references (details)?
- Any duplication between SKILL.md and reference files?
- Could any SKILL.md content be moved to references without losing workflow clarity?

### 10. Progressive Disclosure

**Score: Pass / Needs improvement**

Check:
- Are references loaded only when needed?
- Does SKILL.md clearly state when to read each reference?
- Are references one level deep (no nested references)?
- Do longer reference files have a table of contents?

### 11. Degrees of Freedom

**Score: Pass / Needs improvement**

Check:
- Are fragile operations (tool commands, API calls) specified exactly?
- Are context-dependent decisions left flexible?
- Is the skill over-specified (rigid where it should be flexible)?
- Is the skill under-specified (vague where it should be exact)?
