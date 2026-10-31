# Checkpoint Handoff — Stage 380

- Gate: Stage 380, workshop access and unlimited monetary policy.
- Type: INITIAL.
- Completed scope: Stage 380 implementation and offline verification; owner acceptance pending.
- Revision: base `166bd47378040fa80cc0b5343713ef623802f5ca`, branch `codex/stage-380-workshop-access`.
- Prior report/remediation: N/A; a synchronous-history privacy issue was found and
  fixed before this first formal handoff.
- Report: `reports/STAGE_380_COMPLETION.md`.
- Session model: selected Codex model; narrow implementation helpers inherited it,
  with no separate reviewer/approval role.
- Approved design: Stage 370 SHA256
  `4b2c6157accc3d24ec9d1e5674930ec4691b59524c0b3e504b3e92759170d769`,
  accepted by `reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`; implementation
  details `docs/STAGE_380_DESIGN.md`.
- Dirty-file hashes/package identity: `reports/evidence/stage-380/package.sha256`.
- Manifest SHA256: `333adc720d875d4eb80e654652a261624603f37a121f2725c57bbf318daaf572` (86 entries).
- Status: **AWAITING_OWNER_DISPOSITION**.

## Objective

An independently authorized workshop owner can sign in and manage private draft
containers without an existing campaign. Game and workshop credentials never
grant each other's authority. Explicit stored unlimited monetary policy removes
text/image monetary ceilings while preserving accounting and nonmonetary controls.

## Authoritative documents

`ARCHITECTURE_INVARIANTS.md`, `AGENT_WORKFLOW.md`, the owner disposition,
`work-orders/STAGE_380.md`, accepted Stage 370 contract/ADR 0038, Stage 380 design,
the report and relevant auth/accounting/images/workshop AGENTS.

## Surfaces to attack

- API: `/workshop/auth/redeem`, `/workshop/auth/session`, `/workshop/auth/sign-out`,
  `/workshop/drafts` (GET/POST), `/workshop/drafts/:draftId` (GET), behind `/api`.
- CLI: `workshop:operator invite/revoke`, `ai:operator monetary-policy-set/status`.
- UI: `/workshop/join`, `/workshop`, replacement/sign-out prompts, private paged shelf,
  stale tabs, history restoration and lost-create-response retry.
- Persistence: migrations 0014/0015, owner-qualified queries, one-way credential/audit
  writes, owner locks and policy-revision references on charges.
- Accounting: all old monetary buckets, finite-mode compatibility, known/unknown
  charges, historic overruns and genuinely inconsistent billing/model stops.
- Logs/bytes: no credential, hash or cookie exposed through logs, URLs or metadata.

## Start / reproduce

From the repository root with local PostgreSQL running:

```sh
cp reports/evidence/stage-380/validation-runner.txt /private/tmp/ltw-stage380-validate.mjs
node --conditions=@ltw/source /private/tmp/ltw-stage380-validate.mjs
shasum -a 256 -c reports/evidence/stage-380/package.sha256
pnpm format:check
git diff --check
```

The runner invokes `pnpm validate` in an isolated database with local providers,
blank key overrides and placeholder images; it drops its own database afterward.
It uses this checkout's absolute path. Workshop browser journeys use isolated test
owners and a dedicated campaign alongside the real HTTP app. Fixture grants/revoke
triggers exist only in test composition, never in the production application.

## Test personas / scopes

Workshop owner A/B, absent/expired/revoked workshop credentials, a real campaign DM,
player/campaign-only cookies, and the existing Russian/English regression personas.
No production invitation, cookie or provider key is included. Images and displayed
contents in the layout evidence are authorized fixture content only.

## Canonical secret or invariant under test

Private draft titles/metadata of owner A must not reach B, a campaign principal or
an old tab after identity changes. An old tab's input must not be saved under a
new owner's cookie. A workshop credential cannot mutate or inspect a game. The
new money policy cannot suppress genuine model/billing/identity restrictions or
erase costs/history. Workshop metadata changes create no World Engine events.

## Validation run

| Check                                                            | Result                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Final full `pnpm validate`                                       | PASS, exit 0 after the synchronous-pagehide fix; temporary DB dropped |
| Unit tests                                                       | PASS: 3,016 in 306 files                                              |
| Integration tests                                                | PASS: 254 in 44 files                                                 |
| Chromium journeys                                                | PASS: 144, including 12 new workshop journeys                         |
| Layout audit and visual inspection                               | PASS: invitation/shelf/sign-out at 1440/768/390/320 px                |
| Formatting, lint, types, context budget, build, migrations, seed | PASS                                                                  |
| Final artifact/documentation checks                              | PASS                                                                  |

The report and `validation.txt` record exact results. The isolated private-history
red/pass evidence is included; the strengthened regression also passed in the
final complete suite. Human usability/acceptance is not claimed by these checks.

## Known limitations

No generated package, scenario/visual preview, selective revision or campaign
activation yet (Stages 390–450). There is no workshop progress stream; Stage 400
must recheck durable auth on every cycle when introducing one. No live AI call,
new real credential, deployment or release occurred. Existing installations need
the migration chain and explicit text/image policy commands; this checkpoint does
not claim the default local database or a deployed installation was migrated.

## Coverage ledger

Stage 380 currently introduced access, containers, cookie/UI lifecycle, operator
policy and accounting. Evidence is in the report and their focused/full tests.
Earlier boundary regressions are in the full suite. Stage 400 progress-stream
revocation and preparation admission, 390 package/compiler, 410 scenario, 420 visual
knowledge/image boundaries, 430 revisions, 440 bootstrap and 450 human acceptance
remain future; none are passed by these checks.

## Adversarial pass

See the report's concrete probes and the pagehide red/pass evidence. Read the
API/storage/UI source as needed; the handoff does not replace an adversarial pass.
Human usability acceptance is the owner's disposition and is not simulated here.

## Required output and hard stop

Owner disposition of the Stage 380 checkpoint: accept, amend or reject. The overall
Stage 370–450 implementation authorization remains recorded. At this formal
checkpoint STOP under `AGENTS.md`/`AGENT_WORKFLOW.md`; Stage 390 follows disposition.
