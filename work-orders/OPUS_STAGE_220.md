# Opus Work Order — Stage 220: Combat UX

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 220 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 230 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 220)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Present the existing combat and reaction domain through a persistent battlefield with spatial targeting and contextual controls.

## Required Deliverables
- Use a minimal anchor layer and ephemeral contextual UI; do not require a permanent action bar.
- Display movement, range, cover, targets, and AoE from existing contracts. Fireball previews affected entities and warns about allies while preserving legal suboptimal choices.
- Present Counterspell CAST/IGNORE and expiry from the domain ReactionWindow lifecycle.
- Handle stale actions, duplicate submissions, and resolved/expired windows through backend results. Clients do not decide legality or consume resources locally as authority.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
Combat E2E covers attack/movement, AoE and ally warning, valid Counterspell, IGNORE/expiry, and rejection of stale or duplicate reactions without duplicate resource use. Existing deterministic rules and reaction suites pass unchanged.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 230 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 220 COMPLETE — next: OPUS_STAGE_230.md — switch/set Opus effort to HIGH`
