# Opus Work Order — Stage 240: Product Validation

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 240 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 250 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 240)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Validate the complete 30–45 minute Ravenford experience through a real uncoached usability session.

## Required Deliverables
- Use the integrated Stage 230 build and record its exact revision, scenario, participant roles, and test conditions.
- Observe Player and DM acceptance from `RAVENFORD_SPEC.md`: discovery through the world, investigation/contradiction/Orin, combat/Counterspell, time change, Chronicle/flashback, and Tomas authoring/secrecy/undo.
- Record whether users interact with world objects or hunt through UI, where they need assistance, task outcomes, and observed failures. Separate observations from interpretation.
- Write `reports/STAGE_240_USABILITY.md` with evidence, limitations, blockers, and owner disposition. Do not invent participants, observations, or acceptance.
- If the session cannot run or acceptance fails, record incomplete/failed validation and stop for the owner to authorize bounded remediation and another session. Do not redesign the product or silently proceed to release.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
A real session has been completed and evaluated against Player/DM acceptance, with reproducible defects and explicit owner disposition of findings. Required product/UX acceptance is evidenced; missing sessions or unresolved blocking failures prevent completion. Relevant full-journey E2E and integrity regressions also pass.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 250 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 240 COMPLETE — next: OPUS_STAGE_250.md — switch/set Opus effort to HIGH`
