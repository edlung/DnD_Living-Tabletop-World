# Stage 450 live result — «Маяк под водой»

Date: 2026-10-30. Base:`309616f`.
Status: **TECHNICALLY_VERIFIED / HUMAN_ACCEPTANCE_PENDING**.
Authority: [owner authorization](../reviews/OWNER_LIVE_CAMPAIGN_AUTHORIZATION_2026-10-30.json),
[live work order](../work-orders/STAGE_450_LIVE.md).

The same live-generated Russian campaign is now stored as READY OWNER revision 3
with 23 entities, three complete prepared character sheets and explicit initial
placements. Refreshed UI QA and the complete post-fix isolated validation passed.
**It did not succeed automatically on the first attempt.** The original seven-step
GEN output was INVALID. A paid directed EDIT supplied its missing cast; five explicit
manual clue compatibility corrections were still necessary for OWNER revision 2.
Visual review then exposed six missing initial placements, fixed in OWNER revision 3.
No canonical campaign was activated.

This is supplemental evidence after the frozen offline Stage 450 checkpoint.
[The original report](STAGE_450_COMPLETION.md), its manifest and its fixture/live
distinctions remain unchanged. Full evidence: [live index](evidence/stage-450-live-2026-10-30/index.md).

## Actual provider, accounting and timings

The owner authorized Anthropic `claude-sonnet-5-5` after the model clarification.
The real credential was consumed through the ordinary runtime loader; no fixture
response, test catalog, raw Messages bypass or substitute model was used. The
isolated database used copied real account/approval metadata, a separately recorded
owner preparation grant, explicit UNLIMITED policy, durable admission and normal
request/attempt/settlement journals. Default database mutations: 0.

| Operation           | Actual message attempts |                    Elapsed time | Recorded charge |
| ------------------- | ----------------------: | ------------------------------: | --------------: |
| Seven-step GENERATE |                       7 |                      155,698 ms |       $0.398318 |
| Directed cast EDIT  |                       1 |                       91,743 ms |       $0.262763 |
| Total               |                       8 | 247,441 ms, sum of the two jobs |       $0.661081 |

These are the recorded real usage charges and job timings; total time excludes
preflight, manual correction and QA. All 8 attempts settled, open holds are 0, and
both configured and returned model IDs are exclusively `claude-sonnet-5-5`.
The latest owner preparation grant is disabled, revision 4. The isolated paid ledger
is retained. Evidence:[final state](evidence/stage-450-live-2026-10-30/final-state.json),
[GEN accounting](evidence/stage-450-live-2026-10-30/accounting.json),
[EDIT accounting](evidence/stage-450-live-2026-10-30/repair/accounting.json),
[cumulative spend](evidence/stage-450-live-2026-10-30/repair/spend.json),
[per-stage timings](evidence/stage-450-live-2026-10-30/stage-timings.json).

The paid EDIT was a separate selective repair job for the same campaign. Its
single provider attempt has kind `initial`; the live run did not itself exercise
the runtime's second-attempt native repair. That behavior has separate offline
admitted-PG regression evidence below.

## What failed, and what changed

1. **Original GEN:INVALID.** The cast stage returned an empty nonlocation entity
   collection while naming three prepared party keys. The assembled revision 1
   contained only13 locations; later knowledge, clues, relationships, encounters,
   quests and situations referenced absent cast. The final compiler recorded87
   `REFERENCE_MISSING` errors. `SUCCEEDED` described durable job completion, not
   campaign readiness. Activation remained blocked. Original output and findings
   are retained:[steps](evidence/stage-450-live-2026-10-30/steps.json),
   [revision 1](evidence/stage-450-live-2026-10-30/revision.json),
   [assessment](evidence/stage-450-live-2026-10-30/assessment.json).
