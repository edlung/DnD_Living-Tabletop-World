# Opus Work Order — Stage 340: Production Authentication

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 340 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 350 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 340)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- ADR 0009 (HTTP API and development authentication), ADR 0026 §1–2 and §6
- `apps/server/src/http/auth.ts`, `apps/server/src/http/request-context.ts`, `apps/web/src/session/`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Let real people sign in to a deployed campaign safely.

## Required Deliverables
- Owner decision first (Q4): the sign-in method. Suggested for a closed alpha: invitation links issued by the DM, with no passwords and no e-mail infrastructure. Record the decision and a threat model in an ADR that closes the production gap ADR 0009 left open.
- Implement the method behind the existing `Authenticator` port: credentials stored hashed, expiry and revocation, session lifetime, a credential bound to one actor. The fixed check order (authenticate, validate, membership, perspective) does not change.
- The DM manages who may join: invite, see, revoke. Membership still changes only through World Engine commands.
- Rate limits and lockout for sign-in and for expensive routes (AI, images); limits on request size and concurrency.
- Browser: decide in the ADR how the credential is held, with its CSRF and XSS consequences. No credential in a URL after sign-in, in logs, or in traces. Sign-out and revocation take effect at once, including on the change signal of Stage 310.
- Development personas remain for local development and tests and stay refused in production.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner this stage's open questions (Required Deliverables; `docs/IMPLEMENTATION_PREREQUISITES.md`) before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes. Forged, expired, revoked, replayed, and cross-campaign credentials fail closed over HTTP and over the change signal. Campaigns and members cannot be enumerated. No secret appears in logs or traces. The completion report lists every new route for the Gate 06 handoff.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_340_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 350 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 340 COMPLETE — next: OPUS_STAGE_350.md — switch/set Opus effort to HIGH`
