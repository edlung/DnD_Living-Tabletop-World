# Gate 03 — Retest 4: PASS

## Review header

- **Review ID:** ASTRA-GATE-03-RETEST-4
- **Stage/Gate:** Stages 80–90 / Gate 03, Reaction Integrity
- **Commit/Build:** `998887d7c5ecd7ce28b3c01c13a37ee07dbf62f1`; tested at `7c62d0a582acf0ff42f4529a2cd72bab56ae64e6`. HEAD adds only README status, the handoff and remediation report; implementation is identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** [handoff](../handoffs/ASTRA_GATE_03_REQUEST.md), [remediation](../remediation/OPUS_GATE_03_REMEDIATION.md) (Remediation for Retest 4), [initial report](ASTRA_GATE_03_REPORT.md), [Retest 1](ASTRA_GATE_03_RETEST_1.md), [Retest 2](ASTRA_GATE_03_RETEST_2.md) and [Retest 3](ASTRA_GATE_03_RETEST_3.md). Builder claims were treated as non-authoritative.
- **Surfaces tested:** Combat/reaction commands, current and historical undo, version marking/decoding, mixed histories, concurrency, replay/re-decision, outside-caster legality and context, command-result isolation, scoped knowledge/memory reads, authenticated HTTP and PostgreSQL reload.
- **Overall result:** PASS
- **Required surfaces unavailable:** None in the current backend scope. HTTP probes use actual authenticated Fastify handlers through `inject()` and PostgreSQL; a separately listening deployment and later UI surfaces are not certified.
- **Owner-approved dispositions:** [ADR 0006](../docs/adr/0006-temporal-model-and-undo.md), retest 3 amendment, makes every standing earlier-writer command depend on everything before it. [ADR 0007](../docs/adr/0007-world-kernel-model-and-event-store.md) defines the corresponding version boundary and preserves earlier recorded decisions. [ADRs 0015](../docs/adr/0015-combat-engine.md)/[0016](../docs/adr/0016-reaction-engine.md) retain `TARGET_IN_COMBAT` for outside casters in every fight phase, gridless Detect Magic exclusion in combat, and the declared reaction exclusions. These are accepted contracts, not newly waived findings.

## Retest decision

**G03-H07 is closed under the owner-approved conservative historical-undo contract. G03-H01–H06 remain closed in the exercised regressions. No blocking finding remains.**

The complete suites pass: **976 unit tests and 48 PostgreSQL integration tests**. Independent evidence adds **54 state cases, 31 HTTP/PostgreSQL cases, 27 boundary comparisons across 66 worlds, 24 genuine-writer/PostgreSQL cases, and 18 historical-boundary groups containing 547 undo attempts**. All five saved recipes were executed from their final Markdown form.

Authority remains `ARCHITECTURE_INVARIANTS.md`, ADRs 0006–0007, 0009, 0011–0013 and 0015–0016 with their accepted amendments, and `docs/GATE_COVERAGE.md`. Only this report and its new evidence were added; implementation, existing tests, historical fixtures, handoff, remediation and earlier reports were preserved.

## H07 closure and adjacent attacks

The original three attacks now return **HTTP 422 / `UNDO_UNSAFE`**, name the still-effective old cast and leave the complete snapshot unchanged. This holds for undo of target revival, target placement and caster `EnterLocation` beneath a genuine `88d8137` Hunter's Mark. After restarting the current reader, the original writer's re-decision oracle still reports no divergence. Undoing the cast first, then its premise, succeeds and survives another restart.

The same recipe independently generates histories with actual writers `88d8137`, `b38cbbc`, `e893497` and current `998887d`. Each writer covers the original three variants, target creation, actual Healing Word on an injured non-combatant, and a Detect Magic compatibility/continuation scenario. Every original command-boundary state digest agrees between its writer and the current reader. Stored history is not rewritten.