2. **Real directed EDIT:cast repaired, full candidate still INVALID.** An ordinary
   EDIT targeted `section:entities`, preserving the existing13 locations/order and
   every other section. It added10 nonlocation entities and three complete party
   sheets. Its recorded diff has10ADDED entries plus the collection order change,
   with no field changes outside entities. The full compiler then reported
   `INVALID_CLUE`:a perception clue was attached to a location. This was the first
   command-level rejection; five location clues required the same compatibility
   correction. No automatic adoption occurred. Evidence:[candidate](evidence/stage-450-live-2026-10-30/repair/candidate.json),
   [full review](evidence/stage-450-live-2026-10-30/repair/review.json),
   [diff](evidence/stage-450-live-2026-10-30/repair/diff.json),
   [assessment](evidence/stage-450-live-2026-10-30/repair/assessment.json).
3. **Explicit manual correction:OWNER revision 2 is READY.** After inspecting the
   repaired candidate, the session changed five location clues from perception or
   investigation to `inspect` and removed their DC fields. This changes those clues
   to roll-free inspection; it is a mechanical compatibility decision, not a claim
   that the model originally generated legal clues. The corrected candidate was
   saved through normal authenticated revision HTTP as OWNER revision 2 based on1.
   No other candidate content changed. Both AI outputs and revision 1 remain intact.
   Evidence:[exact correction](evidence/stage-450-live-2026-10-30/manual/correction.json),
   [stored revision 2 and assessment](evidence/stage-450-live-2026-10-30/manual/revision-view.json).
4. **Visual review found a usability defect after compiler READY.** Four active
   NPCs, one creature and one item in the repaired cast had no initial placement.
   The global owner-package compiler permits intentionally offstage entities, so
   READY did not establish useful initial scene occupancy. Six explicit OWNER
   placement corrections consistent with the existing fiction were saved as
   revision 3 based on2, without another model call or other revision 2 content changes.
   Evidence:[placement correction](evidence/stage-450-live-2026-10-30/manual-placement/correction.json),
   [stored revision 3](evidence/stage-450-live-2026-10-30/manual-placement/revision-view.json),
   [refreshed HTTP previews](evidence/stage-450-live-2026-10-30/manual-placement/preview-checks.json).
   Final refreshed visual QA **passed** on revision 3. The GENERATE cast validator now
   requires placement for active physical nonfaction entities;
   ordinary owner editing retains its intentional offstage capability.

The five corrected clues are `clue-boat-tracks`, `clue-tower-notes`,
`clue-lamp-hall-empty-socket`, `clue-savva-ledger` and `clue-post-veh-markers`.
Their saved method is `inspect`; `dc` is absent, not stored as null. The correction
receipt uses null as its removed-value marker. Revision2 compiler findings: 0;
the later placement finding demonstrates the limits of that readiness check.

The final stored revision 3 package contains13 locations,10 other entities, three prepared
party seats,14 knowledge records,9 clues,5 conflicts,8 situations,1 encounter,1 quest,
11 visual briefs,8 first-session notes and12 later-outline entries. The visual briefs
are descriptions, not generated image files. This live continuation made no image
provider call and did not start combat or create played outcomes.

The six explicit placements are Мирела Тихонова and Гордей at Главный причал,
Фаина at Пост смотрительницы вех, Савва at Лавка Саввы, Хранитель маяка at Ламповый
зал маяка, and Узкая лодка без огней at Водный путь к свету. Each initial `since`
is null. These are OWNER authoring changes by the session under delegated technical
authority, not a claim of automatic model success or human play acceptance.

## Pipeline remediation and recorded regressions

The old cast schema permitted empty collections; inspection found no malformed
definition/reference artifact forcing that result. Static output constraints now
require nonempty cast/party collections. The cast prompt makes the server's
retention of existing locations explicit, so locations must not be repeated in
the nonlocation output.

