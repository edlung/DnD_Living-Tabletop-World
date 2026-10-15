> Current owner policy (2026-10-15): one session, one model. `docs/PROJECT_WORKFLOW.md` controls new work.
> The model selected in the session plans, implements, verifies and reports; no orchestrator, no
> separate writer/reviewer roles, no model or effort pinning. Older assignments are historical.

# Model Selection Notice

The model selected in the session does the work. `EFFORT_MATRIX.md` and work-order model/effort banners are historical suggestions, not requirements. At a checkpoint, obey the HARD STOP.

# Living Tabletop World Agent Instructions

Start with `docs/AI_CONTEXT_MAP.md`, then read the nearest applicable `AGENTS.md` and the files needed for the task.
Use `AGENT_WORKFLOW.md` for protocol and `docs/PROJECT_WORKFLOW.md` for current status.
Use `ARCHITECTURE_INVARIANTS.md` whenever work touches authority, state, knowledge, rules, history, AI mutation, or UX guarantees.
Use the current file under `work-orders/` as the only authorized implementation scope.
Do not begin a later stage unless explicitly authorized.
At formal checkpoints, run all checks and your own adversarial pass, create the required Markdown handoff and STOP for the owner's disposition.

# Context and Module Boundaries

- Organize code by cohesive feature/domain boundaries; keep orchestration thin and use direct imports.
- Aim for at most 500 lines per active source, test, E2E, or stylesheet file; 700 lines is the hard ceiling. Extract a cohesive boundary before extending an oversized file.
- Maintain `docs/AI_CONTEXT_MAP.md` as entry points change. Add nested `AGENTS.md` for complex domains, generated data, fixtures, migrations, and historical reports when those areas are created.
- Query large files and datasets narrowly. Keep generated assets, logs, and historical artifacts outside normal source context.
- Stage 0 must provide an automated context-budget check in local validation and CI.
