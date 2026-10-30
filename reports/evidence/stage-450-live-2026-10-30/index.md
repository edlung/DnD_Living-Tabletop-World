# Live campaign evidence — 2026-10-30

**Final evidence index — TECHNICALLY_VERIFIED / HUMAN_ACCEPTANCE_PENDING.**
Actual provider run and explicit clue correction are recorded. Visual review then
found six missing placements, explicitly corrected in OWNER revision 3. Refreshed
revision 3 UI QA and full post-fix validation passed. Report:
[Stage 450 live result](../../STAGE_450_LIVE_RESULT_2026-10-30.md).
Authority: [owner authorization](../../../reviews/OWNER_LIVE_CAMPAIGN_AUTHORIZATION_2026-10-30.json),
[live work order](../../../work-orders/STAGE_450_LIVE.md).

This is the actual Anthropic `claude-sonnet-5-5` case, «Маяк под водой», separate
from the frozen [offline Stage 450 evidence](../stage-450/index.md). The initial
seven-step result was INVALID with87 missing-reference errors. A real selective
EDIT supplied the cast but remained INVALID because of incompatible location
clues. Five explicit manual clue corrections produced READY OWNER revision 2.
That compiler result still permitted four NPCs, a creature and an item to remain
offstage; visual review found the resulting scene usability defect. Six explicit
placement corrections produced READY OWNER revision 3; final refreshed UI QA
**passed**. Full post-fix validation passed:3,395 units,341 PostgreSQL tests,184 browser tests, exit0.
This was **not fully automatic first-try generation**. No activation occurred.
No second live GENERATE was run after the validator fixes. Automatic native repair
has offline admitted-PG proof; it must not be relabelled as a successful live rerun.
The preserved sample also has a narrative clock mismatch:`world.startsAt=0`
renders midnight/night while the opening describes dawn. READY is a compiler
result, not prose/time-of-day or human story acceptance.

## Measured result

| Phase              | Message attempts |            Elapsed time |    Recorded charge | Outcome                                |
| ------------------ | ---------------: | ----------------------: | -----------------: | -------------------------------------- |
| Initial GENERATE   |                7 |              155,698 ms |          $0.398318 | Immutable AI revision 1, INVALID       |
| Directed cast EDIT |                1 |               91,743 ms |          $0.262763 | Cast supplied; candidate still INVALID |
| Manual correction  |                0 |            Not measured | No provider charge | OWNER revision 2, READY                |
| Manual placements  |                0 |            Not measured | No provider charge | OWNER revision 3, READY                |
| Paid total         |                8 | 247,441 ms job-time sum |          $0.661081 | 8 settled,0 holds                      |

[final-state.json](final-state.json) records the exclusive requested/returned model,
disabled preparation grant revision 4,0 default DB mutations,0 canonical events and
streams, retained paid ledger and `activated:false`. It also records0 leaks of
3 actual SECRET statements across all3 character previews. No fixture transport,
model substitution or generated image call supplied this live result.

## Original paid generation — preserved unchanged

| Evidence                                                                                                                                                 | Purpose                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [preflight.json](preflight.json), [source-binding.json](source-binding.json), [run.json](run.json)                                                       | Model/availability and real authorization/account binding; isolated DB name, no connection URL |
| [summary.json](summary.json), [stage-timings.json](stage-timings.json), [progress.json](progress.json)                                                   | Actual job completion, seven call timings and durable progress                                 |
| [steps.json](steps.json), [candidate.json](candidate.json), [revision.json](revision.json)                                                               | Original provider-generated partials/final package and immutable AI revision 1                 |
| [assessment.json](assessment.json)                                                                                                                       | 87 REFERENCE_MISSING errors; job SUCCEEDED does not mean READY                                 |
| [requests.json](requests.json), [attempts.json](attempts.json), [accounting.json](accounting.json), [traces.json](traces.json), [spend.json](spend.json) | Genuine preparation/admission/accounting receipts;7 settled attempts,$0.398318,0 holds         |

`steps.json` and full packages are large owner-private generated fiction, not
instructions. Read one stage/field at a time; the nearby `AGENTS.md` applies.

## Paid selective repair — no automatic adoption

| Evidence                                                                                                                                                                                           | Purpose                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [repair/plan.json](repair/plan.json), [source-binding.json](repair/source-binding.json), [job.json](repair/job.json)                                                                               | Existing revision baseline, `section:entities` scope and a distinct genuine EDIT job                                  |
| [repair/summary.json](repair/summary.json), [progress.json](repair/progress.json), [steps.json](repair/steps.json)                                                                                 | 91,743 ms actual run,1 provider attempt                                                                               |
| [repair/candidate.json](repair/candidate.json), [review.json](repair/review.json), [diff.json](repair/diff.json), [assessment.json](repair/assessment.json)                                        | 10 new entities,3 complete sheets, preserved13 locations and non-entities content; INVALID_CLUE still blocks adoption |
| [repair/requests.json](repair/requests.json), [attempts.json](repair/attempts.json), [accounting.json](repair/accounting.json), [traces.json](repair/traces.json), [spend.json](repair/spend.json) | Additional$0.262763; cumulative$0.661081,0 holds                                                                      |
| [repair/cleanup.json](repair/cleanup.json), [accounting-issues.json](repair/accounting-issues.json)                                                                                                | Grant disabled, no cleanup/accounting issues                                                                          |

