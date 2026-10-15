> Current owner policy (2026-10-15): one session, one model. `docs/PROJECT_WORKFLOW.md` controls new work.
> The model selected in the session plans, implements, verifies and reports. There is no orchestrator,
> no separate writer/reviewer role assignment and no model or effort pinning. Older assignments are
> historical; preserve their evidence, not their future authority.

# Living Tabletop World — Agent Workflow Contract v2.0

Updated by owner decision 2026-10-15. Current status is in `docs/PROJECT_WORKFLOW.md`.

## Who does what

- The **session model** (whichever model the owner selected) does all the work: reads the work order,
  writes the design where one is needed, implements, runs every check, reviews its own change
  adversarially, writes the handoff and reports. It may use subagents or tools when that helps; they are
  an implementation detail, not a role in this process.
- The **project owner** makes every product decision, authorizes each stage, gives dispositions for
  findings that are deferred, and does the human play acceptance.
- No model approves a stage on the owner's behalf. A report from the session is evidence, not approval.

## State machine

`DESIGN_DRAFT -> APPROVED_DESIGN -> IMPLEMENTING -> CHECKPOINT_READY -> OWNER_DISPOSITION`

- A stage or material architecture change starts with a design draft where the work order or the
  change needs one. The owner approves it (or amends it) before implementation. Roadmap approval does
  not approve a future stage.
- At `CHECKPOINT_READY` the session writes the handoff (below) and **stops**. PASS does not start the
  next stage; the owner authorizes it explicitly.
- Stop at the authorized stage boundary. Never begin a later stage on your own.

## Verification the session owns

1. Write the failing regression first for each changed contract; fix the root contract.
2. Run the full validation (`pnpm validate`, offline: no paid provider calls) and the relevant prior
   regressions. Never report an unperformed check as passed; state what was and was not verified.
3. Do an adversarial pass of your own change against `ARCHITECTURE_INVARIANTS.md` and the stage's
   gate coverage in `docs/GATE_COVERAGE.md`: try to break the boundary, do not only confirm it works.
   Record the attacks tried and results in the handoff or report.
4. Record commit/package identity, dirty-file hashes, findings, fixes and residual risks.
5. After two repair attempts without progress, diagnose and re-plan instead of retrying blindly.

An **independent review** (a separate fresh session, possibly another model) is optional. Use it when
the owner asks for it or when a stage is a security boundary and the owner wants it. Such a review
reads the artifact without the author's verdict and reports PASS or FAIL with evidence; it never
edits the reviewed source. Its absence never blocks a stage, and its presence never replaces the
owner's play acceptance.

## Findings and severity

A Critical/High finding or a violated architecture invariant blocks the checkpoint until fixed and
re-verified. Other findings are fixed or listed with an owner-approved disposition before deferral.
Preserve initial reports and every retest; never rewrite a past FAIL into a PASS. A critical contract
change needs the owner's approval of the new design before implementation.

## Coverage and gates

Historical Gates 01–05 (Astra reviews) are immutable records; their findings and valid coverage are
preserved. Gate 06 (Stage 355, after Stage 350) remains a full-stack red-team pass of the deployed
build: the session performs it as a documented attack pass, and the owner may order a fresh-session
or other-model repeat. Follow `docs/GATE_COVERAGE.md`.

Every introducing stage records changed reviewed boundaries, deterministic regressions and the next
review obligation. Missing required coverage blocks the checkpoint. A future surface is NOT YET IN
SCOPE, never passed. Reopen affected coverage when a change invalidates it, preserving the earlier
report and naming the new revision and delta.

## Checkpoint handoff

Use `HANDOFF_TEMPLATE.md`. Exact reproduction commands, fixtures, due coverage, validation results,
known limitations. Status `AWAITING_OWNER_DISPOSITION`. Handoffs go in `handoffs/`, reports in
`reviews/` or `reports/`. Freeze a handoff once the owner starts reviewing it; later changes get a
numbered request.

## Product acceptance

From Stage 290, a stage that changes what a Player or DM sees or does is complete only after the owner
plays its affected flows and the report records the disposition. An AI stand-in is a useful filter,
never human acceptance. Stage 360 requires real uncoached human playtests. The owner's deferral of
Stage 290/300 personal acceptance stays recorded; do not infer approval or keep asking for it.

## Protected contracts, spending and context

Follow `ARCHITECTURE_INVARIANTS.md`. Obtain an owner ADR decision before changing a protected product
contract. Spending: no paid provider call without the owner's explicit authorization, a stored
operator approval and a verified catalog entry (ADR 0032); never read or expose `.env.local`.
Read only the authorized work order, relevant docs/AGENTS and the smallest source/test entry points;
query large files narrowly. Preserve historical reports and evidence.
