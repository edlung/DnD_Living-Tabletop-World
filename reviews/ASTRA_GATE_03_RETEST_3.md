# Gate 03 — Retest 3: FAIL

## Review header

- **Review ID:** ASTRA-GATE-03-RETEST-3
- **Stage/Gate:** Stages 80–90 / Gate 03, Reaction Integrity
- **Commit/Build:** `e893497fef95e53ec54f4baa0a314a341d09515b`; tested at `c4d3419676f7f3b498ac7a5ffdacda29a8ba8643`. HEAD adds only README status, the handoff and remediation report; implementation is identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** `handoffs/ASTRA_GATE_03_REQUEST.md`, `remediation/OPUS_GATE_03_REMEDIATION.md` (Remediation for Retest 3), [initial report](ASTRA_GATE_03_REPORT.md), [Retest 1](ASTRA_GATE_03_RETEST_1.md) and [Retest 2](ASTRA_GATE_03_RETEST_2.md). Builder claims were treated as non-authoritative.
- **Surfaces tested:** Combat/reaction commands, outside-caster legality and context, command-result isolation, undo, concurrency, replay/re-decision, knowledge/memory reads, authenticated HTTP, PostgreSQL reload, per-type schema guards and genuine historical writers.
- **Overall result:** FAIL
- **Required surfaces unavailable:** None in the current backend scope. HTTP probes use actual authenticated Fastify handlers through `inject()` and PostgreSQL. Later surfaces remain explicitly out of scope below.
- **Owner-approved dispositions:** ADRs 0015/0016 now permit a witness to learn that a perceived target is fighting: an outside caster receives `TARGET_IN_COMBAT` in every fight phase. Reaction-window information remains forbidden. ADR 0007 preserves earlier writers' recorded decisions instead of judging them by changed rules; ADR 0013 defines the legacy `placement` footprint. Gridless Detect Magic and ADR 0016 §6 exclusions remain unchanged. **None accepts unsafe undo beneath an old cast.**

## Retest decision

**The original G03-H05 loading failure and G03-H06 window disclosure are closed in the exercised cases. A new High finding, G03-H07, blocks the gate:** the current engine accepts undo that removes the status or placement premises of a legitimate old Hunter's Mark. The old cast remains effective, although even the original writer's rules now reject it.

The complete suites pass: **949 unit tests and 44 integration tests**. Independent evidence adds **54 state cases, 31 HTTP/PostgreSQL cases, 27 boundary comparisons across 66 worlds, and 15 historical-writer/PostgreSQL cases**. Historical probes generate their streams using actual revisions `88d8137`, `b38cbbc` and the current implementation. They do not fabricate, rewrite or repair stored events.

Authority remains `ARCHITECTURE_INVARIANTS.md`, ADRs 0006–0007, 0009, 0011–0013 and 0015–0016 with their accepted amendments, and `docs/GATE_COVERAGE.md`. Only this report and its new evidence were added; source, existing tests, handoffs, remediation and previous reports were preserved.

## Disposition of previous findings

