# Opus Work Order — Stage 120: Continuity Engine

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 120 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 130 — Opus effort MAX  
> **NO ASTRA SWITCH AT THIS STAGE.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 120)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Expand the existing Stage 110 validators across time, geography, identity, knowledge, relationships, lore and relevant constraints. Add conflict explanations and options without removing the commit guards.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Conflicts are surfaced, not silently rewritten. Stage 110 authoring regressions still pass; warnings never bypass protected invariants or permit partial mutation.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Hard Stop
STOP after this stage; wait for explicit authorization for the next stage.

---

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 130 in this work order.

**Required final message from Opus:**  
`STAGE 120 COMPLETE — next: OPUS_STAGE_130.md — switch/set Opus effort to MAX`
