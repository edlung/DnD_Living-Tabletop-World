# Opus Work Order — Stage 200: UX Vertical Slice

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 200 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 210 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 200)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Replace the debug shell with the initial real Player/DM experience backed by the existing Context, Knowledge, Combat, Reaction, Visual State, and World Event contracts.

## Required Deliverables
- Require Gate 05 PASS (including any needed retest) and explicit authorization for this stage.
- Build the shared scene shell, perspective/session handling, selection, and contextual detail flow using real authorized projections.
- Provide loading, empty, and failure states that do not invent canonical data or reveal a previous perspective's data.
- Keep authorized full character/canonical detail reachable through progressive disclosure; gameplay must not require an AI chat surface.
- Establish the UI/API integration and E2E harness for later UX stages. Do not implement Stage 210–230 scenes/workflows early or replace domain validation with UI logic.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
Build, lint, typecheck, relevant tests, context-budget validation, and UI/API smoke checks pass. Verify authorized data access, Player/DM perspective isolation, loading/failure recovery, and reachability of full authorized character data.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 210 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 200 COMPLETE — next: OPUS_STAGE_210.md — switch/set Opus effort to HIGH`
