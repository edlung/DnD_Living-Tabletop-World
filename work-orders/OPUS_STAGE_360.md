# Opus Work Order — Stage 360: Playtests and Release v0.1

> [!IMPORTANT]
> **MODEL:** Claude Sonnet 5.5 (per `EFFORT_MATRIX.md`)  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 360 ONLY  
> **NEXT ACTION AFTER PASS:** STOP — release complete; no further stage authorized  
> **REQUIRES GATE 06 PASS. REOPEN INVALIDATED GATE COVERAGE IF REMEDIATION CHANGES A REVIEWED BOUNDARY.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 360)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- `RAVENFORD_SPEC.md` (Player, DM, and Integrity Acceptance; Definition of Done)
- `reports/STAGE_240_USABILITY.md`, `reports/STAGE_250_RELEASE.md`, `docs/RELEASE_CANDIDATE.md`
- `reviews/ASTRA_GATE_06_REPORT.md` and any retest
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Find out with real people whether a Ravenford session feels like a living world, and release v0.1 if it does.

## Required Deliverables
- Require Gate 06 PASS, including any retest, and the owner's participants (Q11) with their consent to recording and to their text being processed by the AI providers named to them.
- First, an AI stand-in pass on the deployed build as a filter for obvious friction. It is never acceptance.
- Three to five uncoached sessions in Russian on the deployed build, each with a DM and one to three players, 30–45 minutes, with neutral task prompts and no facilitator help.
- Record for each session the revision, roles, and conditions; what participants did and said; where they needed help; task outcomes and failures. Keep observations apart from interpretation. Primary question: did they interact with the world or hunt through UI?
- The owner's disposition of every finding; bounded remediation with regression tests; another session when a blocking finding was fixed. Do not redesign the product inside this stage.
- Then complete the release that Stage 250 prepared: the full validation on the final revision, the release identifier and tag, the destination, and the record in `reports/STAGE_250_RELEASE.md`.
- Do not invent participants, observations, or acceptance. If sessions cannot run or acceptance fails, record that in `reports/STAGE_360_PLAYTESTS.md` and stop for the owner.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner this stage's open questions (Required Deliverables; `docs/IMPLEMENTATION_PREREQUISITES.md`) before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
Human sessions were completed and evaluated against Player and DM acceptance, with reproducible defects and the owner's disposition of every finding. Full-journey E2E and integrity regressions pass on the final revision. The authorized release is verifiably available with its exact revision and instructions.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_360_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not begin another release or feature stage without explicit owner authorization.

**Required final message from Opus, only after successful completion:**  
`STAGE 360 COMPLETE — Ravenford Vertical Slice v0.1 released — STOP`