The production worker now supplies stage-owned semantic validation to the existing
admitted runtime. It checks resolved references, prepared party/sheets and other
supported stage constraints before accepting each result. Location/clue-method
compatibility is also checked at the knowledge boundary. Failed validation can
use the same provider's ordinary bounded repair; it cannot silently advance a
broken cast into later steps or invoke another paid provider.

**No second live GENERATE was run after these fixes.** The original paid output
remains the original low-quality result. Automatic repair improvements were
verified with injected offline transport; the actual live case reached READY only
after the recorded EDIT and explicit manual clue/placement corrections.

Recorded focused evidence:

- [Original RED](evidence/stage-450-live-2026-10-30/logs/cast-schema.red.log):two new
  tests demonstrate that the previous cast contract accepted empty entities/party.
- [Focused GREEN](evidence/stage-450-live-2026-10-30/logs/generation-focused.green.log):37 unit
  tests passed at that focused checkpoint. This receipt is not a substitute for
  the final all-changes validation below.
- [Native repair PG GREEN](evidence/stage-450-live-2026-10-30/logs/native-repair-postgres.green.log):the
  genuine admitted runtime, with injected offline transport, rejects a schema-valid
  cast missing sheets, sends actionable `SHEET_INCOMPLETE` repair feedback, completes
  all seven stages READY and settles8 attempts including1 repair. This is a regression
  test, not another live generation or real cost receipt.
- Additional preserved source checks:[stage semantic RED](evidence/stage-450-live-2026-10-30/logs/stage-semantics.red.log)
  and [23 unit GREEN](evidence/stage-450-live-2026-10-30/logs/stage-semantics.green.log),
  [clue-method RED](evidence/stage-450-live-2026-10-30/logs/clue-method.red.log) and
  [47 unit GREEN](evidence/stage-450-live-2026-10-30/logs/clue-method.green.log),
  [cast-placement RED](evidence/stage-450-live-2026-10-30/logs/cast-placement.red.log),
  [53 focused unit GREEN](evidence/stage-450-live-2026-10-30/logs/cast-placement-focused.green.log)
  and [11-case placement matrix GREEN](evidence/stage-450-live-2026-10-30/logs/cast-placement-matrix.green.log).
  These focused counts overlap and are not added to form a full-suite total. The
  placement rule is generation-specific; intentionally offstage entities remain
  supported in ordinary owner packages.

A separate isolated setup failed before generation because the runner interpreted
the workshop redemption's string result as an object. That unused database had
0 requests,0 attempts and0 events and was disposed. The paid run used a new isolated
database. The [failure](evidence/stage-450-live-2026-10-30/setup-failure-before-generation.json)
and [cleanup](evidence/stage-450-live-2026-10-30/setup-cleanup.json) remain recorded.

## Preview, secrecy and verification status

All five recorded HTTP checks returned200:owner initial scene, each of three
prepared-character previews, and owner prepared-encounter layout. A nonvacuous
check compared3 actual SECRET statements, selected by `knowledgeType`, against all
three character previews:0 leaks. No owner assessment or prepared-encounter fields
were present in those restricted responses. Evidence:[HTTP checks](evidence/stage-450-live-2026-10-30/manual/preview-checks.json),
[final secrecy result](evidence/stage-450-live-2026-10-30/final-state.json).
The same five HTTP checks were repeated successfully for revision 3 after placing
the cast; [revision 3 checks](evidence/stage-450-live-2026-10-30/manual-placement/preview-checks.json)
remain separate from the preserved revision 2 receipts.

Final [revision 3 UI QA](evidence/stage-450-live-2026-10-30/ui-r3/receipt.md) covers nine
states at 1440/768/390/320px,36 state-width combinations and72 PNGs, all visually
inspected by the session. All recorded layout, axe, overflow, console/read and
private-owner-request checks passed. The initial scene now includes Мирела and
Гордей; OWNER sees both names, while CHARACTER correctly sees the unknown Гордей
as «Незнакомец». The guardian appears at the lamp-hall camera. Prepared combat
remains a static layout, and neutral art is shown honestly without generated images.
This agent visual pass does not replace human owner acceptance.

