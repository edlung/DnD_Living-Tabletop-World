# Opus Work Order — Stage 250: Vertical Slice Release

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 250 ONLY  
> **NEXT ACTION AFTER PASS:** STOP — release complete; no further stage authorized  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; REOPEN INVALIDATED GATE COVERAGE IF NEEDED.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 250)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Release Ravenford Vertical Slice v0.1 only after product, architecture, adversarial, and usability acceptance is evidenced for the release candidate.

## Required Deliverables
- Assemble exact revision/build, reproducible install/start/validation instructions, release notes, fixtures/config requirements, known limitations, and recovery instructions.
- Link the Stage 240 usability evidence, deterministic validation, architecture decisions, and relevant Astra PASS/retest reports. Explain how the reviewed boundaries map to the release candidate; reopen invalidated gate coverage before release.
- Run the complete release validation and a fresh-environment install/start smoke check. Do not add new gameplay or UX features during packaging.
- Publish/tag only to the owner-authorized target for this release. If the target or release authorization is absent, prepare the concrete release candidate and stop awaiting that decision; do not claim it was released.
- Record actual release identifier, revision, destination, and validation evidence in `reports/STAGE_250_RELEASE.md`. Mark completion only after the authorized release succeeds.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Reopen affected independent review when a change invalidates prior gate coverage, as described in `docs/GATE_COVERAGE.md`.

## Validation Gate
All required product, architecture, adversarial, usability, build, migration/bootstrap, E2E, and context-budget checks pass or have dispositions permitted by the workflow. Required checks cannot be skipped by relabeling them. The authorized release is verifiably available with its exact revision and instructions.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not begin another release or feature stage without explicit owner authorization.

**Required final message from Opus, only after successful completion:**  
`STAGE 250 COMPLETE — Ravenford Vertical Slice v0.1 released — STOP`
