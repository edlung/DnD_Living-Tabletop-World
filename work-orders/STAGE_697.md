# Work Order — Stage 697: Local mode

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone D, Stage 697, decision 1); ADR 0061 (written first). Branch
`claude/full-game-d`. Opening the server to the home network, trusting its root on a device, a
firewall rule and moving a campaign off the VPS are the owner's acts: nothing here does them.

## Sub-stages (one commit each, the suite green at each)

- 697a — A campaign moves: migration 0039 (the moves, the away triggers), the package (export and
  import, all or nothing, checked), the 409 `MOVED` guard and the screens' notice, the operator
  command (`apps/server/src/campaigns/move/`, `deploy/scripts/campaign-move.sh`).
- 697b — The laptop: `deploy/local/ltw-local.sh` (start, stop, status, address with its QR code,
  backup, bring, return, the DM's first link, trust on this Mac), its Compose override, the proxy's
  local mode with the trust page, the firewall's check.
- 697c — The record: RUNBOOK §15, the context map, the plan's status; the move proved between two
  local stacks and back, the trust page and the IP certificate on the loopback address.

## Status (2026-11-04)

- 697a done: `server/src/campaigns/move/` (25 tables carried, 10 left behind with their reasons and a
  coverage test against the schema; the package with its SHA-256; export, a move's mark and its
  settling; import all or nothing: staging, the history's beginning, the merge by kind, accounts by
  ID with a numbered login when taken, every event read before the commit), migration 0039 (the
  moves; history, seats and invitations refused while away), 409 `MOVED` by path and from the
  triggers, the away notice under the place's card and in the account's campaigns,
  `deploy/scripts/campaign-move.sh`. Proved between two databases both ways
  (`move.integration.test.ts`) and in the browser (`tests/e2e/campaign-moved.spec.ts`).

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests (the move between two databases,
both ways, refusals), build; the browser suite; for 697b–c the local stack on 127.0.0.1 (smoke, the
trust page's check, `openssl verify` of the address's chain against the root), and the layout audit
of the trust page and the moved notice (1440, 768, 390, 320; light and dark; RU and EN).
