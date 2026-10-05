# Stage 250 — Vertical Slice Release

- Date: 2026-10-05 (Europe/Oslo).
- Status: **RELEASE CANDIDATE PREPARED — NOT RELEASED. Release deferred by the owner. Stage 250 is not complete.**
- Work order: `work-orders/OPUS_STAGE_250.md`.
- Model exception: the owner told this session (Claude Sonnet 5.5) to start Stage 250 instead
  of Opus 5.5/HIGH. Later model/gate requirements are unchanged.
- Release identifier / destination: **none assigned.** No tag, publication, or deployment was
  made; no remote exists in this repository.

## Why it stops here

Owner decision (2026-10-05): the release goes to a VPS, **later**. The visual part is not
finished. The usability evidence is an AI stand-in pass that the owner accepted (not a human
session). A VPS release also needs production authentication, which does not exist yet
(`docs/RELEASE_CANDIDATE.md`, "Before a VPS release"). No tag, publication, or deployment was
made; the repository has no remote.

## Prepared candidate

- Documentation: `docs/RELEASE_CANDIDATE.md` (identification, install/start/validate,
  configuration and fixtures, scope, limitations, recovery, evidence and gate mapping);
  README corrected (it still described Stage 200 as read-only).
- Decisions: ADR 0030 (Stage 240 remediation); ADRs 0026–0029 earlier.
- No new gameplay or UX was added during packaging.

## Fresh-environment smoke (clone of `83b1344`, scratch directory, throwaway database)

| Step                                              | Result                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git clone` → `pnpm install --frozen-lockfile`    | PASS (pnpm store already warm, so install time says nothing about a cold machine)                                                                                                               |
| `pnpm validate` in the clone (throwaway database) | exit 0: format, lint, typecheck, context-budget, unit 162 files / 1,556 tests, build, migrate, seed (idempotent), integration 20 files / 77 tests, E2E 41 Chromium journeys                     |
| Bundle                                            | `index-L2jN_3Bl.js` SHA-256 `d39e0aae9cc7e9c0d2daf5ee319ea1349378b8c5c51589646e43770cd0bfc32e`; `index-Q_19hvXj.css` SHA-256 `e9b2015aefd3492f73f9fe6e48fcb0899ff2222ec81f77631fd4cde1ff633c41` |
| Earlier smoke on `47f4da4`                        | build, fresh migrate (0001–0004), seed (91), server start, `/healthz`, authorized query, 401 without a token: PASS                                                                              |

The throwaway database was dropped afterwards. The web bundle was not served from a production
host; only the local dev proxy and the server were exercised.

## Gate map

See the table in `docs/RELEASE_CANDIDATE.md`. Gates 01–05 passed at their reviewed
revisions; the backend diff from the Gate 05 reviewed revision `a85b6f8` to the candidate is
additive (three read routes and contracts, Stage 200 introduction evidence), so no gate
coverage is invalidated and none is reopened. The client has no independent review (the Astra
gates are backend-scoped, as Gate 05 states).

## Required before this stage can complete

1. Production authentication and the VPS environment (prerequisites Q4), plus the release
   identifier and destination.
2. The visual design finished and reviewed (the owner's note); the evidence here does not cover it.
3. Re-run the complete validation on the final revision and record the release here.

Nothing in this report claims the release happened.
