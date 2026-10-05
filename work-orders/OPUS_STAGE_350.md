# Opus Work Order — Stage 350: Deployment

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 350 ONLY  
> **NEXT ACTION AFTER PASS:** SWITCH TO GPT-6 ASTRA — EFFORT MAX — GATE #6  
> **EXPECTED ASTRA OUTPUT: `reviews/ASTRA_GATE_06_REPORT.md`. STAGE 355 IS THE ASTRA REVIEW; DO NOT IMPLEMENT IT OR START STAGE 360.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 350)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- `ARCHITECTURE.md` (Deployment, Persistence, Observability), ADR 0003, ADR 0005
- `docs/RELEASE_CANDIDATE.md` (Before a VPS release), `reports/STAGE_250_RELEASE.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Run the slice on the owner's VPS, reproducibly and recoverably, ready for independent review.

## Required Deliverables
- Owner decisions first (Q10): provider, domain, and backup location.
- A reproducible deployment from a tagged revision: container images, a reverse proxy with TLS, the static client, the server reachable only through the proxy, secrets from the environment only.
- Migrations run on deploy. A restore drill takes a backup into a fresh database and replays it to the same world; the event store is canonical.
- Health and readiness checks, retained structured logs, error reporting, disk and memory alarms, and counters for AI and image spending.
- A review campaign on the deployed build for Gate 06, and a runbook: deploy, roll back, rotate keys, restore, revoke a user, stop AI spending.
- Hosted CI is green on the deployed revision.
- Nothing is announced, nobody is invited, and nothing is released in this stage.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner the open questions named below before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes on the deployed revision and hosted CI is green. The deployed build passes a smoke run of the Player and DM acceptance flows in Russian. The restore drill succeeds. All alpha-phase rows of `docs/GATE_COVERAGE.md` are due; include their executable surfaces and evidence in the Gate 06 handoff.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_350_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Formal Checkpoint
After validation succeeds:
1. create `handoffs/ASTRA_GATE_06_REQUEST.md` from `HANDOFF_TEMPLATE.md`, with the address of the deployed review build, test accounts, and every surface due in `docs/GATE_COVERAGE.md` (alpha-phase table);
2. request GPT-6 Astra at **MAX** effort;
3. require output `reviews/ASTRA_GATE_06_REPORT.md` using `ASTRA_REVIEW.md`;
4. mark status `AWAITING_ASTRA_REVIEW`;
5. **STOP.** Do not begin the next stage.

---

# 🛑 HARD STOP — MODEL SWITCH REQUIRED

Stage 350 is complete only after its deterministic validation passes.

**Do not continue development.**

1. Create `handoffs/ASTRA_GATE_06_REQUEST.md`.
2. Switch model to **GPT-6 Astra**.
3. Set Astra effort to **MAX**.
4. Give Astra `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md`, the handoff file, and the authoritative docs named by the handoff.
5. Astra must write: `reviews/ASTRA_GATE_06_REPORT.md`.
6. If Astra reports **FAIL**, return to Opus for remediation under `EFFORT_MATRIX.md`; Critical/High findings require **MAX**.
7. If Astra reports **PASS**, only then authorize Stage 360.

**Required final message from Opus:**  
`CHECKPOINT REACHED — SWITCH TO GPT-6 ASTRA / MAX — use handoffs/ASTRA_GATE_06_REQUEST.md — wait for reviews/ASTRA_GATE_06_REPORT.md`
