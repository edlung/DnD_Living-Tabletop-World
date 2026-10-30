# Stage 370 — Campaign contract checkpoint

- Date: 2026-10-30.
- Status: **CHECKPOINT_READY / AWAITING_OWNER_DISPOSITION.**
- Branch: `codex/stage-370-campaign-contract`.
- Base commit: `4b57f2c2b3db1102147947ab28d7fb1d4e38c476`.
- Session: the selected Codex model; no delegated implementation/reviewer roles.
- Scope: `work-orders/STAGE_370.md` only.
- Detailed design/ADR approval: pending the owner's disposition; not self-approved.

## Result and limits

Prepared the detailed contract for the owner's authorized AI campaign-generation
program, including scenario/visual preview, selective regeneration and confirmed
startup. The owner explicitly removed monetary AI limits. That requirement is
recorded for implementation at Stage 380; runtime admission is unchanged here.

This checkpoint introduces repository documentation only. It does not implement
workshop credentials, draft APIs, AI preparation, previews or campaign activation.
Stages 380–450 remain unimplemented by this change. Existing human acceptance and
no-v0.1-tag requirements remain. No production dependency, credential, provider,
deployment, release or external communication was changed.

## Changed files

| File                                            | Purpose                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `work-orders/STAGE_370.md`                      | Current authorized design scope, deliverables, verification and hard stop      |
| `docs/STAGE_370_DESIGN.md`                      | Complete product/architecture contract and implementation checkpoints          |
| `docs/adr/0038-ai-campaign-workshop.md`         | Proposed protected architecture deltas and unlimited monetary requirement      |
| `docs/design/campaign-generation/AGENTS.md`     | Context/secret handling for design specimens                                   |
| `docs/design/campaign-generation/EXAMPLE.md`    | Russian non-Ravenford scenario/visual preview acceptance specimen              |
| `EXECUTION_PLAN.md`                             | Stage 370–450 sequence, results and checkpoints                                |
| `docs/PROJECT_WORKFLOW.md`                      | Current owner request, monetary-policy precedence and checkpoint status        |
| `docs/IMPLEMENTATION_PREREQUISITES.md`          | Q12–Q18 detailed decisions awaiting disposition                                |
| `docs/GATE_COVERAGE.md`                         | Future-surface tests assigned to introduction stages and integrated acceptance |
| `docs/AI_CONTEXT_MAP.md`, `docs/adr/README.md`  | New design entry points                                                        |
| This report and `handoffs/STAGE_370_REQUEST.md` | Verification, adversarial findings and owner checkpoint                        |

## Owner requirement traceability

| Requirement                                    | Contract / specimen                                                  | Runtime evidence due                  |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| AI generates an independent campaign           | Design §§1–6; non-Ravenford specimen and separate bootstrap          | 390 package, 400 generation, 440 play |
| Scenario preview                               | §7; cast, truth, clues and future developments in specimen           | 410                                   |
| Visual preview                                 | §8; owner/character scene and hidden-object expectations in specimen | 420                                   |
| Revise selected parts while preserving choices | §9; locked Nera portrait/knowledge example                           | 430                                   |
| Owner confirms before live mutation            | §10; review of content and selected-image digests                    | 440                                   |
| Unlimited text/image monetary budget           | §6; owner's exact instruction in ADR/work order                      | 380 admission/accounting              |
| Full implementation program                    | §11, execution plan and coverage ledger                              | 380–450; future, not passed           |

## Design adversarial pass

These are design attacks/manual checks, not evidence of implemented runtime
defenses. Each future test is assigned in `docs/GATE_COVERAGE.md`.

