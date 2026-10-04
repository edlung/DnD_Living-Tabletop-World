# Opus Work Order — Stage 100: AI Gateway

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 100 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 110 — Opus effort MAX  
> **NO ASTRA SWITCH AT THIS STAGE.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 100)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Provider abstraction, capability router, ContextBuilder, structured output and traces; intent proposal only.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
AI cannot mutate canonical state; structured-output validation and fallback tests pass.

Test the selected fallback policy for provider failure and invalid structured output. Every implemented fallback preserves the original permission and knowledge scope, performs no canonical mutation, and does not make invalid output committable.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Hard Stop
STOP after this stage; wait for explicit authorization for the next stage.

---

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 110 in this work order.

**Required final message from Opus:**  
`STAGE 100 COMPLETE — next: OPUS_STAGE_110.md — switch/set Opus effort to MAX`
