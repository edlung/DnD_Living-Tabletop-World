> Current owner policy (2026-10-15): one session, one model. `docs/PROJECT_WORKFLOW.md` controls new work.
> The model selected in the session plans, implements, verifies and reports; no orchestrator, no
> separate writer/reviewer roles, no model or effort pinning. Older assignments are historical.

# Model Selection Notice

The model selected in the session does the work. `EFFORT_MATRIX.md` and work-order model/effort banners are historical suggestions, not requirements. At a checkpoint, obey the HARD STOP.

# Living Tabletop World Agent Instructions

Owner request 2026-11-01 (`reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`): finish the product
(Stages 500–540, `docs/PRODUCT_COMPLETION_PLAN.md`) with minimal interruptions; the owner delegated the
program's product decisions (recorded in the plan). Technical checkpoints pass autonomously with the usual
checks and reports; World Engine authority, knowledge isolation and the deployment/credential limits stay.

Owner override for the AI campaign program, 2026-10-30:
`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json` accepts Stage 380 and authorizes
the session to pass the technical checkpoints of Stages 390–450 autonomously.
Keep scoped work orders, verification, adversarial passes and reports; continue
between these stages without intermediate owner confirmation. Show the finished
functionality at the end. This overrides the technical HARD STOP below for this
program only; product authority, runtime DM confirmation, human acceptance honesty,
deployment/credential/publication restrictions and all architecture invariants remain.

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