| Finding / boundary                                | Independent result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G03-H05 — old history fails to load**           | **Original reproduction closed.** Real version-1 `placement` events from `88d8137` and version-1 `unreached` events from `b38cbbc` load through the current PostgreSQL reader. Old and current state digests agree at every old command boundary, including compensated casts. HTTP reads, current continuation, version-2 writes, old-clue undo blockers and reverse-order recovery pass. Unknown versions and version-2 legacy payloads are rejected. **Historical undo has a separate remaining gap, H07 below.** |
| **G03-H06 — outside healing reveals a window**    | **Closed under the owner-approved revised contract.** Both targeted spells at a combatant return `ILLEGAL_ACTION / TARGET_IN_COMBAT` with and without an open window; no-fight controls are accepted. Full-health and injured cases, self/non-combatant targets, Detect Magic, absent/incapacitated precedence, complete context comparisons and authenticated HTTP checks pass. Eleven other player-command probes also preserve window isolation and protected state.                                              |
| **G03-H01 — invalid reopening**                   | Remains closed. Independent closure/status/time matrix, reverse recovery, unrelated knowledge, both reopening/status race orders and PostgreSQL reload pass.                                                                                                                                                                                                                                                                                                                                                         |
| **G03-H02 — missed attack loses defense premise** | Original reproduction remains closed. AC and Prone-target misses retain dependencies and recover in reverse order; the AC case also passes database reload.                                                                                                                                                                                                                                                                                                                                                          |
| **G03-H03 — Detect Magic range leak**             | Remains closed. Immediate/suspended/countered 30/35/50-ft cases, gridless exclusion and post-combat discovery pass. PLAYER/PARTY knowledge and PLAYER memories remain correctly filtered after reload.                                                                                                                                                                                                                                                                                                               |
| **G03-H04 — outside-caster target dependencies**  | Fresh-current reproduction remains closed: both spells protect target creation/revival/placement and caster placement, with and without an unrelated fight. All 16 combinations pass in state and HTTP tests. Real-healing controls use a non-combatant patient to respect the new ADR. **Old accepted commands still lose status/placement protection as H07.**                                                                                                                                                     |
| **Adjacent negative premises / named records**    | Repeated examination/sensing, unreached clue undo and post-combat stat-block authoring remain protected. The new named-entity footprint blocks deletion of the old Hunter's Mark target in the independent existence control. It does not protect the other historical target/caster premises demonstrated below.                                                                                                                                                                                                    |

The H06 boundary probe covers all supported player-command families besides the separately tested spell matrix: movement between locations, all three examination methods, asking, hypothesis formation, combat movement, attack, end turn and both reaction answers. It compares identical visible states with/without a window, checks replay and effective-command re-decision, and asserts that accepted outside actions leave the encounter, windows, clock and combatant facts unchanged.

## Blocking finding

### [G03-H07] Current undo invalidates the original legality of old outside-encounter spells

- **Severity:** High
- **Invariants:** 1 — **WORLD ENGINE IS AUTHORITY**; 12 — **WORLD HISTORY IS RECONSTRUCTABLE**. Violates ADR 0006 §8's dependency-preserving undo contract. ADR 0007's compatibility amendment permits preserving decisions made under earlier rules; it does not permit a new undo to invalidate premises those same earlier rules required.
- **Category:** Rollback / Rules / Timeline
- **Relationship to prior review:** Adjacent to H05's restored historical-read surface and its named-record remediation. It is the H04 missing-premise class on supported old commands, not a failure of the fresh-current H04 fix. Deletion of an old target is now blocked; revival and placement reversal are not.
- **Preconditions:** A genuine stream written by `88d8137401451dd6a6d6703217bf53e273a2ede4` contains an outside-encounter Hunter's Mark. The caster and its target are not combatants; a separate encounter is active. The old writer accepted the cast while its target was alive and present.
- **Steps to reproduce:**
  1. Run that exact old revision against a migrated throwaway PostgreSQL database and seed Ravenford.
  2. Through authenticated DM commands, place the ambush entities and start the fight with the goblins, excluding Elowen.
  3. Create NPC `legacy-bystander` on the Old Trade Road. Mark it dead, then restore it to active; retain the revival command ID.
  4. Through Elowen's authenticated player endpoint, cast Hunter's Mark at the bystander. The old engine accepts it, reloads it successfully and reports no effective-command divergence under its own rules.
  5. Open the same database with the current engine. As DM, submit `UndoCommand` for the revival, leaving the cast effective.
  6. Restart the current engine. Inspect target status, concentration and command effectiveness. Independently run the original writer's read-only re-decision oracle on this same stream.
