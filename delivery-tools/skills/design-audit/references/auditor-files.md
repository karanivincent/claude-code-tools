# Auditor files

Auditors write into `.delivery/<feature>/audit/`, one file per pass. `delivery audit compile`
reads every file there and is the only thing that turns them into `findings.json` entries. Nobody
edits one of these files after its auditor wrote it.

```
.delivery/<feature>/audit/
  <group>.json          the audit of one screen group; written again by a full re-audit
  <group>.refute.json   the refutation of that group's open P1s
  <group>.spot.json     the spot check of a sample of the states the audit found matching
  real-org.json         the founder's organisation
```

`<group>` is a slug (`billing`, `settings`); every finding from `<group>.json` is recorded with
the source `auditor:<group>`.

## `<group>.json` and `real-org.json`

```json
{
  "schemaVersion": 1,
  "mode": "audit",
  "group": "billing",
  "captureRun": "full-20260101-2310",
  "matched": ["BL-01", "BL-02", "BL-05"],
  "notJudged": [{ "state": "BL-09", "why": "not-reached in the manifest: required marker missing" }],
  "findings": [
    {
      "state": "BL-04",
      "rule": "wrong-number",
      "severity": "P1",
      "where": "BL-04.design.admin.1440.en.light.txt:12",
      "design": "BL-04.txt:9 \"Total 90.00\" (after the discount)",
      "live": "\"Total 100.00\"",
      "cause": "src/billing/invoice-total.tsx:41 renders subtotal",
      "evidence": "seen"
    }
  ],
  "notes": []
}
```

- `matched` lists the states judged with no difference; `notJudged` the ones that could not be
  judged, with the reason. Every state in the prompt appears in `matched`, in `notJudged`, or in
  at least one finding. The spot-check sample is drawn from `matched`.
- `rule` is the auditor's category. `missing-element`, `dead-control`, `wrong-fact`,
  `wrong-number` and `misleads` are P1 whatever `severity` says; `audit compile` and `ready` both
  apply that floor.
- There is no `dayOne` field: the CLI raises a finding on a day-one state one level itself, and
  a finding that already says `dayOne: true` is taken as raised.
- `where` starts with the live file's name as `capture.json` lists it, then `:<line>` for a text
  file or `: <element>` for a picture or a dom file. The finding's id is computed from the source,
  rule, state and where, so a decision about it survives a re-run.
- `evidence` is `seen` (a capture file of this run) or `code-read`.
- `notes` holds what the auditor would otherwise have put in a handover, a decision file or a
  loose-end file. The main session decides what to do with each.

A group whose file changes after it was recorded is a re-audit: `audit compile` journals it and
adds one to the re-audit count of every finding of that group.

## `<group>.refute.json`

The refuting auditor reads `findings.json`, takes every open P1 whose source is
`auditor:<group>`, and lists only the ones it refutes:

```json
{
  "refutations": [
    { "id": "F-0123456789ab", "verdict": "duplicate", "why": "the same missing column as F-ba9876543210" },
    { "id": "F-1111aaaa2222", "verdict": "explained-by", "row": "BL-07", "why": "an adapt row: the product's word replaces the design's" }
  ]
}
```

`duplicate` marks the finding a duplicate. `explained-by` must name a `cut` row (the finding
becomes cut) or an `adapt` row that carries an issue (the finding becomes an accepted `adapt`
difference). A P1 that stands is simply not listed. No verdict changes a severity.

## `<group>.spot.json`

```json
{ "judged": 2, "disagreed": 1, "differences": [{ "state": "BL-12", "what": "the Export button is missing" }] }
```

`judged` is the number of sampled states the spot auditor judged; `disagreed` the number where it
found a difference the first pass did not. The report prints the rate.

## Accepting a P2

A P2 is accepted only when all of these hold:

- its reason class is one of `adapt` (the plan row is an `adapt` row naming one of the rules
  `banned-word`, `product-behaviour`, `data-not-in-product` or `older-than-product`),
  `data-not-in-product` (a backend piece is needed and its issue exists), `platform-limit` (the
  platform cannot do it today, and the line names what) or `shared-component-follow-up` (the fix
  touches a component outside the run's claimed paths, and the issue is filed);
- the issue number exists;
- accepting it keeps the screen group at or under `limits.maxAcceptedP2PerGroup` and the run at or
  under `limits.maxAcceptedP2`.

An auditor's P1 that an `adapt` row explains is settled by the refutation pass (`explained-by` that
row). Every accepted P2, `adapt` included, is recorded in `docs/delivery/<feature>/accepted.json`,
committed with the run:

```json
{
  "schemaVersion": 1,
  "accepted": [
    { "finding": "F-0123456789ab", "reasonClass": "platform-limit", "issue": 431, "text": "The date picker cannot show week numbers today (#431)." }
  ]
}
```

`delivery audit compile` applies it, `delivery ready` refuses an unknown reason class, a missing
issue and anything past the caps, and `delivery pr-body` lists every acceptance under Accepted
differences. Removing a line withdraws the acceptance and reopens the finding. If
`audit compile` does not report an acceptance as applied, it has not been: the finding stays open
and `ready` stays red.