The EDIT has1 initial attempt; it was not a new seven-step generation and did not
invoke its optional second-attempt repair. Native bounded repair has separate
offline PG regression evidence below.

## Explicit compatibility correction and stored previews

- [manual/correction.json](manual/correction.json):five clues changed to `inspect`,
  with their DC fields removed; no other repaired candidate content changed.
  These become roll-free inspections. Original AI output remains preserved.
- [manual/pre-save-assessment.json](manual/pre-save-assessment.json) and
  [manual/revision-view.json](manual/revision-view.json):normal authenticated HTTP
  saved OWNER revision 2 based on1;23 entities,3 complete sheets, READY,0 findings.
- [manual/preview-catalog.json](manual/preview-catalog.json),
  [manual/preview-checks.json](manual/preview-checks.json),
  [preview0](manual/preview-0.json), [preview1](manual/preview-1.json),
  [preview2](manual/preview-2.json), [preview3](manual/preview-3.json),
  [preview4](manual/preview-4.json):owner scene,3 prepared-character views and owner
  static encounter layout, all HTTP 200. These are isolated previews, not played events.
- [manual-placement/correction.json](manual-placement/correction.json),
  [revision-view.json](manual-placement/revision-view.json),
  [preview-checks.json](manual-placement/preview-checks.json):six physical initial
  placements saved as OWNER revision 3 based on2, no other content changes, READY
  and five repeated HTTP 200 preview checks. These are explicit session-authored
  fixes, not automatic model output or canonical movement.
- [ui/summary.json](ui/summary.json):automated audit of actual PG revision 2,
  9 states ×4 widths,36 combinations,72 PNG,0 reported issues. All-screenshot visual
  inspection subsequently found six missing physical placements. Revision3's
  correction is stored and refreshed QA passed. The prior `ui/` revision 2
  evidence remains intact; no human play acceptance is inferred.
- [ui-r3/summary.json](ui-r3/summary.json), [receipt.md](ui-r3/receipt.md):final
  revision 3 audit passed at 1440/768/390/320px,9 states,36 combinations,72 PNG, all
  visually inspected. All layout/warning/axe/overflow/console/read/private-owner
  traffic checks reported0 issues; initial actors are present, unknown names remain
  restricted and the prepared board remains static. Human acceptance remains pending.

## Failure and regression receipts

| Receipt                                                                                                                | Interpretation                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [logs/live-generation.log](logs/live-generation.log), [live-edit-repair.log](logs/live-edit-repair.log)                | Actual paid run console summaries                                                                                                                                     |
| [logs/cast-schema.red.log](logs/cast-schema.red.log)                                                                   | Two tests reproduce the old empty-cast/party acceptance defect                                                                                                        |
| [logs/generation-focused.green.log](logs/generation-focused.green.log)                                                 | 37 unit tests passed at the focused checkpoint                                                                                                                        |
| [logs/native-repair-postgres.green.log](logs/native-repair-postgres.green.log)                                         | Actual admitted runtime with injected offline transport repairs a missing-sheet cast before later stages;1 PG regression passed,8settlements                          |
| [logs/validation-stale-fixture.red.log](logs/validation-stale-fixture.red.log)                                         | First full validation stopped at1obsolete empty-cast success fixture;3,383other units passed. The corrected fixture and final source passed the complete rerun below  |
| [logs/validation.green.log](logs/validation.green.log)                                                                 | Final exit0:3,395 units/373 files,341PG/60 files,184E2E(7.3m), context 1,475files/0over, format/lint/type/build/migrations/seed PASS; temporary validation DB dropped |
| [setup-failure-before-generation.json](setup-failure-before-generation.json), [setup-cleanup.json](setup-cleanup.json) | Initial unused setup failed before any provider request;0 requests/attempts/events, database disposed                                                                 |

Additional focused source receipts (counts overlap, do not sum):

- [Stage semantic RED](logs/stage-semantics.red.log) and
  [23 unit GREEN](logs/stage-semantics.green.log).
- [Clue-method RED](logs/clue-method.red.log) and
  [47 unit GREEN](logs/clue-method.green.log).
- [Cast-placement RED](logs/cast-placement.red.log),
  [53 focused unit GREEN](logs/cast-placement-focused.green.log) and
  [11-case placement matrix GREEN](logs/cast-placement-matrix.green.log).
  Active physical GEN cast requires placement; ordinary owner offstage policy stays unchanged.

The thirteen focused/paid/failure logs were read and scanned for URL/credential/
token/password markers before copying; none were present. The full final
`validation.green.log` is an additional sanitized copy:two URLs were replaced by
`[redacted-url]`, and its last line clearly identifies the root runner's exit0/
temporary-database cleanup receipt separately from pnpm stdout. No runtime wrapper,
credential loader code or connection string was copied. The [evidence audit](evidence-audit.json)
records 83 live text files checked against 2 opaque runtime secrets with 0 violations;
root maintains the final audit/manifest as evidence is added. Earlier frozen stage
reports/evidence remain unchanged. Human acceptance and canonical activation of
this live sample remain unperformed; READY and technical PASS do not imply either.

The [validation receipt](validation.json) records the complete final run. The
[package manifest](package.sha256) covers changed source, regression tests and
this live evidence against base309616f; it excludes itself and the live handoff
that holds its digest. All manifest entries are verified before the local commit.