- **Expected behavior:** Step 5 returns HTTP 422 / `UNDO_UNSAFE`, names the old cast as a blocker and changes no state. Preserving old decisions requires preserving their old legality premises when processing new undo commands. Explicitly undoing dependent commands first is the supported route.
- **Actual behavior:** The **current** endpoint returns HTTP 200 / `accepted`. After restart, the bystander is dead, Elowen still has `concentration: { spellId: "hunters-mark", targetId: "legacy-bystander" }`, and the cast's `undoneBy` remains null. Current structural/window checks, replay equality and the current re-decision oracle all pass. The genuine old writer's oracle changes from no divergence before this undo to **`no longer accepted: TARGET_DEAD`** at the still-effective cast afterward.
- **Adjacent variants:** Undoing the target's `PlaceEntity` leaves it unplaced under the active mark. Undoing Elowen's `EnterLocation` moves her back to the road while the target remains at the inn, invalidating their co-presence at the cast. Both undos are accepted by the current HTTP endpoint, persist after restart and cause **`no longer accepted: ILLEGAL_ACTION`** in the original writer's oracle.
- **Evidence:** [Historical-writer recipe](evidence/gate-03/retest-3/HISTORY_PROBES.md), [machine-readable results](evidence/gate-03/retest-3/history-results.json), keys `H07-88d8137-status`, `H07-88d8137-placement` and `H07-88d8137-caster-placement`. The recipe separately proves that the old and current readers reconstruct identical pre-undo states, then performs the unsafe mutation only through the current authenticated API.

| Variant          | Old premise command              | Old cast command                  | Current accepted undo                          | Original writer's post-undo verdict |
| ---------------- | -------------------------------- | --------------------------------- | ---------------------------------------------- | ----------------------------------- |
| Revival          | `http:dm-ravenford:r3-legacy-9`  | `http:player-elowen:r3-legacy-10` | `http:dm-ravenford:r3-current-1`, sequence 115 | `TARGET_DEAD`                       |
| Target placement | `http:dm-ravenford:r3-legacy-8`  | `http:player-elowen:r3-legacy-9`  | `http:dm-ravenford:r3-current-1`, sequence 113 | `ILLEGAL_ACTION`                    |
| Caster placement | `http:player-elowen:r3-legacy-8` | `http:player-elowen:r3-legacy-9`  | `http:dm-ravenford:r3-current-1`, sequence 115 | `ILLEGAL_ACTION`                    |

Each row uses a separate database. Its current undo event ID is `00000000-0065-4000-8000-000000000001`; the repeated ID is confined to independent test databases.

- **Controls:** Undoing creation of the old target correctly returns `UNDO_UNSAFE` and names the cast. Equivalent creation/status/target-placement/caster-placement scenarios genuinely written by `b38cbbc` and by the current implementation all reject unsafe undo atomically. The target is a bystander in every case, so the new prohibition on targeting combatants does not explain the failure.
- **Cause/boundary:** The old version-1 cast records the unrelated fight's combatant vitals, not its actual target/caster placement premises. The new narrative footprint in `packages/domain/src/kernel/facts.ts:301–311` adds only named entities' **existence** to `SpellCast` and other narrative records. It therefore catches target deletion but not the target status or either placement change. The compatibility branch at `packages/domain/src/kernel/verification/redecide.ts:76–82` folds old commands without re-deciding them; folding checks entity existence but not this original legality. That branch implements the accepted compatibility policy, yet cannot serve as evidence that historical undo is safe.
- **Impact:** A newly accepted undo can leave an upgraded campaign with a canonical cast that was impossible under the very rules that originally accepted it. The incorrect current canon persists across processes while every current integrity oracle used here reports success. This is a dependency violation in the current writer, not merely a previously stored invalid event or a difference between old and new targeting rules.
- **Suggested remediation direction:** Make current undo protect the complete dependencies of supported historical commands, including the target's required status and both participants' placement. Use historical command/event information or conservative compatibility footprints without rewriting accepted history or judging old commands by changed gameplay rules. Extend the historical audit beyond fold preconditions and named-entity existence; preserve the oracle's documented rule-version distinction.
- **Regression test required:** **Yes** — `current_undo_preserves_old_spell_legality_premises`. Use genuine `88d8137` rows for all three variants plus the creation control. Assert atomic `UNDO_UNSAFE` with the old cast named, reverse-order recovery, reload and checks against the original writer's rules. Retain `b38cbbc` and current-writer controls. Audit other historically incomplete premises, including applicable Healing Word and missed-attack histories, without claiming those untested variants as findings here.

## Validation and reproducible artifacts

