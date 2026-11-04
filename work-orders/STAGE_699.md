# Work Order — Stage 699: Release 1.0

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone D, Stage 699); ADR 0062 (written first). Branch
`claude/full-game-d`. The family playtest (the owner's acceptance), the deploy and the v1.0 tag are
the owner's: nothing here does them.

## Sub-stages (one commit each, the suite green at each)

- 699a — A person's data (ADR 0062): the privacy notice in both languages, linked where people sign
  in and from the account; "Download my data" (`GET /account/data`); "Delete my account" (`POST
/account/delete`, the password and the login again), a DM's account refused there and deleted by
  the operator (`auth:operator delete-account`).
- 699b — The release journeys: both modes (at the table with the TV, online) from sign-in to play,
  the DM, a display and three players, on Chromium and WebKit.
- 699c — The release checks and the record: the layout audit of every screen (1440, 768, 390, 320;
  light and dark; RU and EN), a security review of Milestone D's changes, the Milestone D report
  (`reports/MILESTONE_D_COMPLETION.md`) with what the owner does next.

## Status (2026-11-04)

- 699a done: the privacy notice (`/privacy`), "Download my data" (`GET /account/data`), "Delete my
  account" (`POST /account/delete`; the account forgotten in one transaction:
  `AccountStore.forget`), the operator's `delete-account`, RUNBOOK §6. Unit, integration and browser
  tests; the layout audit of the notice, the data section and the dialog (48 views, none found).

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite; the
layout audit of what changed.
