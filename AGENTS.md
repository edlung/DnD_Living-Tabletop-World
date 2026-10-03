# Runtime Model Selection Notice

Read `EFFORT_MATRIX.md` before executing any work order. It is the single authority for model/effort selection, including remediation; work order banners are summaries. At a checkpoint, obey the HARD STOP and model-switch instruction.

# Living Tabletop World Agent Instructions

Start with `docs/AI_CONTEXT_MAP.md`, then read the nearest applicable `AGENTS.md` and the files needed for the task.
Use `AGENT_WORKFLOW.md` for the Opus↔Astra stage/gate protocol.
Use `ARCHITECTURE_INVARIANTS.md` whenever work touches authority, state, knowledge, rules, history, AI mutation, or UX guarantees.
Use the current file under `work-orders/` as the only authorized implementation scope.
Do not begin a later stage unless explicitly authorized.
At formal checkpoints, create the required Markdown handoff and STOP for Astra review.

# Context and Module Boundaries

- Organize code by cohesive feature/domain boundaries; keep orchestration thin and use direct imports.
- Aim for at most 500 lines per active source, test, E2E, or stylesheet file; 700 lines is the hard ceiling. Extract a cohesive boundary before extending an oversized file.
- Maintain `docs/AI_CONTEXT_MAP.md` as entry points change. Add nested `AGENTS.md` for complex domains, generated data, fixtures, migrations, and historical reports when those areas are created.
- Query large files and datasets narrowly. Keep generated assets, logs, and historical artifacts outside normal source context.
- Stage 0 must provide an automated context-budget check in local validation and CI.