| Boundary                                   | Independent result                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original H07 and adjacent healing/creation | All 20 targeted premise-undo attempts are refused atomically with the cast named. Original-rule checks remain valid after refusal; explicit reverse recovery and reload pass. Evidence: [history results](evidence/gate-03/retest-4/history-results.json), especially `H07-88d8137-status`, `H07-88d8137-placement`, `H07-88d8137-caster-placement` and `H07-88d8137-healing-status`.                                  |
| Earlier commands beyond outside spells     | Five genuine fixtures from four historical revisions cover examinations, negative sensing, attacks, turns, reactions, spells and DM authoring. All **547** effective undoable commands are tried on separate forks: **542 refusals** have exactly the expected later standing commands as blockers; **5 newest-command undos** succeed. This also protects old commands whose recorded premises were already complete. |
| Mixed histories                            | On each fixture, an earlier current note can be undone while a later independent current note stands. The latest old command can also be undone beneath an unrelated current note. A current knowledge record naming an old entity blocks its creation's undo; removing that dependency permits recovery while unrelated current knowledge remains.                                                                    |
| Version marking and compatibility          | Current normal events use version **2**, and `PremisesRecorded` uses **3**. Earlier normal version 1 and premise versions 1/2 load; legacy `placement` keeps its recorded meaning and cannot be newly written. Unknown versions are rejected. Fresh historical-continuation events carry their current type versions and are not marked `writtenEarlier`.                                                              |
| Independent historical audit               | A synthetic in-memory current undo beneath an old command is detected. Removing that blocker later does not erase the earlier violation. Newest-first current undo and old-writer compensation records remain valid. These synthetic records test the checker only; they are never persisted or presented as genuine history.                                                                                          |
| Concurrency                                | Both race orders between current dependency creation and undo of an old entity produce one accepted winner, one conflict/rejected loser and valid replay. When dependency creation wins, undo returns `UNDO_UNSAFE`; when undo wins, the new reference is rejected.                                                                                                                                                    |

The production boundary is `writtenEarlier` in [event versions](../packages/domain/src/kernel/event-versions.ts), the standing-command guard in [undo](../packages/domain/src/kernel/decide/undo.ts), and the temporal audit in [earlier-writers](../packages/domain/src/kernel/verification/earlier-writers.ts). The independent fixture probe derives expected blocker sets from command ordering and effectiveness; it does not use the production blocker finder. Current commands retain their ordinary precise dependency checks.

## Disposition of previous findings

| Finding                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G03-H01 — invalid reopening**                         | Remains closed. Closure/status/time matrix, reverse recovery, unrelated knowledge, both reopening/status race orders and database reload pass.                                                                                                                                                                                                                                         |
| **G03-H02 — missed attack loses defense premise**       | Remains closed. AC and Prone-target misses protect their dependencies; reverse recovery and the AC database case pass. The broad historical probe also covers the old missed-attack fixture.                                                                                                                                                                                           |
| **G03-H03 — Detect Magic range leak**                   | Remains closed. Immediate/suspended/countered 30/35/50-ft cases, gridless exclusion and post-combat discovery pass. PLAYER/PARTY knowledge and PLAYER memories remain correctly filtered after reload.                                                                                                                                                                                 |
| **G03-H04 — outside-caster target dependencies**        | Remains closed for fresh commands: both targeted spells protect target creation/revival/placement and caster placement, with and without an unrelated fight. All 16 combinations pass in state and HTTP checks. Actual healing uses a non-combatant patient. Historical protection is covered by H07 above.                                                                            |
| **G03-H05 — old history fails to load**                 | Remains closed. Genuine version-1 `placement` and later `unreached` payloads load with identical prefix states, including compensated history. Current continuation, schema rejection, old-clue protection and reverse recovery pass.                                                                                                                                                  |
| **G03-H06 — outside healing reveals a window**          | Remains closed under the accepted targeting contract. Both targeted spells return `ILLEGAL_ACTION / TARGET_IN_COMBAT` in either fight phase; no-fight controls succeed. Full/injured, self/non-combatant, Detect Magic, absent/incapacitated precedence and complete context comparisons pass. Eleven other player-command probes preserve window isolation and protected fight state. |
| **G03-H07 — unsafe current undo beneath old decisions** | **Closed**, including the original three reproductions, creation/healing controls, complete old records, mixed histories, explicit reverse recovery and both race orders.                                                                                                                                                                                                              |

Repeated examination/sensing and unreached-clue undo also remain protected. Current replay, structural/window integrity, the historical-undo audit and effective-command re-decision pass in the relevant independent probes. Re-decision deliberately folds old commands under the accepted compatibility policy; its success alone is not used as evidence of historical dependency safety.

## Validation and reproducible artifacts

| Validation                                                                                                                                            | Result                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                                                                                                                                           | PASS — 84 files, 976 tests                                              |
| `pnpm test:integration`                                                                                                                               | PASS — 11 files, 48 tests                                               |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                                                                                           | PASS                                                                    |
| `pnpm context-budget`                                                                                                                                 | PASS — 278 active files; none over 500/700 lines                        |
| `pnpm format:check`                                                                                                                                   | PASS after formatting the new review artifacts                          |
| [State recipe](evidence/gate-03/retest-4/STATE_PROBES.md) / [results](evidence/gate-03/retest-4/state-results.json)                                   | PASS — 54 cases                                                         |
| [HTTP/PostgreSQL recipe](evidence/gate-03/retest-4/HTTP_POSTGRES_PROBES.md) / [results](evidence/gate-03/retest-4/http-postgres-results.json)         | PASS — 31 cases/databases                                               |
| [Outside-caster boundary recipe](evidence/gate-03/retest-4/BOUNDARY_PROBES.md) / [results](evidence/gate-03/retest-4/boundary-results.json)           | PASS — 27 comparisons, 66 worlds                                        |
| [Genuine-writer recipe](evidence/gate-03/retest-4/HISTORY_PROBES.md) / [results](evidence/gate-03/retest-4/history-results.json)                      | PASS — 24 cases/databases: 4 compatibility and 20 protected-undo cases  |
| [Historical-boundary recipe](evidence/gate-03/retest-4/LEGACY_BOUNDARY_PROBES.md) / [results](evidence/gate-03/retest-4/legacy-boundary-results.json) | PASS — 18 groups, including all 547 effective undoable fixture commands |

