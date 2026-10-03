# Opus Work Order — Stage 90: Reaction Engine

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 90 ONLY  
> **NEXT ACTION AFTER PASS:** SWITCH TO GPT-6 ASTRA — EFFORT MAX — GATE #3  
> **EXPECTED ASTRA OUTPUT:** `reviews/ASTRA_GATE_03_REPORT.md`  
> **DO NOT START STAGE 100.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 90)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
First-class ReactionWindow lifecycle; Counterspell acceptance case.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Eligibility, expiry, resolution, double-spend, concurrent responses, ordering/replay, and declared undo/rewind behavior with an open window pass. Implement the relevant temporal/undo contract, including explicit rejection when unsafe.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Formal Checkpoint
After validation succeeds:
1. create `handoffs/ASTRA_GATE_03_REQUEST.md` from `HANDOFF_TEMPLATE.md`;
2. request GPT-6 Astra at **MAX** effort;
3. require output `reviews/ASTRA_GATE_03_REPORT.md` using `ASTRA_REVIEW.md`;
4. mark status `AWAITING_ASTRA_REVIEW`;
5. **STOP.** Do not begin the next stage.

---

# 🛑 HARD STOP — MODEL SWITCH REQUIRED

Stage 90 is complete only after its deterministic validation passes.

**Do not continue development.**

1. Create `handoffs/ASTRA_GATE_03_REQUEST.md`.
2. Switch model to **GPT-6 Astra**.
3. Set Astra effort to **MAX**.
4. Give Astra `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md`, the handoff file, and the authoritative docs named by the handoff.
5. Astra must write: `reviews/ASTRA_GATE_03_REPORT.md`.
6. If Astra reports **FAIL**, return to Opus for remediation under `EFFORT_MATRIX.md`; Critical/High findings require **MAX**.
7. If Astra reports **PASS**, only then authorize Stage 100.

**Required final message from Opus:**  
`CHECKPOINT REACHED — SWITCH TO GPT-6 ASTRA / MAX — use handoffs/ASTRA_GATE_03_REQUEST.md — wait for reviews/ASTRA_GATE_03_REPORT.md`
