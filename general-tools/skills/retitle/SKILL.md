---
name: retitle
description: >
  Rename the current Claude session after the task it is actually doing now, not the prompt it
  started with. Reads the conversation, the TASKS.md goal heading, the branch and any open PR,
  then picks a short title that names the work. Use when the user says "/retitle", "rename this
  chat", "rename this session", "give this chat a better name", "the title is wrong", or "name
  this after what we're doing". Also use when the session's scope has clearly moved away from its
  title. If the user supplies a title, use theirs as given.
---

# Retitle

Session titles are set from the first prompt. The first prompt is often a starting point
("what's next on my roadmap?") and not the work the session ends up doing. This skill renames
the session after the work.

## Steps

1. If the user gave a title (`/retitle Fix login bug`), use it exactly and skip to step 4.
2. Find what the session is doing now. Check these, strongest first:
   - The most recent substantial work in the conversation: what was built, fixed, tested or
     decided. Weigh the latest stretch more than the opening request.
   - The active `## <goal>` heading in `TASKS.md`, if the project keeps one.
   - The current branch name and the title of any open PR for it.
   - The ticket or roadmap item the work came from (for example a Notion card or a Linear issue).
3. Write the title:
   - 3 to 8 words, about 60 characters at most.
   - Name the thing being worked on first, then the kind of work: "Email templates: black
     text + sandbox testing", "Calendar facility filter reset fix".
   - Use the product's or ticket's own words. Add a ticket key if one exists (`YOND-2340`).
   - When the session covered two tasks, name the one still in progress. Join two with `+` only
     when both are still live.
   - Don't use vague words like "work", "stuff", "session", "updates" or "misc". Don't use dates,
     emoji or a trailing full stop.
4. Rename the session:
   - In the Claude desktop app, call `mcp__ccd_session_mgmt__set_session_title` with
     `session_id: "self"` and the title. Load it through ToolSearch first if it is deferred.
   - Without that tool (the plain CLI), tell the user to run `/rename <title>`, because the
     built-in command can't be called from a skill.
5. Reply with one line: the new title, and the old one in brackets if the tool returned it. Ask
   nothing.

## Example

The session started as "Roadmap next steps". It then spent its time changing email templates to
black text and deploying them to the Sandbox API for testing.

> Renamed to "Email templates: black text + sandbox testing" (was "Roadmap next steps").
