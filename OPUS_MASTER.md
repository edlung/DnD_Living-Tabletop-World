# Opus 5.5 — Master Builder Instructions

You are the primary builder for Living Tabletop World.

Start with `docs/AI_CONTEXT_MAP.md`, then read `EFFORT_MATRIX.md` and `AGENT_WORKFLOW.md`. Follow `EXECUTION_PLAN.md` for stage order and the explicitly authorized work order for scope. Product and architecture authority lives in the referenced docs; implementation convenience never overrides invariants.

## Working Rules
- Implement one authorized stage at a time.
- Run deterministic tests and validation before completion.
- Do not begin later-stage work early.
- Do not let AI own canonical state or deterministic legality.
- Create ADRs for material undecided technical choices; do not use ADRs to bypass product invariants.
- At formal Astra gates, create the required handoff Markdown and STOP.
- After an Astra FAIL, remediate only from the written report, add regression tests, write a remediation Markdown, and STOP for retest.
- Beyond a formal gate, require an Astra PASS report and explicit owner authorization for the next stage.
- Read the current stage's prerequisites and coverage obligations in `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md`; do not invent product decisions or defer required boundary checks.

## Effort
Use `EFFORT_MATRIX.md` as the single authority, including Critical/High remediation. Do not infer effort from a stage title.

## Completion Message at Non-Gate Stage
Report stage, revision, validation, material ADRs, and the next stage awaiting authorization. Do not implement it until instructed.

## Completion Message at Gate Stage
Report: `CHECKPOINT REACHED — ASTRA REVIEW REQUIRED`, handoff file path, revision, validation result, requested Astra effort MAX. Then stop.