One concrete narrative limit remains:the stored `world.startsAt=0` renders day1
00:00/night, while the opening and situation «Рассвет на причале» describe dawn
and returning boats. Compiler READY does not certify prose/time-of-day consistency.
The sample is preserved with this mismatch; the owner can polish the scene clock
through ordinary authoring. No further live call or unbounded narrative rewrite
is being made to hide it. A single Russian campaign also does not establish a
general first-try success rate or model-quality/latency benchmark.

| Check                                                                | Status at this draft | Evidence / remaining work                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live model identity, usage, accounting and final READY draft         | RECORDED             | Real JSON receipts above                                                                                                                                                                                                                                                                                          |
| Automated UI QA on actual stored revision 2                          | PASS                 | 9 states ×4 widths,36 combinations,72 PNG;0 layout errors/warnings, axe violations, overflow, console errors, failed/blocked reads or private owner requests in character mode. [Summary](evidence/stage-450-live-2026-10-30/ui/summary.json)                                                                     |
| Final automated UI QA and agent visual inspection on revision 3      | PASS                 | Nine states at 1440/768/390/320,36 combinations,72 PNG, all visually inspected;0 layout errors/warnings, axe violations, overflow, console/read/request/privacy issues. [Summary](evidence/stage-450-live-2026-10-30/ui-r3/summary.json), [receipt](evidence/stage-450-live-2026-10-30/ui-r3/receipt.md)          |
| Full post-remediation isolated validation                            | PASS, exit0          | 3,395 unit tests /373 files;341 PostgreSQL tests /60 files;184 browser tests (7.3m). Format/lint/type/build/migrations/seed passed; context 1,475 active files, 0 over target/hard limit. Temporary validation DB dropped. [Full sanitized receipt](evidence/stage-450-live-2026-10-30/logs/validation.green.log) |
| Canonical activation / ordinary play of this live-generated campaign | NOT_RUN              | No separate runtime confirmation;0 canonical streams/events, `activated:false`                                                                                                                                                                                                                                    |
| Human owner play acceptance                                          | PENDING              | Not inferred from compiler, preview or screenshots                                                                                                                                                                                                                                                                |

The build retains the existing game-entry chunk warning above 500 kB; no warning threshold was suppressed. UI audit warnings above refer to the measured preview states, not that build warning.

The first full-run failure was a stale test fixture exposed by the tightened schema;
its RED receipt remains evidence. The obsolete success fixture was replaced with
a valid character/party. A subsequent pre-placement-source run was interrupted
and its temporary database dropped; the final frozen-source rerun then completed
with exit0 and the totals above. Earlier offline stage totals and existing specimen
gameplay evidence remain separate from this live case. The full copied log has two
URLs redacted and a clearly separated root runner-completion receipt appended;
that exit/database-cleanup receipt was not part of pnpm stdout.

The local preview stand removes provider keys from its child environment and uses
local-only routes/placeholder image configuration. Its recorded provider calls
after repair: 0. No additional paid call is planned. No default database mutation,
credential change, deployment, external publication or dependency addition is part
of this continuation. The retained database is identified by name in `run.json`;
no connection URL or credential is needed in this report. The recorded
[evidence leak audit](evidence/stage-450-live-2026-10-30/evidence-audit.json) checked 83 live
text files against 2 opaque runtime secrets and recorded 0 violations; the audit did
not read credential files or print secret values.

The [final validation receipt](evidence/stage-450-live-2026-10-30/validation.json)
records the complete exit0 run. Package identity is recorded in
[package.sha256](evidence/stage-450-live-2026-10-30/package.sha256); the live handoff
holds its digest and is excluded from the manifest to avoid self-reference.

**PASS** for the scoped live transport/accounting, remediated checks and explicitly
corrected preview. Original first-generation readiness failed; human acceptance
remains pending.
