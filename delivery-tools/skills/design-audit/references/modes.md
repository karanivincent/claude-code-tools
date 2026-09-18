# Audit modes

What each mode captures and checks. The profile's `audit` block holds the widths, the phone width,
the themes, the primary locale and the roles; `paths.messages` names the locales.

| Mode | Where | Worlds and data | Widths | Roles | Locales | Themes | Mechanical checks | Auditors |
|---|---|---|---|---|---|---|---|---|
| `baseline` | the base branch's deploy | fixture worlds, and the founder's organisation read-only | 1440, 390 | admin, member | primary | light | capability capture only (M2 reads it later) | none |
| `branch` | a unit's dev server, owned by the capture through Playwright's `webServer` | the unit's worlds | 1440 | the unit's roles | primary | light | M3, M4, M7, M9, M10 | none |
| `wave` | the draft PR's preview for the pushed head (a local production build where the repo has no previews) | all worlds | 1440, 390 | admin, member | primary | light | every M-check | yes: primary locale, 1440, admin |
| `full` | the PR's preview | all worlds, and the founder's organisation read-only | 1440, 390 | admin, member | every locale | light, dark | every M-check; other locales and dark get M3, M6 (overflow), M7, M8, M10, M16 | yes: primary locale, 1440, admin; the phone width too where the intent says `phone-required`; one real-org auditor |
| `staging` | the staging deploy after the merge | all worlds, and the founder's organisation read-only | 1440, 390 | admin, member | primary | light | M3, M7, M10, M12 | none |

## Commands per mode

- `baseline`: `delivery capture --mode baseline`. `delivery baseline` has already extracted the
  capabilities; the capture adds the controls each reachable state shows, and doubles as the
  "before" pictures for the PR.
- `branch`: `delivery gate <unit>` captures and checks in one foreground command.
- `wave`: `delivery capture --mode wave`, then `delivery check all`, then the auditors.
- `full`: `delivery capture --mode full` and `delivery capture --mode real-org`, then
  `delivery check all`, then the auditors (one per screen group, and one for `real-org`).
- `staging`: `delivery capture --mode staging` and
  `delivery capture --mode real-org --base-url <the staging URL>`, then `delivery check all`.

Every capture runs the repo's committed capture spec through the profile's heavy wrapper, in the
foreground, and owns its own server. Never start a server for it, never run the spec by hand, and
never capture any other way.

## Exit codes you will see

| Command | 0 | 1 | 2 | 4 |
|---|---|---|---|---|
| `capture` | every state reached | a state is `not-reached` (a P1, M3) | usage or configuration | the preview is not ready yet: wait and retry |
| `check` | no open finding from these checks | findings recorded | usage or configuration | |
| `audit compile` | written | | usage or configuration | |

Exit 5 from any of them means a tampered or inconsistent artefact. It leads the report; never
repair the file by hand.

## The founder's organisation

The real organisation is captured through an observer user that the founder's safety file names,
signed in through the repo's e2e sign-in path. Read-only is enforced by the capture, not by
instruction: in `real-org` captures every non-GET request to the app's API and to the database's
REST endpoint is aborted (the sign-in exchange excepted), and no control whose effect is anything
but `none` is clicked. This is where bugs that only messy real data shows become visible. The
plan's invariants are checked there mechanically (M12), and the real-org auditor looks for the
rest.

If the safety file names no observer, the organisation is not captured, and the report leads with
that. Nobody signs in to it any other way.

## The messy world

The plan's `messy` world seeds the same shapes on purpose (several open drafts, rows with missing
parents, zero counts, a single item), so the invariants are also checked on data the run controls.

## M5 and M6

Style parity (M5) and layout relations (M6) are new checks. Until a replay proves them, their
output reaches the auditors as hints, not as findings. An auditor still reports a style or layout
difference it sees on its own, at the severity its category gives.
