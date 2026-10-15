> Current owner policy (2026-10-15): one session, one model. `docs/PROJECT_WORKFLOW.md` controls new work.
> The model selected in the session plans, implements, verifies and reports; no orchestrator, no
> separate writer/reviewer roles, no model or effort pinning. Older assignments are historical.

# Work Order Routing

Read only the explicitly authorized stage, its Read First entries, and directly relevant prerequisite/coverage rows. Do not load this directory wholesale during implementation.

Use `docs/PROJECT_WORKFLOW.md` for current status. Model/effort lines in work orders are historical suggestions; the session's model does the work.
Historical review assignments and evidence remain unchanged.

Every path inside a work order is relative to the repository root. Banners never authorize the next stage.

Stage 190 is Astra Gate 05, so it has a review mission in `ASTRA_GATE_PROMPTS.md` and no Opus implementation work order. Stages 200–250 are separate owner-authorized stages after Gate 05 PASS. Stop at each stage boundary.

Stages 290–360 are the alpha phase (`EXECUTION_PLAN.md`, v0.3). Each is a separate owner-authorized stage with owner decisions listed in `docs/IMPLEMENTATION_PREREQUISITES.md` (Q4–Q11); resolve required open decisions before implementation, preserving decisions and deferrals already given. Stage 355 is Gate 06, a full-stack red-team pass (see `AGENT_WORKFLOW.md`): a review mission, no implementation work order. Stage 360 completes the release that Stage 250 prepared.
