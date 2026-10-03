# AI Context Map

This is a documentation-only Development Pack. No implementation stage has been executed or authorized by preparing it. Product/architecture documents are at the repository root. Paths below are relative to that root.

Read the nearest `AGENTS.md`, then only the entries needed for the task. Stage 0 must add actual source/test entry points here as they are created.

| Task | Smallest starting set |
|---|---|
| Start or authorize a stage | `QUICKSTART.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the one authorized file in `work-orders/` |
| Repository foundation | `work-orders/OPUS_STAGE_000.md`, `ARCHITECTURE.md` (System Shape, Persistence, Deployment) |
| Product behavior or invariant | `ARCHITECTURE_INVARIANTS.md`, relevant section of `PRODUCT_BLUEPRINT.md` or `RAVENFORD_SPEC.md` |
| Find a stage or dependency | Relevant stage in `EXECUTION_PLAN.md`, `docs/IMPLEMENTATION_PREREQUISITES.md` |
| Knowledge boundary and later leakage paths | `docs/GATE_COVERAGE.md`, relevant knowledge/memory/NPC work order, `ARCHITECTURE.md` (Knowledge Architecture, NPC Context Isolation) |
| History, replay, undo | `docs/IMPLEMENTATION_PREREQUISITES.md` (Temporal and undo contracts), Stages 10, 90, or 110 as applicable |
| Deterministic rules | `docs/IMPLEMENTATION_PREREQUISITES.md` (Ruleset), Stage 40, relevant Ravenford mechanics |
| AI authoring or continuity | Stages 110/120, invariant 16, `RAVENFORD_SPEC.md` (DM Authoring Acceptance Flow) |
| Prepare/review a checkpoint | `CHECKPOINTS.md`, `docs/GATE_COVERAGE.md`, exact handoff, `ASTRA_MASTER.md`, relevant mission in `ASTRA_GATE_PROMPTS.md`, `ASTRA_REVIEW.md` |
| Remediation/retest | Exact failed report, `OPUS_REMEDIATION_TEMPLATE.md`, `HANDOFF_TEMPLATE.md`, `AGENT_WORKFLOW.md` (Retest Rule) |
| UX, validation, release | Authorized Stage 200–250 work order, relevant product/Ravenford acceptance sections |

Do not load every work order or historical report for an ordinary task. Future generated assets, migrations, logs, and large fixtures must have local context guidance and be queried narrowly. `OPUS_STAGE_00.md` is a deprecated pointer, not a second Stage 0 specification.
