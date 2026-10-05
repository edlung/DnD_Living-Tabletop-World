# v1.3 Release Notes

Development Pack changes of 2026-10-05, made after the Stage 250 release candidate and approved in outline by the project owner. The product blueprint, architecture invariants, and Ravenford scenario are unchanged.

- Added the alpha phase to `EXECUTION_PLAN.md` (v0.3): Stages 290–360 and Astra Gate 06 (the review called Stage 355), with a work order for each implementation stage.
- The goal moves from proving integrity to proving the experience: a closed alpha with real people, in Russian, on a deployed build, and then the v0.1 release. Stage 360 completes the release that Stage 250 prepared.
- Gate 06 is a full-stack review of the deployed build and the first independent review of the client (`CHECKPOINTS.md`, `ASTRA_GATE_PROMPTS.md`, `docs/GATE_COVERAGE.md`).
- Added Product Acceptance to `AGENT_WORKFLOW.md`: a stage that changes what a Player or DM sees ends with the owner playing the affected flows. An AI stand-in pass is a filter, never acceptance.
- `EFFORT_MATRIX.md` covers Stages 290–360 under the same operating rule: HIGH by default, MAX for Stages 290, 310, and 340. A different builder model is recorded in the matrix before a stage starts, not as a per-stage exception.
- `docs/IMPLEMENTATION_PREREQUISITES.md` records the owner's decisions Q5–Q7 (text models: Claude and DeepSeek; image provider: OpenAI; language of play: Russian) and the open questions Q4 and Q8–Q11.
- Repository: a private GitHub remote and hosted CI. The lint script sets its own heap, because the first hosted run failed on memory.
