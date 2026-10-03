# Opus Work Order — Stage 230: DM World Authoring UX

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 230 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 240 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 230)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Implement natural-language intent -> structured preview -> edit/accept/cancel -> native world entity through the validated authoring pipeline.

## Required Deliverables
- Complete the Tomas Reed flow with scoped knowledge and continuity/risk explanations from existing contracts.
- Editing a proposal must invalidate/recompute the relevant preview and confirmation. Rejected or stale submissions must not appear as committed world entities.
- Player View verifies secrecy without exposing DM previews or private knowledge through client caches.
- Expose the existing safe undo behavior and explicit rejection of unsafe dependent-history changes.
- Do not bypass schema, permission, rules, continuity, confirmation, or World Engine authority to make the UX succeed.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
E2E covers Tomas preview/edit/confirm/cancel, valid native entity visibility, invalid/stale rejection, scoped knowledge in Player View, and safe/unsafe undo. Authoring atomicity and continuity regressions pass.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 240 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 230 COMPLETE — next: OPUS_STAGE_240.md — switch/set Opus effort to HIGH`
