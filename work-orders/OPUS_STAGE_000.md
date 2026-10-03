# Opus Work Order — Stage 0: Repository Foundation

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 0 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 10 — Opus effort HIGH  
> **NO ASTRA SWITCH AT THIS STAGE.**


## Read First
- `docs/IMPLEMENTATION_PREREQUISITES.md` (only the current stage's entries)
- `docs/GATE_COVERAGE.md` (only the current stage's entries)
- `docs/AI_CONTEXT_MAP.md`
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `PRODUCT_BLUEPRINT.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 0)
- Relevant sections of `ARCHITECTURE.md` and `RAVENFORD_SPEC.md` for this stage

## Objective
Repository/tooling foundation only; no gameplay/domain implementation.

## Required Deliverables
1. Repository/application/package structure consistent with the modular monolith architecture.
2. Strict TypeScript configuration and reproducible dependency/package scripts.
3. Formatting, linting, and typechecking.
4. Unit/integration test infrastructure with at least one minimal smoke test.
5. Database/migration infrastructure suitable for later domain work, without inventing Stage 10 schema.
6. CI for install/restore, formatting, lint, typecheck, tests, build, migration/bootstrap, and context-budget validation.
7. Structured logging foundation.
8. Environment/config validation with safe development defaults where appropriate.
9. Clear module-boundary conventions, cohesive feature modules, and direct imports.
10. ADR workflow under `docs/adr/`; preserve pending product decisions in `docs/IMPLEMENTATION_PREREQUISITES.md`.
11. Root README with exact local development and validation commands, and a reproducible revision recorded in Git before completion.
12. Update `docs/AI_CONTEXT_MAP.md` with actual entry files. Add nested `AGENTS.md` when creating complex domains, fixtures, migrations, generated data, or historical artifact directories.
13. An automated context-budget check that fails above 700 lines for active source, test, E2E, and stylesheet files. Aim for at most 500 lines. Explicitly exclude generated/dependency/build output and datasets; never exempt hand-maintained active code merely to pass.
14. Concise Stage 0 completion report with revision, validation, assumptions, and limitations.

## Target Conceptual Structure
```text
apps/server/
apps/web/
packages/domain/
packages/rules/
packages/contracts/
packages/ui/
docs/adr/
fixtures/ravenford/
tests/
```
Placeholder directories are acceptable. Product/architecture documents remain at the root; do not duplicate them under `docs/`. Do not populate placeholders with World Kernel, gameplay, AI, combat, knowledge, or NPC implementations.

## Architectural Decisions
For a material undecided technical choice, record alternatives and tradeoffs in an ADR and choose the smallest reversible option consistent with the invariants. Product decisions and invariant changes require owner approval; do not mark pending decisions approved on the owner's behalf.

## Rules
- Preserve all architecture invariants.
- Do not implement future stages.
- Add deterministic tests for the behavior introduced here.
- Record material undecided technical choices as ADRs.
- Keep canonical mutation behind the World Engine boundary.
- If a required change conflicts with an invariant, STOP for owner/ADR decision rather than bypassing it.

## Validation Gate
Run and report exact commands/results for dependency install/restore, formatting check, lint, typecheck, tests, build, migration/bootstrap, context-budget validation, and CI-equivalent local validation. All must pass. Verify the context-budget check rejects a temporary active-code fixture above 700 lines and excludes generated output; do not retain that fixture as application code.

## Completion Artifacts
- code/tests for this stage;
- exact validation commands/results;
- relevant ADRs;
- concise completion summary with revision/commit.
- assumptions, known Stage 0 limitations, and decisions that genuinely block Stage 10.

## Hard Stop
STOP after this stage; wait for explicit authorization for the next stage.

---

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 10 in this work order.

**Required final message from Opus:**  
`STAGE 0 COMPLETE — next: OPUS_STAGE_010.md — switch/set Opus effort to HIGH`
