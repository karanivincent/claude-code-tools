# Claude Code Skills Guide

This document provides a comprehensive reference for creating and structuring Claude Code Skills.

## What Are Skills?

Skills are packaged expertise that extend Claude's capabilities. Unlike slash commands (which are user-invoked), Skills are **model-invoked** — Claude autonomously decides when to use them based on your request and the Skill's description.

Each Skill consists of:

- A required `SKILL.md` file with instructions
- Optional supporting files (scripts, templates, references)

## File Locations

| Type     | Path                                     | Scope                               |
| -------- | ---------------------------------------- | ----------------------------------- |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | Available across all your projects  |
| Project  | `.claude/skills/<skill-name>/SKILL.md`   | Shared with team via git            |
| Plugin   | Bundled with installed plugins           | Available after plugin installation |

## SKILL.md Structure

### Required: YAML Frontmatter

Every SKILL.md must start with YAML frontmatter enclosed by `---` delimiters:

```yaml
---
name: my-skill-name
description: Clear description of what this Skill does and when to use it.
---
```

### Frontmatter Fields

| Field           | Required | Description                                                                             |
| --------------- | -------- | --------------------------------------------------------------------------------------- |
| `name`          | Yes      | Unique identifier. Use lowercase with hyphens (e.g., `code-reviewer`, `pdf-processing`) |
| `description`   | Yes      | **Critical for discovery**. Explains what the Skill does AND when Claude should use it  |
| `allowed-tools` | No       | Comma-separated list of tools the Skill can use (e.g., `Read, Grep, Glob`)              |

### Writing Effective Descriptions

The `description` field is crucial — Claude uses it to decide when to activate the Skill.

**Bad (too vague):**

```yaml
description: Helps with documents
```

**Good (specific):**

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

**Formula for good descriptions:**

1. What does it do? (capabilities)
2. When should it be used? (trigger contexts)
3. Any dependencies? (optional)

### Markdown Content

After the frontmatter, include:

1. **Title** — Heading matching the Skill name
2. **Instructions** — Clear, step-by-step guidance for Claude
3. **Examples** — Concrete usage examples
4. **Best Practices** — Guidelines and constraints (optional)
5. **Reference** — Additional context or documentation (optional)

## Complete Examples

### Simple Single-File Skill

```yaml
---
name: commit-message-generator
description: Generates clear, conventional commit messages from git diffs. Use when writing commit messages, reviewing staged changes, or preparing commits.
---

# Commit Message Generator

## Instructions

1. Run `git diff --staged` to see staged changes
2. Analyze the changes to understand their purpose
3. Generate a commit message following this format:
   - Summary line under 50 characters (imperative mood)
   - Blank line
   - Detailed description explaining what and why

## Format

```

<type>(<scope>): <subject>

<body>
```

Types: feat, fix, docs, style, refactor, test, chore

## Examples

Input: Added validation to email field
Output: `feat(auth): add email validation to signup form`

Input: Fixed null pointer in user service
Output: `fix(user): handle null user in getProfile method`

## Best Practices

- Use present tense, imperative mood ("add" not "added")
- Focus on WHY, not just WHAT
- Keep subject line under 50 characters
- Wrap body at 72 characters

````

### Skill with Tool Permissions

```yaml
---
name: code-reviewer
description: Review code for best practices, potential issues, and improvements. Use when reviewing code, checking PRs, or analyzing code quality.
allowed-tools: Read, Grep, Glob
---

# Code Reviewer

## Review Checklist

1. Code organization and structure
2. Error handling completeness
3. Performance considerations
4. Security concerns
5. Test coverage
6. Documentation quality

## Instructions

1. Use `Glob` to find all relevant files
2. Use `Read` to examine the code
3. Use `Grep` to search for patterns and anti-patterns
4. Provide structured feedback with:
   - Summary of findings
   - Specific issues with line references
   - Suggested improvements
   - Positive observations

## Severity Levels

- **Critical**: Security vulnerabilities, data loss risks
- **Major**: Bugs, performance issues, missing error handling
- **Minor**: Style issues, minor improvements
- **Suggestion**: Nice-to-haves, optional enhancements
````

