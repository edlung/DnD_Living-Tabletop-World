# Opus Work Order — Stage 210: World as Interface

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 210 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 220 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 210)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Implement Ravenford Market Square and object-first contextual exploration with minimal HUD.

## Required Deliverables
- Build world-object selection and the path from Mira to the Missing Caravan and investigation objects using existing domain contracts.
- Reveal the caravan action only when the concept is known/relevant. Preserve typed evidence, testimony, hypotheses, and contradiction display.
- Support the Orin symbol interaction and permitted memory recall through world context.
- Keep context, detail, and full authorized data reachable without forcing quest activation or requiring an NPC menu.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
The object-first arrival/investigation journey passes E2E. Verify knowledge-dependent action visibility, no hypothesis-to-fact promotion, no hidden-data leakage in labels/reasons, and authorized detail access.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 220 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 210 COMPLETE — next: OPUS_STAGE_220.md — switch/set Opus effort to HIGH`