| Attack / failure case                                                    | Design result                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Use a player/DM campaign cookie to enumerate workshop drafts             | Separate workshop grant and owner-qualified access; route/byte/stream tests due at 380                                            |
| Download the full owner package, then hide secrets in player preview     | Explicitly rejected; scoped server projections and forbidden-byte/DOM/preload tests due at 420                                    |
| Read hidden-tower art while its scene object is absent                   | Authorize exact bytes and metadata by perspective; absence test assigned at 420                                                   |
| Let generated future consequences enter Chronicle or quest progress      | Scenario plans stay noncanonical; progress derives only from actual effective party history                                       |
| Reuse a 12-command authoring proposal to initialize a whole world        | Dedicated confirmed bootstrap; existing in-play allowlist stays narrow                                                            |
| Restart after remote dispatch but before storing its answer              | Persist uncertain dispatch and cost; no exactly-once provider claim; worker/attempt tests at 400                                  |
| A late generation worker overwrites the owner's manual edits             | Revision compare-and-swap, lease fencing and candidate attachment; race coverage at 400/430                                       |
| Retry activation and obtain two campaigns or different pictures          | Stable target ID, idempotent activation, closed provisioning, selected-byte adoption; crash tests at 440                          |
| Activate stale text with newly selected images                           | Confirmation binds both revision/compiled plan and visual-manifest digest                                                         |
| Remove monetary caps and lose usage evidence                             | Explicit unlimited policy preserves accounting, historical finite records and unknown charges                                     |
| Generate a quest that accidentally uses another campaign's content       | Campaign-owned immutable definitions and cross-campaign tests at 390/440                                                          |
| Require a new spell invented by AI                                       | Catalog/rules validation blocks unsupported mechanics; narrative quality remains a separate assessment                            |
| Place a clue in an undefined example location or leave a hook unresolved | **Found and fixed:** the archive is explicit in the starting-world table; the requested journal has a defined discovery location  |
| Claim a prose specimen proves a playable campaign                        | Specimen explicitly marked ungenerated/non-executable; concrete validation and live/owner evidence deferred to introducing stages |

## Invariant assessment

| Invariants | Design obligation                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1–3, 16–18 | AI proposes; owner confirms exact package; only validated World Engine bootstrap appends canonical events with provenance |
| 4–7        | Truth, typed accounts and future plans separate; preview/NPC projections scoped                                           |
| 8–10       | Existing rules, legal action sets and reaction events retained; no generated mechanic becomes executable                  |
| 11–13      | Stable IDs, auditable initial batch, versioned content and replay/backup coverage                                         |
| 14         | Selected visual lineage/bytes separate from gameplay facts                                                                |
| 15         | Definitions are content; quest progress remains derived from played history                                               |
| 19–20      | Full owner content reachable; no forced path or fabricated player choice                                                  |
| 21–23      | Existing capability ports, server-side provider calls and modular monolith                                                |

No invariant was changed. Adoption of the newly proposed detailed choices awaits
owner disposition of ADR 0038 and the design.

## Validation

`pnpm validate` passed through `/private/tmp/ltw-stage370-validate.mjs`, which
uses the existing throwaway-database helper, injects local provider routes and
placeholder image generation, blanks provider-key overrides and drops its own
temporary database in `finally`. The existing development database is not seeded.
The first sandboxed connection was denied (`EPERM`); the authorized local check
was then run with the required sandbox permission. This is an execution
permission issue, not an approval rejection or a product defect.

The process exited 0 and confirmed deletion of its throwaway database. Exact
transcript: `reports/evidence/stage-370/validation.txt`; reproducible runner:
`reports/evidence/stage-370/validation-runner.txt`.

| Command/check                           | Result                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm validate`                         | PASS, exit 0                                                                |
| `pnpm format:check`                     | PASS inside validation; rechecked after final documentation edits           |
| `pnpm lint`                             | PASS                                                                        |
| `pnpm typecheck`                        | PASS                                                                        |
| `pnpm context-budget`                   | PASS: 1,101 active files; none above target or hard limit                   |
| `pnpm test`                             | PASS: 301 files, 2,985 tests                                                |
| `pnpm build`                            | PASS; existing Vite warning for a minified chunk above 500 kB               |
| `pnpm db:migrate`                       | PASS on the isolated database                                               |
| `pnpm seed:ravenford`                   | PASS: 91 accepted submissions, 51 curated picture imports                   |
| `pnpm test:integration`                 | PASS: 42 files, 237 tests                                                   |
| `pnpm test:e2e`                         | PASS: 132 Chromium journeys, 5.7 minutes                                    |
| Documentation reference/stage-row check | PASS: referenced Markdown files exist; all nine stages have acceptance rows |
| `git diff --check`                      | PASS                                                                        |

No new executable behavior was added, so no implementation-mirroring tests were
introduced for this documentation change. The required complete existing suite
ran offline. Live AI generation, generated art, deployment validation and Stage
380–450 runtime tests were not run and are not represented as passed.

Artifact identity: `reports/evidence/stage-370/package.sha256` records all changed
checkpoint documentation/evidence except itself and the handoff, which identifies
the manifest. Verify with `shasum -a 256 -c` from the repository root. The working
copy was clean before this work; the package contains no pre-existing user changes.

## Residual work

Owner disposition of detailed design choices; all implementation and verification
for Stages 380–450; generated image and scenario quality; full human play acceptance.
There is no claim that the overall program is complete.
