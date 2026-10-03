# Opus Work Order — Stage 40: Character & Rules Kernel

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 40 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 50 — Opus effort HIGH  
> **NO ASTRA SWITCH AT THIS STAGE.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 40)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Slice-required character state and deterministic rules only. Obtain the ruleset/Elowen fixture ADR approval in `docs/IMPLEMENTATION_PREREQUISITES.md` before implementing legality; do not silently choose an edition or house rules.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Range, slots, reactions, movement, concentration and skill-resolution tests pass.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Hard Stop
STOP after this stage; wait for explicit authorization for the next stage.

---

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 50 in this work order.

**Required final message from Opus:**  
`STAGE 40 COMPLETE — next: OPUS_STAGE_050.md — switch/set Opus effort to HIGH`
