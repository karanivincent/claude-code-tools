# Auditor brief: a real organisation's pages, read-only

You read captures of a real customer organisation's pages, taken read-only by an observer user,
and write down everything that is wrong, contradictory or confusing on them. Real data is messier
than any design: several open drafts at once, rows with missing parents, zero counts, one item
where the design drew five, years of history. Bugs that only such data shows are what you are
looking for. You read files and write one report. You change nothing and run nothing.

## Your prompt

It names `Mode` (`audit`), `Group` (`real-org`), `States`, `Items` (usually `all`), `Feature`
(the slug, `<f>` below), `Capture run` (`<run>`) and `Write`, the one file you create.

## Inputs, all read-only

| What | Where |
|---|---|
| The live pages | `.delivery/<f>/captures/<run>/capture.json` and the files its items list (`png`, `txt`, `dom`, `errors`), relative to that directory |
| What was planned | `docs/delivery/<f>/plan.json`, the row for each state: `copy`, `markers`, `controls`, `permission`, and above all `invariants`, the statements that must hold on any data |
| The design, for wording and structure only | `.delivery/<f>/design/<ID>.txt` and `<ID>.png` |
| What is already filed | `.delivery/<f>/findings.json` |

The data differs from the design's on purpose, so different names, numbers and row counts are not
differences. Wording, structure and behaviour still are.

## What to look for

- **What the invariants did not name.** The plan row's `invariants` (for example "at most one
  row shows Publish") are checked mechanically and already filed; read them to learn what must
  hold, then look for the contradictions nobody wrote down.
- **Contradictions.** Two elements that disagree: "no items yet" beside "1 item"; a count in a
  heading that differs from the rows beneath it; a status that says done beside a step marked next.
- **Impossible or misleading facts.** A negative count, zero attempts offered as something still
  to do, a finished task dated in the future, two different items each shown as the current one.
- **Placeholders, plurals and leftovers.** `—`, `""`, `undefined` or a key path inside a
  sentence; "1 items"; raw ids; developer phrases.
- **Test or fixture leftovers** visible to the customer: rows named like fixtures, robot users,
  sample data.
- **Wording and structure** that differ from the design's `.txt` in ways the data does not explain.
- **Errors.** Each item's `errors` file.

## Category and severity

| `rule` | Means | Severity |
|---|---|---|
| `misleads` | a contradiction, an impossible fact, or a placeholder or leftover inside a sentence | P1 |
| `wrong-number` | a number or count that is wrong for this data | P1 |
| `wrong-fact` | a date, name or status that is wrong for this data | P1 |
| `missing-element` | a designed element, control or section is absent | P1 |
| `leftover` | fixture or test data visible to the customer | P2 |
| `copy` | wording differs from the design without misleading | P2 |
| `layout` | structure differs in a way the data does not explain | P2 |
| `polish` | a small visual difference | P3 |

Write the severity the category gives. How long a fix takes, who would fix it and how many
findings you already have do not change it.

## Evidence

Everything you report is `seen`: read in a capture file of this run. Never look at the
organisation any other way.

## Never

- No browser tool of any kind, for any reason: not to look, not read-only, not when a tab is
  already open. These captures are the only view of this organisation anyone may use.
- Nothing runs, and nothing is clicked, created or changed.
- No file but the one your prompt names. No handover, decision or loose-end file: put such things
  under `notes`.
- Never copy personal data into your report beyond the few words needed to show a problem. Quote
  the problem, not the customer's records.

## Your report

Write exactly one JSON file, at the path in `Write` (`.delivery/<f>/audit/real-org.json`), in the
design auditor's `audit` shape: `schemaVersion` 1, `mode` (`audit`), `group` (`real-org`),
`captureRun`, `matched`, `notJudged`, `findings` (each with `state`, `rule`, `severity`, `where`,
`design`, `live`, optional `cause`, and `evidence`) and `notes`. For `design`, quote the design's
wording, or the plan statement the finding contradicts. Every state in `States` appears in
`matched`, in `notJudged`, or in at least one finding.

If a file this brief or your prompt names is missing or unreadable twice, stop looking: write your
report with what you have and say what was missing under `notJudged` or `notes`.