[Results index](evidence/gate-03/retest-4/results.json) records exact revisions, counts, dispositions and execution limits. The first three recipes carry forward prior independent attacks and rerun them against this revision; the historical recipes extend coverage for H07.

Historical writer dependencies were installed in isolated Git archives from the frozen offline cache. Every probe database and temporary archive was owned and removed by its probe; development data was not reset. The root dependency reinstall, full CI wrapper and live deployment were not run.

## Coverage ledger and future obligations

| Due surface                                                                       | Evidence / disposition                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Reaction eligibility, expiry, stale/late/repeated answers, Reaction/slot spending | Complete reaction/rules suites pass.                                                                          |
| Concurrent answers/close, multiple candidates, winning orders                     | Existing two-engine unit/PostgreSQL suites and independent reopening/status races pass.                       |
| Ordering, idempotency, replay, as-of history and restart                          | Complete suites, independent replay/re-decision and authenticated reload checks pass.                         |
| Earlier writers, versions, compensated history, continuation and undo             | Genuine-writer prefix comparisons, 547 fixture undo attempts, mixed histories, temporal audit and races pass. |
| Open-window undo, reopening and related/unrelated authoring                       | Independent H01 matrix, reverse recovery and reload pass.                                                     |
| Stage 80 encounters, movement, attacks, spells, conditions, death saves and views | Complete combat suites and independent H02–H04/range checks pass.                                             |
| Outside-caster command/context isolation                                          | Independent H06 matrix passes under the amended visibility/targeting contract.                                |
| Gate 01/02 permissions, knowledge, memory, context and contradictions             | Prior suites rerun; independent authenticated range/acquisition and negative-premise checks pass.             |

Future surfaces remain **NOT YET IN SCOPE**, not passed:

| Surface                                                                                | Introduction / next review                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI contexts, proposals, validation, confirmation, continuity, provenance and safe undo | Stages 100–120 / Gate 04                                                                                                                          |
| Runtime NPC dialogue/actions and supplied-context isolation                            | Stage 130 / Gate 04                                                                                                                               |
| Relevance ranking                                                                      | Stage 140 / Gate 05 integration                                                                                                                   |
| Asset identity, metadata, lineage and historical visual state                          | Stages 150–160 / Gate 05                                                                                                                          |
| Chronicle/flashback retrieval                                                          | Stage 170 / Gate 05                                                                                                                               |
| Complete backend Ravenford integration                                                 | Stage 180 / Gate 05, reviewed at Stage 190                                                                                                        |
| UI consumers, stale prompts and perspective changes                                    | Stages 200–230, combat UX at 220 / introducing-stage boundary/E2E regressions and Stage 250 release evidence; reopen affected gates when required |
| Other/monster reactions, chains, outside-combat windows and timers                     | Unscheduled ADR 0016 exclusions / first gate after introduction                                                                                   |
| Production authentication                                                              | Its own ADR before deployment / Gate 05 at the latest, per handoff                                                                                |

## Final summary

- **New findings:** 0 Critical, 0 High, 0 Medium, 0 Low.
- **Exact blockers:** None. H01–H07 are closed within the reviewed scope and accepted contracts.
- **Invariants exercised:** 1, 4–6, 7–12, 13 and 20 through this gate and earlier regression suites. No violation was demonstrated in this retest.
- **Residual risk:** Finite tests do not exhaust possible histories or future command types. The conservative contract intentionally requires extra reverse-order undo for old records, including complete ones. It prevents new unsafe undo; it does not retroactively repair a previously stored invalid history. Old compensation records remain as recorded. Future decision/payload changes must maintain version and dependency boundaries and reopen affected coverage when necessary.

**Recommendation: PASS.** Gate 03 no longer blocks the owner from authorizing Stage 100. Under `EFFORT_MATRIX.md`, that stage uses **Claude Opus 5.5 / HIGH**. PASS does not itself authorize or start it; no implementation or later-stage work was performed. Review stops here.

PASS