### Multi-File Skill Structure

For complex Skills, use multiple files:

```
.claude/skills/pdf-processing/
├── SKILL.md           # Main Skill file (required)
├── REFERENCE.md       # Additional documentation
├── EXAMPLES.md        # Extended examples
└── scripts/
    ├── extract_text.py
    ├── fill_form.py
    └── merge_pdfs.py
```

**Main SKILL.md:**

```yaml
---
name: pdf-processing
description: Extract text, fill forms, merge PDFs. Use when working with PDF files, forms, or document extraction. Requires pypdf and pdfplumber packages.
---

# PDF Processing

## Capabilities

- Extract text from PDFs
- Fill PDF forms programmatically
- Merge multiple PDFs into one
- Extract tables from PDFs

## Instructions

1. Identify the PDF operation needed
2. Use the appropriate script from `scripts/`
3. See REFERENCE.md for API details
4. See EXAMPLES.md for usage patterns

## Dependencies

- pypdf
- pdfplumber

## Scripts

- `scripts/extract_text.py` - Extract text content
- `scripts/fill_form.py` - Fill form fields
- `scripts/merge_pdfs.py` - Combine PDFs
```

Claude uses **progressive disclosure** — it reads supporting files only when needed, optimizing context usage.

## Best Practices

### 1. Keep Skills Focused

One Skill = One well-defined capability

**Good:**

- "PDF form filling"
- "Excel data analysis"
- "Git commit messages"

**Bad (too broad):**

- "Document processing"
- "Data tools"
- "Code helper"

### 2. Write Specific Descriptions

Include:

- What the Skill does
- When to use it (trigger words/contexts)
- Any requirements or dependencies

### 3. Avoid Conflicting Skills

If you have multiple similar Skills, make descriptions distinct:

```yaml
# Skill 1
description: Analyze sales data in Excel files and CRM exports. Use for sales reports, pipeline analysis, and revenue tracking.

# Skill 2
description: Analyze log files and system metrics data. Use for performance monitoring, debugging, and system diagnostics.
```

### 4. Make Scripts Executable

```bash
chmod +x .claude/skills/my-skill/scripts/*.py
```

### 5. Document Versions

```markdown
## Version History

- v2.0.0 (2025-10-01): Breaking changes to API
- v1.1.0 (2025-09-15): Added new features
- v1.0.0 (2025-09-01): Initial release
```

## Testing Skills

Ask Claude questions that match your Skill's purpose. Claude will automatically activate the appropriate Skill.

**Example test prompts:**

- For a commit Skill: "Help me write a commit message for these changes"
- For a PDF Skill: "Can you extract text from this PDF?"
- For a code review Skill: "Review this PR for issues"

## Troubleshooting

### Skill Not Being Used

1. **Check the path**: Ensure `SKILL.md` is in the correct location

   ```bash
   ls ~/.claude/skills/*/SKILL.md      # Personal
   ls .claude/skills/*/SKILL.md        # Project
   ```

2. **Check the description**: Make it more specific with clear trigger contexts

3. **Check YAML syntax**:
   ```bash
   cat .claude/skills/my-skill/SKILL.md | head -n 15
   ```
   Common issues:
   - Missing opening or closing `---`
   - Tabs instead of spaces
   - Unquoted strings with special characters

### Skill Conflicts

If Claude picks the wrong Skill, make descriptions more distinct and specific to their use cases.

## Sharing Skills

### Via Git (Project Skills)

```bash
mkdir -p .claude/skills/team-skill
# Create SKILL.md
git add .claude/skills/
git commit -m "Add team skill for X"
git push
```

### Via Plugins

Package Skills in a plugin's `skills/` directory for distribution through the plugin marketplace.

## Quick Reference

```yaml
---
name: lowercase-with-hyphens
description: What it does. When to use it. Any requirements.
allowed-tools: Tool1, Tool2  # Optional
---

# Skill Title

## Instructions

Step-by-step guidance for Claude.

## Examples

Concrete usage examples.

## Best Practices

Guidelines and constraints.
```