| Validation                                                                  | Result                                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                 | PASS — 82 files, 949 tests                                                                                                  |
| `pnpm test:integration`                                                     | PASS — 10 files, 44 PostgreSQL tests                                                                                        |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                 | PASS                                                                                                                        |
| `pnpm context-budget`                                                       | PASS — 274 active files; none over 500/700 lines                                                                            |
| `pnpm format:check`                                                         | PASS after formatting the new review artifacts                                                                              |
| [State recipe](evidence/gate-03/retest-3/STATE_PROBES.md)                   | 54 cases passed: prior reproductions, undo recovery, range/completion and negative premises                                 |
| [HTTP/PostgreSQL recipe](evidence/gate-03/retest-3/HTTP_POSTGRES_PROBES.md) | 31 cases passed: prior fixes, authenticated context/results and reload                                                      |
| [Boundary recipe](evidence/gate-03/retest-3/BOUNDARY_PROBES.md)             | 27 comparisons / 66 worlds passed: H06 injury/target matrix, context, precedence and other player commands                  |
| [Historical-writer recipe](evidence/gate-03/retest-3/HISTORY_PROBES.md)     | 15 cases completed: H05 compatibility passes; H07 deliberately reproduced in three variants, with nine target-undo controls |

[Results index](evidence/gate-03/retest-3/results.json) records exact revisions, counts and evidence paths. All four recipes were executed from their final Markdown form. H07 assertions intentionally confirm the unsafe behavior: successful recipe execution is evidence for **FAIL**, not a passing gate.

Historical probes archive old revisions to temporary directories and install their frozen dependencies from the offline cache. Each PostgreSQL probe creates and drops its own database; no development data was reset. The root dependency reinstall, full CI wrapper, live network listener and deployment were not run. The existing integration suite also exercises the repository's historical fixture; the independent historical evidence above was freshly generated by genuine writers.

## Coverage ledger and future obligations

| Due surface                                                                          | Evidence / disposition                                                                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility, expiry, late/stale/repeated answers, Reaction/slot spending             | Complete reaction/rules suites pass                                                                                                 |
| Concurrent responses/close, multiple candidates and winning orders                   | Existing two-engine unit/PostgreSQL suites and independent reopening/status races pass                                              |
| Current ordering, idempotency, replay, as-of history and restart                     | Complete suites and independent replay/re-decision pass                                                                             |
| Earlier writers, schema versions, compensated history, continuation and undo         | Old/current prefix-state comparisons, reads, continuation and schema guards pass; **historical status/placement undo fails as H07** |
| Open-window undo, reopening and related/unrelated authoring                          | Independent H01 matrix, reverse recovery and reload pass                                                                            |
| Stage 80 movement, attacks, spells, conditions and death saves                       | Complete suites pass; fresh H02/H04 and Detect Magic scenarios pass                                                                 |
| Outside-caster command/context isolation                                             | Independent H06 matrix passes under the amended visibility/targeting contract                                                       |
| Prior Gate 01/02 permission, knowledge, memory, context and contradiction boundaries | Full prior suites rerun; authenticated range/acquisition checks pass. Their success does not waive H07                              |

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

- **Findings:** 0 Critical, **1 High**, 0 Medium, 0 Low.
- **Exact blocker:** **G03-H07**; no owner-approved exception accepts it.
- **Prior findings:** H05's unreadable-history reproduction and H06's disclosure are closed. H01–H04 fresh-current checks remain closed; historical undo remains unsafe in the three demonstrated variants.
- **Invariants exercised:** 1, 4–6, 7–12, 13 and 20 through this gate and earlier regression suites. H07 violates **1 and 12**.
- **Residual risk:** Historical fold success proves readability and structural applicability, not preservation of all original decision premises after a new undo. Current re-decision intentionally skips old decisions; historical dependency tests need an additional oracle. Finite tests do not exhaust historical writers or mixed encounter activity.

Return to **Opus/MAX** for failing regressions and remediation, then request **Astra/MAX Retest 4** targeting `reviews/ASTRA_GATE_03_RETEST_4.md`. Preserve this report and all earlier evidence. **Stage 100 remains blocked.** No implementation fixes or later-stage work were performed; review stops here.

FAIL
