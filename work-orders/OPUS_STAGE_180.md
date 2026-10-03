# Opus Work Order — Stage 180: Full Ravenford Integration

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 180 ONLY  
> **NEXT ACTION AFTER PASS:** SWITCH TO GPT-6 ASTRA — EFFORT MAX — GATE #5  
> **EXPECTED ASTRA OUTPUT:** `reviews/ASTRA_GATE_05_REPORT.md`  
> **STAGE 190 IS THE ASTRA REVIEW; DO NOT IMPLEMENT IT OR START STAGE 200.**


## Read First
- `EFFORT_MATRIX.md`
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 180)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Automate complete Ravenford scenario across all implemented domains.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Full vertical-slice integration suite and relevant prior regression suites pass. All backend obligations in `docs/GATE_COVERAGE.md` are now due; include executable surfaces and evidence in the Gate 05 handoff.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.

## Formal Checkpoint
After validation succeeds:
1. create `handoffs/ASTRA_GATE_05_REQUEST.md` from `HANDOFF_TEMPLATE.md`;
2. request GPT-6 Astra at **MAX** effort;
3. require output `reviews/ASTRA_GATE_05_REPORT.md` using `ASTRA_REVIEW.md`;
4. mark status `AWAITING_ASTRA_REVIEW`;
5. **STOP.** Do not begin the next stage.

---

# 🛑 HARD STOP — MODEL SWITCH REQUIRED

Stage 180 is complete only after its deterministic validation passes.

**Do not continue development.**

1. Create `handoffs/ASTRA_GATE_05_REQUEST.md`.
2. Switch model to **GPT-6 Astra**.
3. Set Astra effort to **MAX**.
4. Give Astra `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md`, the handoff file, and the authoritative docs named by the handoff.
5. Astra must write: `reviews/ASTRA_GATE_05_REPORT.md`.
6. If Astra reports **FAIL**, return to Opus for remediation under `EFFORT_MATRIX.md`; Critical/High findings require **MAX**.
7. If Astra reports **PASS**, only then authorize Stage 200.

**Required final message from Opus:**  
`CHECKPOINT REACHED — SWITCH TO GPT-6 ASTRA / MAX — use handoffs/ASTRA_GATE_05_REQUEST.md — wait for reviews/ASTRA_GATE_05_REPORT.md`
