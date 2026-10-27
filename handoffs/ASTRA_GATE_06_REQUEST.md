# Gate Handoff Request

- Gate: #6 — Full-Stack Red Team (Stage 355)
- Review type: INITIAL, then RETEST 1 (both run on 2026-10-27; see the report)
- Completed stage: 350 (Deployment). Gate 06 attacks the deployed alpha build: every alpha row of
  `docs/GATE_COVERAGE.md` (Stages 200–350) is due, with the regressions of Gates 01–05.
- Revision under attack: `0cc8d8d` (main after Stage 350; images `ltw-server`/`ltw-proxy:0cc8d8db2411`).
- Remediation: branch `gate-06-fixes` (pull request 9); retest on `127afb4`; final `d41a3d7`.
- Required output path: `reviews/ASTRA_GATE_06_REPORT.md`
- Reviewer: Claude Opus 5.5 in fresh, independent contexts (owner decision 2026-10-11,
  `ASTRA_GATE_PROMPTS.md`); five attack teams and one retest.
- Status: REVIEWED — PASS after remediation and retest; one item for the owner (G06-client-02).

## Review objective

`EXECUTION_PLAN.md` Stage 355: attack the deployed build without source modification —
sign-in and sessions, perspective isolation in the client and over the change signal, prompt
injection against live models in Russian and English, the language-dependent rules changed at
Stage 290, image visibility, abuse and spending, and deployment and recovery.

## Areas and teams

| Team   | Focus                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth   | Stage 340, ADR 0036, ADR 0009 check order: invitations, cookies, CSRF, revocation, limits, operator CLI                                                                               |
| client | Stages 200–330, ADR 0026–0028, 0033, 0034: what a player's browser receives, the live fingerprint, XSS, CSP; known lead: semantic IDs of unidentified combatants                      |
| ai     | Stage 300, ADR 0031, 0032, Stage 290 rules: injection in NPC dialogue, DM intents, Chronicle and authoring; canon mutation; cost abuse — live Sonnet within stored ceilings ($8 stop) |
| images | Stage 330, ADR 0022, 0023, 0035: visibility before approval, supersede/undo, ledger races, curated import, headers                                                                    |
| infra  | Stage 350, ADR 0037, RUNBOOK: backup/restore integrity, rollback, secrets, trust boundary, Caddy headers, hardening, exhaustion, alarms                                               |

## Constraints given to every team

- Own stack (`COMPOSE_PROJECT_NAME=ltw-g06-<team>`, own ports and backend range); touch nothing
  else; take the stack down with its volumes at the end.
- No token, key or password in files or evidence; never read `.env.local`.
- Paid calls only for the ai team, through stored operator records, stop at $8.

## Evidence

`reviews/evidence/gate-06/<team>/` and `reviews/evidence/gate-06/retest/`.
