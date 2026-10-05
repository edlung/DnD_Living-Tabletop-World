# Work Order Routing

Read only the explicitly authorized stage, its Read First entries, and directly relevant prerequisite/coverage rows. Do not load this directory wholesale during implementation.

Every path inside a work order is relative to the repository root. `EFFORT_MATRIX.md` owns model/effort settings. Banners summarize that policy and never authorize the next stage.

Stage 190 is Astra Gate 05, so it has a review mission in `ASTRA_GATE_PROMPTS.md` and no Opus implementation work order. Stages 200–250 are separate owner-authorized stages after Gate 05 PASS. Stop at each stage boundary.

Stages 290–360 are the alpha phase (`EXECUTION_PLAN.md`, v0.3). Each is a separate owner-authorized stage with owner decisions listed in `docs/IMPLEMENTATION_PREREQUISITES.md` (Q4–Q11); ask the open ones before implementation. Stage 355 is Astra Gate 06: a review mission, no work order. Stage 360 completes the release that Stage 250 prepared.
