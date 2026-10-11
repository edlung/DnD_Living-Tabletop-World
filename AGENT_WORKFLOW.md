# Living Tabletop World — Agent Workflow Contract v1.3

> Current owner override, 2026-10-11: `docs/PROJECT_WORKFLOW.md` records the active assignments and
> review requirements. Fresh dual architecture review and independent checkpoint acceptance apply
> to new work even between the historical numbered gates below. Owner acceptance remains separate.

## Purpose
This file defines the mandatory Opus ↔ Astra development loop. It is an execution protocol, not product documentation.

## Roles
- **Claude Opus 5.5 — BUILDER.** Implements exactly one authorized stage at a time, writes tests, runs validation, and prepares checkpoint handoffs.
- **GPT-6 Astra — REVIEWER.** Independently attacks the implementation at designated gates, does not implement fixes, and writes a Markdown report.
- **Project owner — AUTHORITY.** May approve ADRs, architecture-invariant changes, and exceptional continuation.

## Effort Policy
`EFFORT_MATRIX.md` is the single authority for model and effort settings. Work order banners summarize it; they do not define a second policy. Resolve any mismatch before execution.

## State Machine
`OPUS_IMPLEMENTING -> OPUS_CHECKPOINT_READY -> ASTRA_REVIEWING -> {GATE_PASS | GATE_FAIL}`

If FAIL:
`GATE_FAIL -> OPUS_REMEDIATING -> ASTRA_RETESTING -> {GATE_PASS | GATE_FAIL}`

At a formal checkpoint, `GATE_PASS` is required before the owner may authorize the next stage. PASS does not itself start that stage. Between formal gates, successful deterministic validation followed by explicit owner authorization permits the next stage; no Astra report is required there.

## Gate Schedule
- After Stage 20: Astra Gate #1 — Knowledge Boundary.
- After Stage 70: Astra Gate #2 — Contradiction / Knowledge Integrity.
- After Stage 90: Astra Gate #3 — Reaction Integrity.
- After Stage 130: Astra Gate #4 — NPC Isolation.
- After Stage 180: Astra Gate #5 — Full Red Team (the review activity called Stage 190).
- After Stage 350: Astra Gate #6 — Full-Stack Red Team (the review activity called Stage 355).

Stages between gates still require deterministic validation but not formal Astra handoff unless the project owner requests one.

`CHECKPOINTS.md` defines artifact paths. Stage 190 is Gate #5, not another implementation stage; all its artifacts use gate number `05`. Stage 355 is Gate #6 in the same way; its artifacts use gate number `06`.

## Coverage Across Stages
Use `docs/GATE_COVERAGE.md` to distinguish surfaces due now from future surfaces. A gate must exercise all due surfaces and relevant prior regressions. A missing or untestable required surface blocks PASS; describe the gap rather than certifying it.

Record future surfaces as NOT YET IN SCOPE with their introduction stage and next review gate. This is not a passed test or a deferred defect. The introducing stage must add deterministic boundary tests, and the next designated gate must review the integrated surface. No future-surface deferrals remain at Gate #5 for the backend slice.

## Product Acceptance
Independent gates test integrity, not experience. From Stage 290 on, a stage that changes what a Player or DM sees or does is complete only after the owner has played the affected flows on that stage's build and the completion report records the owner's disposition. An AI stand-in pass may come first as a filter for obvious friction. It is never acceptance and never replaces a human session where one is required (Stage 360).

## Mandatory Opus Behavior at a Gate
When a gate stage is complete, Opus MUST:
1. run all stage validation and relevant prior regression suites;
2. commit/record the exact revision under review;
3. create `handoffs/ASTRA_GATE_<NN>_REQUEST.md` using `HANDOFF_TEMPLATE.md`;
4. include exact commands to reproduce/start the system and test personas/fixtures required by Astra;
5. include known limitations honestly, without coaching Astra toward implementation details;
6. set status to `AWAITING_ASTRA_REVIEW`;
7. STOP. Do not start the next stage and do not attempt to self-certify the gate.

The final chat message from Opus at a gate should be concise: checkpoint reached, handoff path, revision, validation status, and explicit request to run Astra review.

## Mandatory Astra Behavior
Astra MUST:
1. read the authoritative product/architecture docs relevant to the gate, the handoff request, public contracts, and testable implementation;
2. treat Opus implementation explanations as non-authoritative;
3. attack the system without modifying production/source implementation during the review;
4. create `reviews/ASTRA_GATE_<NN>_REPORT.md` from `ASTRA_REVIEW.md`;
5. include reproducible findings, severity, violated invariant, evidence, and required regression test;
6. end with exactly one gate result: `PASS` or `FAIL`;
7. if FAIL, identify blocking findings but do not fix them;
8. STOP after writing the report.

## Mandatory Opus Remediation Behavior
On FAIL, Opus MUST:
1. read the Astra report in full;
2. create a failing regression test for every Critical/High finding before the fix whenever technically feasible;
3. identify root cause and fix the architectural boundary rather than only the exposed endpoint;
4. preserve architecture invariants;
5. run the affected stage suite plus relevant earlier regression suites;
6. create `remediation/OPUS_GATE_<NN>_REMEDIATION.md` listing finding -> root cause -> regression test -> fix -> validation evidence;
7. create/update the handoff as a RETEST request;
8. STOP and request Astra retest.

## Retest Rule
Astra writes `reviews/ASTRA_GATE_<NN>_RETEST_<K>.md`. The RETEST handoff names that exact output, the original report, the remediation artifact, and the new revision. A previous FAIL can only become PASS through an Astra retest report. Opus may not mark its own remediation PASS.

When later changes invalidate coverage after a PASS, reopen the affected gate using review type RETEST and the next unused retest number. Link the previous report and changed revision/surfaces; if this is coverage expansion rather than FAIL remediation, mark the remediation artifact N/A with that reason. Never overwrite an initial report or an earlier retest. The reopened gate must PASS before the dependent stage can complete.

## Severity Gate Policy
- Any unresolved Critical or High finding => FAIL.
- Medium findings that violate an architecture invariant => FAIL unless explicitly accepted by the project owner through ADR/risk acceptance.
- Other Medium/Low findings may be deferred only when recorded with owner-approved disposition.

The report header and final result must both be exactly PASS or FAIL. Accepted nonblocking findings remain separate from that result and link their owner-approved dispositions.

## Context Discipline
Do not force either model to reread every document on every task. Read the documents named by the work order/handoff plus any directly relevant architecture/invariant sections. This avoids bloated context while preserving authority.

## No Silent Architecture Changes
If implementation requires changing a product invariant or a material architecture contract, STOP and request an ADR decision. Neither agent may silently rewrite the contract.
