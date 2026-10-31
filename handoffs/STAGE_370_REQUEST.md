# Checkpoint Handoff — Stage 370

- Gate: Stage 370, AI campaign detailed contract.
- Type: INITIAL.
- Completed scope: Stage 370 design deliverables; runtime implementation is future work.
- Revision: base `4b57f2c2b3db1102147947ab28d7fb1d4e38c476`, branch
  `codex/stage-370-campaign-contract`, local package identified by the manifest below.
- Prior report/remediation: N/A, first checkpoint for this program.
- Report: `reports/STAGE_370_COMPLETION.md`.
- Session model: the selected Codex model, without delegated reviewer roles.
- Approved design: program/monetary requirements authorized in the owner chat;
  detailed design and ADR 0038 await owner approval, not self-approved.
- Dirty-file hashes/package identity: `reports/evidence/stage-370/package.sha256`.
- Package manifest SHA256:
  `2693d060ff120f629d272880c2fa8027427325b1e0000f108e80d0dd713df94e`.
- Proposed design SHA256:
  `4b2c6157accc3d24ec9d1e5674930ec4691b59524c0b3e504b3e92759170d769`.
- Status: **AWAITING_OWNER_DISPOSITION**.

## Objective

Review a concrete contract for AI-generated independent campaigns that can be
inspected as a scenario and a visual world, selectively revised, then activated
only as the exact owner-confirmed version. Monetary AI spending is unlimited by
the owner's instruction; implementation of that policy belongs to Stage 380.

## Authoritative documents

- `ARCHITECTURE_INVARIANTS.md`, `AGENT_WORKFLOW.md`, `AGENTS.md`.
- `work-orders/STAGE_370.md`, `docs/PROJECT_WORKFLOW.md`.
- `docs/STAGE_370_DESIGN.md` and proposed ADR 0038.
- `docs/design/campaign-generation/EXAMPLE.md`.
- `docs/GATE_COVERAGE.md`, `docs/IMPLEMENTATION_PREREQUISITES.md` Q12–Q18.

## Surfaces to attack

- API/routes: none introduced; later-stage obligations assigned in the coverage ledger.
- CLI/test harness: existing offline validation in an isolated throwaway database.
- UI: no UI introduced; the Russian example specifies both preview experiences.
- Logs/traces: no new runtime output; validation evidence excludes provider keys.
- Contract: pre-campaign authority, scoped preview, facts versus plans, partial
  regeneration, stale consent, image adoption and atomic publication.

## Start / reproduce

Read the design and Russian specimen together. Reproduce repository regression
validation from the project root using the saved runner (local PostgreSQL required):

```sh
cp reports/evidence/stage-370/validation-runner.txt /private/tmp/ltw-stage370-validate.mjs
node --conditions=@ltw/source /private/tmp/ltw-stage370-validate.mjs
shasum -a 256 -c reports/evidence/stage-370/package.sha256
pnpm format:check
git diff --check
```

The runner uses this checkout's absolute path, invokes the exact `pnpm validate`
script with local provider overrides, and creates/drops its own database through
the existing integration helper. It leaves the existing Ravenford database alone.

## Test personas / scopes

No new runtime personas exist in this stage. The design distinguishes workshop
owner A, unrelated owner B, the existing campaign DM, PLAYER/CHARACTER/PARTY,
PUBLIC and scoped NPCs. Existing regression suites retain their fixture personas;
no production credential is included in the checkpoint.

## Canonical secret or invariant under test

The owner sees the ice-bell mechanism and hidden-tower facts in the example. A
player on the starting dock and NPCs without those records must not receive them
through projections, images, IDs, progress, provider context or hidden DOM.
Scenario possibilities are not played events. Only the owner-confirmed package
may pass through World Engine bootstrap into canonical history.

## Validation run

| Command                                          | Result                                   |
| ------------------------------------------------ | ---------------------------------------- |
| `pnpm validate` with the saved runner            | PASS, exit 0; temporary database dropped |
| Unit tests                                       | PASS: 2,985 tests in 301 files           |
| Integration tests                                | PASS: 237 tests in 42 files              |
| Chromium journeys                                | PASS: 132 tests                          |
| Final `pnpm format:check` and `git diff --check` | PASS                                     |
| Documentation reference/stage-row check          | PASS                                     |

Complete results are in `reports/STAGE_370_COMPLETION.md` and the saved transcript.
This handoff does not claim any future-stage surface passed.

## Known limitations

Documentation only. The specimen is not executable or AI-generated and contains
no generated pictures or validated character sheets. Detailed decisions Q12–Q18
are proposed. All Stage 380–450 runtime behavior and human acceptance remain due.
Existing runtime monetary ceilings remain until Stage 380 implements their removal.

## Coverage ledger

Stage 370: requirement traceability and the report's design adversarial pass.
Future obligations: 380 authority/accounting; 390 package/compiler; 400 durable
generation/provider contexts; 410 scenario; 420 scoped visual preview; 430 revision;
440 startup/replay/restore; 450 integration and human acceptance. None are passed
by a documentation checkpoint or an unchanged Ravenford regression run.

## Adversarial pass

See the report for attacks and the example inconsistencies corrected. No new
runtime path exists to attack in this revision. The artifact does not purport to
close the later HTTP, image, AI, concurrency or player-knowledge obligations.

## Required owner output and hard stop

Disposition of this detailed contract and proposed ADR: accept, amend, or reject.
The specific proposed decisions are in design §13 and prerequisites Q12–Q18.
After recording the checkpoint, **STOP** under `AGENTS.md` and `AGENT_WORKFLOW.md`.
Stage 380 starts after this disposition; the overall Stage 370–450 goal remains open.
