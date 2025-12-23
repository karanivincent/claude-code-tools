# Skill Creator

Guide for creating effective Claude Code skills that extend capabilities with specialized knowledge, workflows, and tool integrations.

## When to Use

- Creating a new skill from scratch
- Updating or improving an existing skill
- Learning skill best practices and patterns
- Troubleshooting skill issues

## Key Concepts

### Skill Structure

```
skill-name/
├── SKILL.md           # Required - metadata and instructions
├── scripts/           # Optional - executable code
├── references/        # Optional - documentation for Claude
└── assets/            # Optional - templates, images, etc.
```

### Core Principles

- **Concise is key** - Only include what Claude doesn't already know
- **Progressive disclosure** - Load detailed content only when needed
- **Appropriate freedom** - Match specificity to task fragility

## Creation Process

1. Understand the skill with concrete examples
2. Plan reusable contents (scripts, references, assets)
3. Initialize with `scripts/init_skill.py`
4. Edit SKILL.md and implement resources
5. Package with `scripts/package_skill.py`
6. Iterate based on real usage

## Best Practices

- Keep SKILL.md under 500 lines
- Put trigger conditions in the description, not the body
- Use references for detailed documentation
- Test scripts before packaging
