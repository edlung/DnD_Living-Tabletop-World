# Opus Work Order — Stage 20: Knowledge Boundary

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 20 ONLY  
> **NEXT ACTION AFTER PASS:** SWITCH TO GPT-6 ASTRA — EFFORT MAX — GATE #1  
> **EXPECTED ASTRA OUTPUT:** `reviews/ASTRA_GATE_01_REPORT.md`  
> **DO NOT START STAGE 30.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 20)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Typed claims/evidence, knowledge scopes, perspective-aware projections, secret fixtures.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
All deterministic scope/projection tests pass through an executable API or test harness, including NPC scope fixtures, malformed/forged scopes, related entities, serialization, errors, and existing caches/fallbacks. Verify both authorized access and secret exclusion. Track future memory/dialogue surfaces under `docs/GATE_COVERAGE.md`; do not implement later stages to satisfy Gate 01.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Formal Checkpoint
After validation succeeds:
1. create `handoffs/ASTRA_GATE_01_REQUEST.md` from `HANDOFF_TEMPLATE.md`;
2. request GPT-6 Astra at **MAX** effort;
3. require output `reviews/ASTRA_GATE_01_REPORT.md` using `ASTRA_REVIEW.md`;
4. mark status `AWAITING_ASTRA_REVIEW`;
5. **STOP.** Do not begin the next stage.

---

# 🛑 HARD STOP — MODEL SWITCH REQUIRED

Stage 20 is complete only after its deterministic validation passes.

**Do not continue development.**

1. Create `handoffs/ASTRA_GATE_01_REQUEST.md`.
2. Switch model to **GPT-6 Astra**.
3. Set Astra effort to **MAX**.
4. Give Astra `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md`, the handoff file, and the authoritative docs named by the handoff.
5. Astra must write: `reviews/ASTRA_GATE_01_REPORT.md`.
6. If Astra reports **FAIL**, return to Opus for remediation under `EFFORT_MATRIX.md`; Critical/High findings require **MAX**.
7. If Astra reports **PASS**, only then authorize Stage 30.

**Required final message from Opus:**  
`CHECKPOINT REACHED — SWITCH TO GPT-6 ASTRA / MAX — use handoffs/ASTRA_GATE_01_REQUEST.md — wait for reviews/ASTRA_GATE_01_REPORT.md`
