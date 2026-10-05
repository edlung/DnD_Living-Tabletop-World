# Stage 250 — Vertical Slice Release

- Date: 2026-10-05 (Europe/Oslo).
- Status: **RELEASE CANDIDATE PREPARED — NOT RELEASED. Stage 250 is not complete.**
- Work order: `work-orders/OPUS_STAGE_250.md`.
- Model exception: the owner told this session (Claude Sonnet 5.5) to start Stage 250 instead
  of Opus 5.5/HIGH. Later model/gate requirements are unchanged.
- Release identifier / destination: **none assigned.** No tag, publication, or deployment was
  made; no remote exists in this repository.

## Why it stops here

1. **Usability acceptance is not evidenced.** The gate requires a real uncoached session
   (`reports/STAGE_240_USABILITY.md`). Only an AI stand-in pass exists, with ten findings
   awaiting owner disposition. Required checks may not be relabelled as passed.
2. **No authorized release target.** The owner has not stated the target, and production
   authentication/environment (prerequisites Q4) is undecided. The slice is a local
   development distribution until the owner says otherwise.

## Prepared candidate

- Documentation: `docs/RELEASE_CANDIDATE.md` (identification, install/start/validate,
  configuration and fixtures, scope, limitations, recovery, evidence and gate mapping);
  README corrected (it still described Stage 200 as read-only).
- Decisions: ADR 0030 (Stage 240 remediation); ADRs 0026–0029 earlier.
- No new gameplay or UX was added during packaging.

## Fresh-environment smoke (clone of `47f4da4`, scratch directory, throwaway database)

| Step                                           | Result                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git clone` → `pnpm install --frozen-lockfile` | PASS (pnpm store already warm, so install time says nothing about a cold machine)                                                                                                                                                                                                                                                                      |
| `pnpm build`                                   | PASS; bundle `index-C2LN-Xy5.js` SHA-256 `e5d19cde2735524e7e72a29c9118a9bd6ec4e1faee93c22cae032f586652441b`                                                                                                                                                                                                                                            |
| `pnpm db:migrate` (new database)               | PASS; 0001–0004 applied                                                                                                                                                                                                                                                                                                                                |
| `pnpm seed:ravenford`                          | PASS; 91 accepted, 25 entities, Day 1 10:00                                                                                                                                                                                                                                                                                                            |
| Start server (`@ltw/server start`)             | PASS; `/healthz` ok; entities query with `dev-player-elowen` returned the player's view; unauthenticated request returned 401                                                                                                                                                                                                                          |
| `pnpm validate` in the clone                   | format, lint, typecheck, context-budget (569 files, none over limits), unit 162 files / 1,555 tests, build, migrate, seed (idempotent), integration 20 files / 77 tests: PASS. E2E: first run failed to start because port 4310 was held by my own leftover dev server from the AI pass; after freeing it, `pnpm test:e2e` PASSED 40 Chromium journeys |

The throwaway database was dropped afterwards. The web bundle was not served from a production
host; only the local dev proxy and the server were exercised.

## Gate map

See the table in `docs/RELEASE_CANDIDATE.md`. Gates 01–05 passed at their reviewed
revisions; the backend diff from the Gate 05 reviewed revision `a85b6f8` to the candidate is
additive (three read routes and contracts, Stage 200 introduction evidence), so no gate
coverage is invalidated and none is reopened. The client has no independent review (the Astra
gates are backend-scoped, as Gate 05 states).

## Required from the owner before this stage can complete

1. Disposition of the ten Stage 240 findings (fix / defer / accept).
2. A real uncoached human session, or an explicit owner statement of how usability
   acceptance is to be satisfied. This report does not treat the AI pass as acceptance.
3. The authorized release target and identifier, and the environment decision (Q4).
4. Then: re-run the complete validation on the final revision and record the release here.

Nothing in this report claims the release happened.
