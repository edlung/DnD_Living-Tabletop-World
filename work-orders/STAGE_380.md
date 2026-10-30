# Work Order — Stage 380: Workshop access and unlimited monetary AI

## Authority

The owner accepted Stage 370 and confirmed implementation of all stages on
2026-10-30: `reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`.
Contract: `docs/STAGE_370_DESIGN.md`, ADR 0038; detailed implementation choices:
`docs/STAGE_380_DESIGN.md`. The original Stage 370 artifacts remain frozen.
Current implementation scope is Stage 380 only. Preserve checkpoint stops.

## Read first

`AGENTS.md`, `AGENT_WORKFLOW.md`, `ARCHITECTURE_INVARIANTS.md`, current workflow,
the approved Stage 370 contract, server/auth/accounting/images/migrations AGENTS,
and only the relevant composition/contracts/tests. Follow the UI layout skill
if adding or changing browser UI.

## Deliverables

1. Separate operator-invited workshop owner identity and HttpOnly cookie, single-use
   redemption, expiry, revocation and server authorization; no campaign membership
   grants workshop authority and no workshop credential acts inside a campaign.
2. Persist private draft containers (title/language/owner), enough to establish
   owner isolation without a campaign. Package contents/compiler remain Stage 390.
3. Explicit PostgreSQL-backed unlimited monetary policy for authorized text/image
   AI. Preserve finite history, usage/unknown costs, reservations and settlement;
   retain nonmonetary identity, safety, stop, timeout, cancellation and retry checks.
4. Operator commands to issue/revoke workshop access and set the recorded unlimited
   policy. Do not mutate real credentials/operator records as an implementation test.
5. Wire production composition and meaningful HTTP/PostgreSQL/operator tests.
   Campaign and workshop cookies remain independent. Session probe and mutations
   keep existing origin and fixed-error protections.
6. Update local instructions/entry points and the current status. Run focused
   regressions, full offline `pnpm validate`, and an adversarial pass. Record exact
   artifact identity, checks, limitations and a formal handoff.

## Boundaries

No paid provider calls, new production dependencies, deployments, publishing,
model changes or release. No campaign package/compiler, preparation generation,
scenario/visual previews, revisions or activation from later stages. Optional
browser entry must remain confined to workshop access/draft containers.

## Stop

After the Stage 380 checkpoint and handoff, STOP for owner disposition under
`AGENT_WORKFLOW.md`. The owner has authorized the overall program; do not mistake
that for a missing checkpoint's disposition.
