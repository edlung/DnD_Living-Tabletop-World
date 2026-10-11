> Current owner policy (2026-10-11): `docs/PROJECT_WORKFLOW.md` controls new work.
> Architecture: Astra/Fable xhigh. Implementation: Opus medium; review repairs xhigh.
> Acceptance: fresh independent Sol/Opus xhigh. Orchestration: Sol medium.
> Older model assignments are historical; preserve their evidence, not their future authority.

# Living Tabletop World — Agent Workflow Contract v1.4

Updated by owner decision 2026-10-11. Current assignments and checkpoint status are in
`docs/PROJECT_WORKFLOW.md`; effort selection is in `EFFORT_MATRIX.md`.

## Roles and independence

Current role identities and pinned efforts are in `docs/PROJECT_WORKFLOW.md`.
- The project owner approves product decisions and dispositions. Human play acceptance is separate.

A reviewer session never implements or resumes an implementer's session. Even where Opus is the
implementation model, acceptance uses a different fresh Opus session. Do not pass another reviewer's
verdict into an initial independent review. A model request or self-identification is not proof:
pin model/effort and verify native provider routing and actual response-model evidence. No fallback
model satisfies a named-model gate. Do not enable API billing or credits to obtain a review.

## State machine and approvals

`DESIGN_DRAFT -> ASTRA_AND_FABLE_REVIEW -> APPROVED_DESIGN -> IMPLEMENTING -> CHECKPOINT_READY -> SOL_AND_OPUS_REVIEW -> PASS | FAIL`

Before a stage or material architecture change, both architecture reviewers approve the same exact
artifact/hash. Roadmap approval does not approve a future stage. Each implementation checkpoint
requires fresh independent Sol/Opus xhigh acceptance of actual changes and checks before dependent work.
A FAIL goes to remediation, new verification evidence, and fresh independent Sol/Opus xhigh retests. No implementation
session marks its own fixes accepted. Preserve initial reports, findings and every retest.

Each stage still needs explicit owner authorization. PASS does not start the next stage. Stage 310
continuation is authorized, but its dependent implementation waits for Stage 300 acceptance and its
own dual architecture approval. Stop at the authorized stage boundary.

## Coverage and formal gates

Historical Gates 01–05 were Astra reviews and remain immutable records. Their findings and valid
coverage are preserved. Future Gate 06, after Stage 350, requires independent Sol/Opus xhigh full-stack reviews
(Stage 355); numbering and coverage obligations do not change. Follow `docs/GATE_COVERAGE.md`.
Legacy `ASTRA_MASTER.md`, `ASTRA_GATE_PROMPTS.md` and `ASTRA_REVIEW.md` remain reference mission/
report templates; their old reviewer names do not override this assignment. Use new Opus filenames
for current review artifacts, as specified in `CHECKPOINTS.md`.

Every introducing stage records changed reviewed boundaries, deterministic regressions and the next
integrated review obligation. Missing required coverage blocks PASS. A future surface is NOT YET IN
SCOPE, never passed. Reopen affected accepted coverage when changes invalidate it; preserve the
previous report and identify the new revision, delta and next retest number.

## Checkpoint handoff and reviewer behavior

The implementation writer finishes and releases checkout ownership before review:
1. Run required checks and relevant prior regressions; never report unperformed checks as passed.
2. Record commit/package identity, dirty hashes, design hash, findings, fixes and residual risks.
3. Prepare the Markdown handoff with exact reproduction commands, fixtures, due coverage and output
   report path; set status AWAITING_SOL_AND_OPUS_REVIEW.
4. Stop dependent implementation until acceptance.

Launch separate fresh read-only Sol and Opus reviews with explicit models and xhigh effort. The reviewer independently
inspects contracts, actual source and evidence, reproduces relevant attacks/checks, and reports
PASS or FAIL with severity, exact evidence, violated invariant, required regression and limitations.
For independent architecture review, scope searches to named source/contract paths; repo-wide
searches must not leak other review reports into the fresh session. Record any incidental exposure.
Source fixes belong to the implementation writer. The orchestrator may save the returned report and
transport receipt. One writer owns each checkout; parallel reviews/checks must not modify reviewed
files or conflict over shared resources. Isolate any additional writers in explicit worktrees.

## Remediation and severity

For Critical/High findings, add a failing regression where feasible, identify and repair the root
contract, run affected and prior checks, record finding-to-fix evidence and stop for fresh independent Sol/Opus retests.
After two repair attempts without meaningful progress, diagnose/re-plan rather than blindly retry.
Unresolved Critical/High or Medium invariant violations block PASS. Other findings require explicit
recorded owner-approved disposition before deferral. Critical contract changes require renewed
architecture review of the new exact artifact before implementation.

Track effective model/effort, elapsed time, attributable usage where available and rework. Cache
statistics and API cost estimates do not prove subscription quota savings. Named-model gates stay
pending if model identity, access or authorized billing is unavailable.

## Retest Rule

A RETEST handoff names the exact new report path from `CHECKPOINTS.md`, original report, remediation
artifact, new revision and relevant delta. A past FAIL becomes PASS only through an independent fresh
Sol/Opus xhigh retest reports. Preserve every initial report and previous retest. When later changes
invalidate accepted coverage, reopen the affected gate with the next unused retest number; mark the
remediation artifact N/A with a reason if this is coverage expansion. The reopened scope must pass
before dependent work advances. Formal gate reports use PASS or FAIL in both header and final result;
record nonblocking findings and owner-approved dispositions separately.

## Product acceptance

From Stage 290, a stage changing what a Player/DM sees or does is complete only after the owner plays
its affected flows and the report records disposition. An AI stand-in is a useful filter, never
human acceptance. Stage 360 requires real uncoached human playtests. The user's deferral of Stage
290/300 personal acceptance remains recorded; do not infer approval or repeatedly ask for it.

## Protected contracts and context

Follow `ARCHITECTURE_INVARIANTS.md`. Obtain an owner ADR decision before changing a protected product
contract. Read only the authorized work order, relevant docs/AGENTS and smallest source/test entry
points. Preserve historical reports and never rewrite a past FAIL into a PASS.
