# Opus Work Order — Stage 110: AI Authoring

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 110 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 120 — Opus effort MAX  
> **NO ASTRA SWITCH AT THIS STAGE.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 110)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Proposal -> schema/permission/applicable rules -> continuity/lore -> risk -> preview/confirmation -> World Engine; Tomas acceptance case. Implement the minimum authoring validators in `docs/IMPLEMENTATION_PREREQUISITES.md` before the first commit, plus the safe Tomas undo path with dependent-knowledge handling. Required checks cannot wait for Stage 120.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Unknown/destructive/invalid proposals fail closed; no partial mutation. Test timeline/location/identity/knowledge checks, unauthorized actors, required confirmation, stale previews revalidated at commit, and safe/unsafe undo. The valid Tomas path must succeed through the same pipeline.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Hard Stop
STOP after this stage; wait for explicit authorization for the next stage.

---

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 120 in this work order.

**Required final message from Opus:**  
`STAGE 110 COMPLETE — next: OPUS_STAGE_120.md — switch/set Opus effort to MAX`
