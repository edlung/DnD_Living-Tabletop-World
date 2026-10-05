# Desktop Workflow Quickstart — v1.3

## Tools
- **Claude Desktop + Claude Opus 5.5** = primary builder.
- **Codex Desktop + GPT-6 Astra** = independent adversarial reviewer.
- CLI tools are optional and are not required for the first Ravenford vertical slice.

## Start
1. Open the Development Pack folder in Claude Desktop and start with `docs/AI_CONTEXT_MAP.md`. Stage 0 establishes the Git repository and tooling.
2. Select **Claude Opus 5.5 / HIGH**.
3. Read `EFFORT_MATRIX.md`, then give it `OPUS_MASTER.md` and `work-orders/OPUS_STAGE_000.md` with explicit authorization for Stage 0 only. `OPUS_STAGE_00.md` is deprecated.
4. Keep Opus on HIGH across ordinary stages.
5. Use the matrix for all changes, including remediation. Banners must agree with it. Stop after each stage and explicitly authorize the next one only after its prerequisites pass.

## Astra Gate
Use `CHECKPOINTS.md` for exact filenames and `docs/GATE_COVERAGE.md` for due surfaces. The review called Stage 190 is Gate 05, and the review called Stage 355 is Gate 06; neither has an Opus implementation work order.
At Stages 20, 70, 90, 130, 180, and 350, Opus must:
- run its deterministic validation;
- create `handoffs/ASTRA_GATE_XX_REQUEST.md`;
- stop;
- explicitly tell you to switch applications/models.

Then:
1. Open the same repository in Codex Desktop.
2. Select **GPT-6 Astra / MAX**.
3. Give Astra `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md`, the handoff file, and the authoritative docs referenced by that handoff.
4. Astra reviews but does not fix implementation.
5. Astra writes `reviews/ASTRA_GATE_XX_REPORT.md`.

## If Astra PASS
Return to Claude Desktop. Confirm the report applies to the reviewed revision, set Opus to the effort in the matrix, and explicitly authorize the next work order. Stage 200 follows Gate 05 PASS; Stages 200–250 each require their own authorization. The alpha phase (Stages 290–360) works the same way: each stage needs its own authorization, and Stage 360 follows Gate 06 PASS.

## If Astra FAIL
For any Critical/High finding:
1. Return to Claude Desktop.
2. Select **Claude Opus 5.5 / MAX**.
3. Give Opus the Astra report and `OPUS_REMEDIATION_TEMPLATE.md`.
4. Opus writes regression tests first, fixes root causes, creates the remediation report, and stops.
5. Return to Codex Desktop.
6. Run **Astra / MAX** retest.
7. Progress only after Astra PASS and explicit authorization of the next stage.

For Medium/Low-only findings, follow the severity/disposition policy in `AGENT_WORKFLOW.md`; do not silently bypass a FAIL.

## Golden Rules
- Keep builder and reviewer roles separate.
- Do not ask Astra to “help code” between gates.
- Do not let Opus self-approve a failed gate.
- Repository `.md` artifacts are the durable handoff state.
